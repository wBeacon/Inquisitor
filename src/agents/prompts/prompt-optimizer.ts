/**
 * Prompt Optimizer - 智能截断与 diff 语义压缩
 *
 * 设计原则：
 * 1. 当 prompt 超过目标模型上下文窗口阈值时，按优先级策略截断
 *    优先级：保留核心 diff > 保留共享指令 > 保留项目上下文
 * 2. 对 diff 上下文进行语义压缩（移除空行/注释行/import 语句中的重复部分）
 *    压缩率 >= 15%，且不丢失关键代码变更信息（+/- 行全保留）
 * 3. 集成到 AgentRunner.callLLM 流程中，自动执行预估和优化
 */

import { TokenCounter } from '../../utils/token-counter';
import { TokenManager } from './token-manager';

/**
 * 优化后的 prompt 结果
 */
export interface OptimizedPrompt {
  /** 优化后的系统提示 */
  systemPrompt: string;
  /** 优化后的用户消息 */
  userMessage: string;
  /** 原始输入 token 数 */
  originalTokens: number;
  /** 优化后输入 token 数 */
  optimizedTokens: number;
  /** 压缩率（百分比） */
  compressionPercentage: number;
  /** 是否执行了截断 */
  wasTruncated: boolean;
  /** 是否执行了压缩 */
  wasCompressed: boolean;
  /** 应用的优化策略 */
  strategiesApplied: string[];
}

/**
 * PromptOptimizer - 智能截断与语义压缩
 */
export class PromptOptimizer {
  private counter: TokenCounter;
  private tokenManager: TokenManager;

  constructor() {
    this.counter = TokenCounter.getInstance();
    this.tokenManager = new TokenManager();
  }

  /**
   * 优化 prompt，确保不超出模型上下文窗口
   *
   * 优化流程：
   * 1. 估算当前 token 数
   * 2. 如果在阈值内，对 diff 做语义压缩以节省 token
   * 3. 如果超出阈值，按优先级截断
   *
   * @param systemPrompt 系统提示
   * @param userMessage 用户消息（通常包含 diff 和上下文）
   * @param modelId 模型标识
   * @param maxOutputTokens 预期最大输出 token 数
   * @returns 优化后的 prompt
   */
  optimize(
    systemPrompt: string,
    userMessage: string,
    modelId: string = 'claude-sonnet-4-20250514',
    maxOutputTokens: number = 4000,
  ): OptimizedPrompt {
    // 快速路径：短文本直接做压缩，跳过 token 计数和截断检查
    const totalChars = systemPrompt.length + userMessage.length;
    if (totalChars < 50000) {
      // 50K 字符大约对应 12-15K tokens，远低于任何模型的上下文窗口
      const compressed = this.compressDiffContext(userMessage);
      const wasCompressed = compressed !== userMessage;
      // 使用字符比例粗略估计压缩率
      const compressionPercentage = wasCompressed && totalChars > 0
        ? ((userMessage.length - compressed.length) / totalChars) * 100
        : 0;
      return {
        systemPrompt,
        userMessage: compressed,
        originalTokens: 0, // 跳过精确计数
        optimizedTokens: 0,
        compressionPercentage: Math.max(0, compressionPercentage),
        wasTruncated: false,
        wasCompressed,
        strategiesApplied: wasCompressed ? ['diff-semantic-compression'] : [],
      };
    }

    const originalTokens = this.counter.countPromptTokens(systemPrompt, userMessage).totalTokens;
    const strategies: string[] = [];
    let wasTruncated = false;
    let wasCompressed = false;

    // 第一步：始终对用户消息中的 diff 进行语义压缩
    let optimizedUserMessage = this.compressDiffContext(userMessage);
    if (optimizedUserMessage !== userMessage) {
      wasCompressed = true;
      strategies.push('diff-semantic-compression');
    }

    let optimizedSystemPrompt = systemPrompt;

    // 第二步：检查是否超出上下文窗口
    const config = this.tokenManager.getModelConfig(modelId);
    const targetMaxInput = config.contextWindow - maxOutputTokens;

    let currentTokens = this.counter.countPromptTokens(
      optimizedSystemPrompt,
      optimizedUserMessage,
    ).totalTokens;

    if (currentTokens > targetMaxInput) {
      // 需要截断，按优先级策略执行
      const truncated = this.truncateByPriority(
        optimizedSystemPrompt,
        optimizedUserMessage,
        targetMaxInput,
      );
      optimizedSystemPrompt = truncated.systemPrompt;
      optimizedUserMessage = truncated.userMessage;
      wasTruncated = true;
      strategies.push(...truncated.strategies);

      currentTokens = this.counter.countPromptTokens(
        optimizedSystemPrompt,
        optimizedUserMessage,
      ).totalTokens;
    }

    const compressionPercentage =
      originalTokens > 0
        ? ((originalTokens - currentTokens) / originalTokens) * 100
        : 0;

    return {
      systemPrompt: optimizedSystemPrompt,
      userMessage: optimizedUserMessage,
      originalTokens,
      optimizedTokens: currentTokens,
      compressionPercentage: Math.max(0, compressionPercentage),
      wasTruncated,
      wasCompressed,
      strategiesApplied: strategies,
    };
  }

  /**
   * 对 diff 上下文进行语义压缩
   *
   * 压缩策略（不丢失关键代码变更信息）：
   * - 保留所有 +/- 开头的变更行
   * - 移除上下文中的纯空行
   * - 移除上下文中的纯注释行（未被修改的注释）
   * - 去除 import 语句中的重复部分
   * - 移除连续的空白上下文行（保留最多 1 行作为分隔）
   *
   * @param text 包含 diff 内容的文本
   * @returns 压缩后的文本
   */
  compressDiffContext(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    let lastWasBlank = false;
    const seenImports = new Set<string>();

    for (const line of lines) {
      const trimmed = line.trim();

      // 始终保留变更行（+/- 开头）和 diff 元数据行
      if (this.isChangeLine(trimmed) || this.isDiffMetadata(trimmed)) {
        result.push(line);
        lastWasBlank = false;
        continue;
      }

      // 始终保留 hunk header 行 (@@ ... @@)
      if (trimmed.startsWith('@@') && trimmed.includes('@@')) {
        result.push(line);
        lastWasBlank = false;
        continue;
      }

      // 上下文中的纯空行：最多保留1行
      if (trimmed === '' || trimmed === ' ') {
        if (!lastWasBlank) {
          result.push(line);
          lastWasBlank = true;
        }
        continue;
      }

      // 上下文中的纯注释行：移除（不影响代码语义理解）
      if (this.isCommentLine(trimmed)) {
        continue;
      }

      // 上下文中的 import/require 行：去重
      if (this.isImportLine(trimmed)) {
        // 提取 import 的核心部分用于去重
        const importKey = this.normalizeImport(trimmed);
        if (seenImports.has(importKey)) {
          continue;
        }
        seenImports.add(importKey);
      }

      result.push(line);
      lastWasBlank = false;
    }

    return result.join('\n');
  }

  /**
   * 按优先级截断 prompt
   *
   * 截断优先级（从低到高，先截断低优先级内容）：
   * 1. 项目上下文（如 eslint config、tsconfig 等描述）
   * 2. 共享指令中的示例部分
   * 3. 系统提示的冗余说明
   * 4. 核心 diff（最后截断，始终保留尽可能多的 diff）
   */
  private truncateByPriority(
    systemPrompt: string,
    userMessage: string,
    targetTokens: number,
  ): { systemPrompt: string; userMessage: string; strategies: string[] } {
    const strategies: string[] = [];
    let currentSystem = systemPrompt;
    let currentUser = userMessage;

    // 阶段 1：截断项目上下文（通常在用户消息末尾的附加信息）
    const projectContextMarker = '--- 项目上下文';
    const projectContextIdx = currentUser.indexOf(projectContextMarker);
    if (projectContextIdx !== -1) {
      const beforeContext = currentUser.substring(0, projectContextIdx).trimEnd();
      const currentTokens = this.counter.countPromptTokens(currentSystem, beforeContext).totalTokens;
      if (currentTokens <= targetTokens) {
        currentUser = beforeContext;
        strategies.push('truncate-project-context');
        return { systemPrompt: currentSystem, userMessage: currentUser, strategies };
      }
      currentUser = beforeContext;
      strategies.push('truncate-project-context');
    }

    // 阶段 2：精简系统提示中的示例部分
    const examplePattern = /###\s*(?:示例|Example)[\s\S]*?(?=\n###|\n##|$)/gi;
    const simplifiedSystem = currentSystem.replace(examplePattern, '');
    if (simplifiedSystem !== currentSystem) {
      const currentTokens = this.counter.countPromptTokens(simplifiedSystem, currentUser).totalTokens;
      currentSystem = simplifiedSystem;
      strategies.push('truncate-examples');
      if (currentTokens <= targetTokens) {
        return { systemPrompt: currentSystem, userMessage: currentUser, strategies };
      }
    }

    // 阶段 3：精简系统提示（只保留前 50% 内容）
    const systemLines = currentSystem.split('\n');
    const halfSystemLen = Math.ceil(systemLines.length / 2);
    const truncatedSystem = systemLines.slice(0, halfSystemLen).join('\n');
    {
      const currentTokens = this.counter.countPromptTokens(truncatedSystem, currentUser).totalTokens;
      currentSystem = truncatedSystem;
      strategies.push('truncate-system-prompt');
      if (currentTokens <= targetTokens) {
        return { systemPrompt: currentSystem, userMessage: currentUser, strategies };
      }
    }

    // 阶段 4：截断用户消息中的 diff（保留前面的核心部分）
    // 使用基于字符比例的快速截断，避免在超大文本上逐行二分查找
    const systemTokens = this.counter.countTokens(currentSystem).tokenCount;
    const availableForUser = targetTokens - systemTokens - 8; // 8 为消息格式开销
    if (availableForUser > 0) {
      // 估算每个 token 约对应多少字符
      const userTokens = this.counter.countTokens(currentUser).tokenCount;
      if (userTokens > availableForUser) {
        // 按比例截断字符数
        const ratio = availableForUser / userTokens;
        const targetChars = Math.floor(currentUser.length * ratio * 0.95); // 留 5% 余量
        currentUser = currentUser.substring(0, targetChars) + '\n... [已截断]';
      }
    } else {
      // 系统提示都超出了，用户消息只保留最少
      currentUser = currentUser.substring(0, 100) + '\n... [已截断]';
    }
    strategies.push('truncate-diff');

    return { systemPrompt: currentSystem, userMessage: currentUser, strategies };
  }

  /**
   * 判断是否为变更行（+ 或 - 开头）
   */
  private isChangeLine(trimmed: string): boolean {
    return (
      (trimmed.startsWith('+') && !trimmed.startsWith('+++')) ||
      (trimmed.startsWith('-') && !trimmed.startsWith('---'))
    );
  }

  /**
   * 判断是否为 diff 元数据行
   */
  private isDiffMetadata(trimmed: string): boolean {
    return (
      trimmed.startsWith('diff --git') ||
      trimmed.startsWith('index ') ||
      trimmed.startsWith('---') ||
      trimmed.startsWith('+++') ||
      trimmed.startsWith('new file mode') ||
      trimmed.startsWith('deleted file mode')
    );
  }

  /**
   * 判断上下文行是否为纯注释行
   * 注意：只匹配未修改的上下文行中的注释
   */
  private isCommentLine(trimmed: string): boolean {
    // 常见的单行注释格式
    return (
      trimmed.startsWith('//') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*/') ||
      trimmed.startsWith('<!--')
    );
  }

  /**
   * 判断是否为 import/require 行
   */
  private isImportLine(trimmed: string): boolean {
    return (
      trimmed.startsWith('import ') ||
      trimmed.startsWith('import{') ||
      trimmed.includes('require(') ||
      trimmed.startsWith('from ')
    );
  }

  /**
   * 规范化 import 语句用于去重
   */
  private normalizeImport(trimmed: string): string {
    // 提取 from 'xxx' 部分作为去重键
    const fromMatch = trimmed.match(/from\s+['"]([^'"]+)['"]/);
    if (fromMatch) {
      return `import:${fromMatch[1]}`;
    }
    // require('xxx') 格式
    const requireMatch = trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) {
      return `require:${requireMatch[1]}`;
    }
    return trimmed;
  }
}
