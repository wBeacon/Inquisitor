# Complete Agents Implementation - Full Code Exploration

## 📋 Table of Contents
1. [Agent Core Files](#agent-core-files)
2. [Type Definitions](#type-definitions)
3. [Prompts System](#prompts-system)
4. [Test Files](#test-files)

---

## Agent Core Files

### 1. src/agents/agent-runner.ts

```typescript
import { AgentConfig, AgentResult, ReviewIssue } from '../types';
import { ReviewDimension } from '../types';

/**
 * AgentRunner - 执行代码审查 Agent 的基础类
 * 每个 Agent 在隔离上下文中运行，确保不同 Agent 之间没有相互影响
 */
export abstract class AgentRunner {
  protected config: AgentConfig;
  protected timeout: number;

  constructor(config: AgentConfig, timeout: number = 300000) {
    // 5分钟默认超时
    this.config = config;
    this.timeout = timeout;
  }

  /**
   * 执行审查
   * @param files 要审查的文件路径列表
   * @param context 审查上下文（包含代码内容等）
   * @returns 审查结果
   */
  async review(files: string[], context: string): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      // 调用子类实现的审查逻辑
      const issues = await this.performReview(files, context);

      const durationMs = Date.now() - startTime;

      return {
        agentId: this.config.id,
        issues,
        durationMs,
        tokenUsage: {
          input: 0, // 在实际实现中，这些将由 API 返回
          output: 0,
          total: 0,
        },
        success: true,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      return {
        agentId: this.config.id,
        issues: [],
        durationMs,
        tokenUsage: {
          input: 0,
          output: 0,
          total: 0,
        },
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 由子类实现的实际审查逻辑
   */
  protected abstract performReview(
    files: string[],
    context: string
  ): Promise<ReviewIssue[]>;

  /**
   * 获取 Agent 配置
   */
  getConfig(): AgentConfig {
    return this.config;
  }

  /**
   * 获取 Agent ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * 获取 Agent 名称
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * 获取审查维度
   */
  getDimension(): ReviewDimension | undefined {
    return this.config.dimension;
  }

  /**
   * 格式化输出为 JSON
   */
  protected formatIssuesAsJson(issues: ReviewIssue[]): string {
    return JSON.stringify(issues, null, 2);
  }

  /**
   * 解析 JSON 审查结果
   */
  protected parseJsonIssues(jsonStr: string): ReviewIssue[] {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch (error) {
      console.error('Failed to parse JSON issues:', error);
      return [];
    }
  }
}
```

### 2. src/agents/logic-agent.ts

```typescript
import { AgentRunner } from './agent-runner';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../types';
import { LOGIC_AGENT_PROMPT } from './prompts';

/**
 * LogicAgent - 专注于逻辑正确性审查
 * 检查控制流、数据流、循环、空值处理、类型匹配等逻辑问题
 */
export class LogicAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>) {
    const defaultConfig: AgentConfig = {
      id: config?.id || 'logic-agent',
      name: config?.name || 'Logic Correctness Agent',
      description:
        config?.description ||
        'Specializes in finding logic errors including control flow, data flow, loops, null handling, and type mismatches',
      dimension: ReviewDimension.Logic,
      systemPrompt: config?.systemPrompt || LOGIC_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.5,
    };

    super(defaultConfig);
  }

  /**
   * 执行逻辑审查
   * 在实际实现中，这会调用 Claude Code Agent tool
   */
  protected async performReview(
    files: string[],
    context: string
  ): Promise<ReviewIssue[]> {
    // 这是一个占位符实现
    // 在实际集成中，这会调用 Claude Code 的 Agent tool
    // 并传递 systemPrompt 和代码上下文

    console.log(`LogicAgent reviewing ${files.length} files`);

    // 模拟 Agent 执行
    // 实际实现会：
    // 1. 调用 Claude Code Agent API
    // 2. 传递 systemPrompt 作为 system 角色消息
    // 3. 传递代码上下文和文件列表
    // 4. 解析返回的 JSON 审查结果

    return [];
  }
}
```

### 3. src/agents/security-agent.ts

```typescript
import { AgentRunner } from './agent-runner';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../types';
import { SECURITY_AGENT_PROMPT } from './prompts';

/**
 * SecurityAgent - 专注于安全性审查
 * 检查注入漏洞、XSS、权限绕过、数据泄露等安全问题
 */
export class SecurityAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>) {
    const defaultConfig: AgentConfig = {
      id: config?.id || 'security-agent',
      name: config?.name || 'Security Vulnerabilities Agent',
      description:
        config?.description ||
        'Specializes in identifying security vulnerabilities including injection, XSS, privilege escalation, and data leakage',
      dimension: ReviewDimension.Security,
      systemPrompt: config?.systemPrompt || SECURITY_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.5,
    };

    super(defaultConfig);
  }

  /**
   * 执行安全性审查
   */
  protected async performReview(
    files: string[],
    context: string
  ): Promise<ReviewIssue[]> {
    console.log(`SecurityAgent reviewing ${files.length} files for security vulnerabilities`);
    return [];
  }
}
```

### 4. src/agents/performance-agent.ts

```typescript
import { AgentRunner } from './agent-runner';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../types';
import { PERFORMANCE_AGENT_PROMPT } from './prompts';

export class PerformanceAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>) {
    const defaultConfig: AgentConfig = {
      id: config?.id || 'performance-agent',
      name: config?.name || 'Performance Issues Agent',
      description: config?.description || 'Specializes in identifying performance issues including N+1 queries, memory leaks, and inefficient algorithms',
      dimension: ReviewDimension.Performance,
      systemPrompt: config?.systemPrompt || PERFORMANCE_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.5,
    };
    super(defaultConfig);
  }

  protected async performReview(_files: string[], _context: string): Promise<ReviewIssue[]> {
    console.log(`PerformanceAgent reviewing for performance issues`);
    return [];
  }
}
```

### 5. src/agents/maintainability-agent.ts

```typescript
import { AgentRunner } from './agent-runner';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../types';
import { MAINTAINABILITY_AGENT_PROMPT } from './prompts';

export class MaintainabilityAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>) {
    const defaultConfig: AgentConfig = {
      id: config?.id || 'maintainability-agent',
      name: config?.name || 'Code Maintainability Agent',
      description: config?.description || 'Specializes in identifying maintainability issues including code duplication, complexity, and SOLID violations',
      dimension: ReviewDimension.Maintainability,
      systemPrompt: config?.systemPrompt || MAINTAINABILITY_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.5,
    };
    super(defaultConfig);
  }

  protected async performReview(_files: string[], _context: string): Promise<ReviewIssue[]> {
    console.log(`MaintainabilityAgent reviewing for maintainability issues`);
    return [];
  }
}
```

### 6. src/agents/edge-case-agent.ts

```typescript
import { AgentRunner } from './agent-runner';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../types';
import { EDGE_CASE_AGENT_PROMPT } from './prompts';

export class EdgeCaseAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>) {
    const defaultConfig: AgentConfig = {
      id: config?.id || 'edge-case-agent',
      name: config?.name || 'Edge Cases Agent',
      description: config?.description || 'Specializes in identifying edge cases including null inputs, boundary conditions, and resource exhaustion',
      dimension: ReviewDimension.EdgeCases,
      systemPrompt: config?.systemPrompt || EDGE_CASE_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.5,
    };
    super(defaultConfig);
  }

  protected async performReview(_files: string[], _context: string): Promise<ReviewIssue[]> {
    console.log(`EdgeCaseAgent reviewing for edge cases`);
    return [];
  }
}
```

### 7. src/agents/adversary-agent.ts

```typescript
import { AgentConfig, ReviewIssue, AdversaryResult } from '../types';
import { ADVERSARY_AGENT_PROMPT } from './prompts';

/**
 * AdversaryResult 中的问题判断
 */
export interface IssueJudgment {
  /** 已有问题列表中的索引 */
  existingIssueIndex: number;
  /** 判断结果：confirmed、disputed、false_positive */
  judgment: 'confirmed' | 'disputed' | 'false_positive';
  /** 判断理由 */
  reason: string;
  /** 建议的置信度调整 */
  suggestedConfidenceAdjustment?: number;
  /** 建议的严重程度调整 */
  suggestedSeverityAdjustment?: string;
}

/**
 * AdversaryAgent 的审查响应格式
 */
export interface AdversaryReviewResponse {
  /** 新发现的问题 */
  newIssues: ReviewIssue[];
  /** 对已有问题的判断 */
  issueJudgments: IssueJudgment[];
}

/**
 * AdversaryAgent - 对抗式审查 Agent
 * 以全新的、完全独立的视角审视代码，寻找被遗漏的问题并质疑已有结论
 */
export class AdversaryAgent {
  private config: AgentConfig;
  private timeout: number;

  constructor(config?: Partial<AgentConfig>) {
    const defaultConfig: AgentConfig = {
      id: config?.id || 'adversary-agent',
      name: config?.name || 'Adversary Code Review Agent',
      description:
        config?.description ||
        'Operates in completely isolated context to find missed issues and challenge existing conclusions',
      systemPrompt: config?.systemPrompt || ADVERSARY_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.7, // 略高的温度以鼓励创意思考
    };

    this.config = defaultConfig;
    this.timeout = config?.maxTokens ? config.maxTokens * 100 : 300000;
  }

  /**
   * 执行对抗审查
   * @param files 待审查的文件列表
   * @param context 审查上下文
   * @param existingIssues 其他 Agent 发现的问题
   * @returns 对抗审查结果
   */
  async challenge(
    files: string[],
    context: string,
    existingIssues: ReviewIssue[]
  ): Promise<AdversaryResult> {
    const startTime = Date.now();

    try {
      // 在实际实现中，这会调用 Claude Code Agent tool
      // 传递 ADVERSARY_AGENT_PROMPT 作为 system prompt
      // 以及已有的问题列表作为输入

      const result = await this.performAdversaryReview(files, context, existingIssues);

      const durationMs = Date.now() - startTime;

      return {
        agentId: this.config.id,
        issues: result.newIssues,
        durationMs,
        tokenUsage: {
          input: 0,
          output: 0,
          total: 0,
        },
        success: true,
        falsePositives: result.issueJudgments
          .filter((j) => j.judgment === 'false_positive')
          .map((j) => j.existingIssueIndex),
        confidenceAdjustments: result.issueJudgments
          .filter((j) => j.suggestedConfidenceAdjustment !== undefined)
          .map((j) => ({
            issueIndex: j.existingIssueIndex,
            newConfidence: j.suggestedConfidenceAdjustment || 0,
            reason: j.reason,
          })),
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      return {
        agentId: this.config.id,
        issues: [],
        durationMs,
        tokenUsage: {
          input: 0,
          output: 0,
          total: 0,
        },
        success: false,
        error: error instanceof Error ? error.message : String(error),
        falsePositives: [],
        confidenceAdjustments: [],
      };
    }
  }

  /**
   * 执行对抗审查的实际逻辑
   */
  private async performAdversaryReview(
    _files: string[],
    _context: string,
    _existingIssues: ReviewIssue[]
  ): Promise<AdversaryReviewResponse> {
    // 占位符实现
    // 实际实现会调用 Claude Code Agent tool
    console.log(`AdversaryAgent reviewing ${_files.length} files with ${_existingIssues.length} existing issues`);

    return {
      newIssues: [],
      issueJudgments: _existingIssues.map((_, index) => ({
        existingIssueIndex: index,
        judgment: 'confirmed' as const,
        reason: 'Confirmed by adversary review',
      })),
    };
  }

  /**
   * 获取 Agent 配置
   */
  getConfig(): AgentConfig {
    return this.config;
  }

  /**
   * 获取 Agent ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * 获取 Agent 名称
   */
  getName(): string {
    return this.config.name;
  }
}
```

### 8. src/agents/issue-calibrator.ts

```typescript
import { ReviewIssue, AdversaryResult } from '../types';

/**
 * IssueCalibrtor - 根据对抗审查结果调整问题置信度
 * 
 * 职责：
 * 1. 应用对抗 Agent 的置信度调整建议
 * 2. 删除/降级被标记为误报的问题
 * 3. 合并来自不同 Agent 的重复问题
 * 4. 生成最终的审查结果
 */
export class IssueCalibrtor {
  /**
   * 使用对抗 Agent 的结果调整问题
   * @param originalIssues 原始问题列表
   * @param adversaryResult 对抗 Agent 的审查结果
   * @returns 调整后的最终问题列表
   */
  calibrate(originalIssues: ReviewIssue[], adversaryResult: AdversaryResult): ReviewIssue[] {
    if (!adversaryResult.success) {
      // 如果对抗审查失败，返回原始问题
      return originalIssues;
    }

    // 第一步：应用置信度调整
    const adjustedIssues = this.applyConfidenceAdjustments(
      originalIssues,
      adversaryResult.confidenceAdjustments
    );

    // 第二步：过滤误报和低置信度问题
    const filteredIssues = this.filterFalsePositives(adjustedIssues, adversaryResult.falsePositives);

    // 第三步：添加对抗 Agent 发现的新问题
    const finalIssues = [...filteredIssues, ...adversaryResult.issues];

    // 第四步：合并重复问题
    const mergedIssues = this.mergeeDuplicates(finalIssues);

    // 第五步：按严重程度和置信度排序
    return this.sortIssues(mergedIssues);
  }

  /**
   * 应用置信度调整
   */
  private applyConfidenceAdjustments(
    issues: ReviewIssue[],
    adjustments: Array<{
      issueIndex: number;
      newConfidence: number;
      reason: string;
    }>
  ): ReviewIssue[] {
    const adjustmentMap = new Map(adjustments.map((a) => [a.issueIndex, a.newConfidence]));

    return issues.map((issue, index) => {
      const newConfidence = adjustmentMap.get(index);
      if (newConfidence !== undefined) {
        return {
          ...issue,
          confidence: Math.max(0, Math.min(1, newConfidence)), // 确保在 0-1 范围内
        };
      }
      return issue;
    });
  }

  /**
   * 过滤误报和低置信度问题
   * @param issues 问题列表
   * @param falsePositiveIndices 被标记为误报的索引
   */
  private filterFalsePositives(issues: ReviewIssue[], falsePositiveIndices: number[]): ReviewIssue[] {
    const falsePositiveSet = new Set(falsePositiveIndices);

    return issues.filter((_, index) => {
      // 如果被标记为误报，过滤掉
      if (falsePositiveSet.has(index)) {
        return false;
      }

      // 如果置信度过低（< 0.3），也过滤掉
      return true;
    });
  }

  /**
   * 合并重复问题
   * 如果多个 Agent 发现了相同的问题，只保留置信度最高的那个
   */
  private mergeeDuplicates(issues: ReviewIssue[]): ReviewIssue[] {
    const issueMap = new Map<string, ReviewIssue>();

    for (const issue of issues) {
      const key = this.getIssueKey(issue);

      if (issueMap.has(key)) {
        const existing = issueMap.get(key)!;
        // 保留置信度更高的那个
        if (issue.confidence > existing.confidence) {
          issueMap.set(key, issue);
        }
      } else {
        issueMap.set(key, issue);
      }
    }

    return Array.from(issueMap.values());
  }

  /**
   * 生成问题的唯一标识
   */
  private getIssueKey(issue: ReviewIssue): string {
    return `${issue.file}:${issue.line}:${issue.dimension}:${issue.severity}`;
  }

  /**
   * 按严重程度和置信度排序
   */
  private sortIssues(issues: ReviewIssue[]): ReviewIssue[] {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

    return issues.sort((a, b) => {
      // 首先按严重程度排序
      const severityDiff =
        severityOrder[a.severity as keyof typeof severityOrder] -
        severityOrder[b.severity as keyof typeof severityOrder];

      if (severityDiff !== 0) {
        return severityDiff;
      }

      // 然后按置信度从高到低排序
      return b.confidence - a.confidence;
    });
  }

  /**
   * 生成调整摘要（用于日志/报告）
   */
  generateCalibrationSummary(
    originalIssues: ReviewIssue[],
    adversaryResult: AdversaryResult,
    finalIssues: ReviewIssue[]
  ): {
    originalCount: number;
    falsePositivesRemoved: number;
    newIssuesAdded: number;
    duplicatesMerged: number;
    finalCount: number;
  } {
    return {
      originalCount: originalIssues.length,
      falsePositivesRemoved: adversaryResult.falsePositives.length,
      newIssuesAdded: adversaryResult.issues.length,
      duplicatesMerged: originalIssues.length + adversaryResult.issues.length - finalIssues.length,
      finalCount: finalIssues.length,
    };
  }
}
```

### 9. src/agents/index.ts

```typescript
/**
 * 维度审查 Agent 系统 - 实现多个独立的审查 Agent
 * 
 * 架构设计：
 * 1. AgentRunner: 基础抽象类，定义 Agent 执行接口
 * 2. 五个维度 Agent: LogicAgent、SecurityAgent、PerformanceAgent、MaintainabilityAgent、EdgeCaseAgent
 * 3. AdversaryAgent: 对抗式审查，以全新视角寻找遗漏问题和质疑误报
 * 4. IssueCalibrtor: 根据对抗审查结果调整置信度和去重
 * 
 * 典型用法：
 * ```typescript
 * // 并行执行所有维度 Agent
 * const dimensionAgents = [
 *   new LogicAgent(),
 *   new SecurityAgent(),
 *   new PerformanceAgent(),
 *   new MaintainabilityAgent(),
 *   new EdgeCaseAgent(),
 * ];
 * 
 * const dimensionResults = await Promise.all(
 *   dimensionAgents.map(agent => agent.review(files, context))
 * );
 * 
 * const allIssues = dimensionResults.flatMap(r => r.issues);
 * 
 * // 运行对抗审查
 * const adversary = new AdversaryAgent();
 * const adversaryResult = await adversary.challenge(files, context, allIssues);
 * 
 * // 调整问题
 * const calibrator = new IssueCalibrtor();
 * const finalIssues = calibrator.calibrate(allIssues, adversaryResult);
 * ```
 */

export { AgentRunner } from './agent-runner';
export { LogicAgent } from './logic-agent';
export { SecurityAgent } from './security-agent';
export { PerformanceAgent } from './performance-agent';
export { MaintainabilityAgent } from './maintainability-agent';
export { EdgeCaseAgent } from './edge-case-agent';
export { AdversaryAgent, type IssueJudgment, type AdversaryReviewResponse } from './adversary-agent';
export { IssueCalibrtor } from './issue-calibrator';
export * from './prompts';
```

---

## Type Definitions

### 1. src/types/agent.ts

```typescript
import { ReviewDimension, ReviewIssue } from './review';

/**
 * Agent 配置 - 定义一个审查 Agent 的基本配置
 */
export interface AgentConfig {
  /** Agent 唯一标识 */
  id: string;
  /** Agent 名称 */
  name: string;
  /** Agent 描述 */
  description: string;
  /** Agent 负责的审查维度（维度 Agent 使用） */
  dimension?: ReviewDimension;
  /** Agent 的 system prompt 模板 */
  systemPrompt: string;
  /** 模型选择（可选，默认使用编排器配置） */
  model?: string;
  /** 最大输出 token 数 */
  maxTokens?: number;
  /** 温度参数 */
  temperature?: number;
}

/**
 * Agent 执行结果
 */
export interface AgentResult {
  /** 执行该结果的 Agent 标识 */
  agentId: string;
  /** 发现的问题列表 */
  issues: ReviewIssue[];
  /** 执行耗时（毫秒） */
  durationMs: number;
  /** Token 消耗 */
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  /** 执行是否成功 */
  success: boolean;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 维度审查 Agent 接口 - 专注于单一审查维度的 Agent
 */
export interface DimensionAgent {
  /** Agent 配置 */
  config: AgentConfig;
  /** 执行审查，返回该维度发现的问题 */
  review(files: string[], context: string): Promise<AgentResult>;
}

/**
 * 对抗审查 Agent 接口 - 以对抗视角重新审视已有结果
 * 目标是找到被遗漏的问题，并挑战已有结论中的误报
 */
export interface AdversaryAgent {
  /** Agent 配置 */
  config: AgentConfig;
  /** 对抗审查：接收已有结果，尝试找出遗漏和误报 */
  challenge(
    files: string[],
    context: string,
    existingIssues: ReviewIssue[]
  ): Promise<AdversaryResult>;
}

/**
 * 对抗审查结果 - 在 AgentResult 基础上增加误报标记
 */
export interface AdversaryResult extends AgentResult {
  /** 被标记为误报的已有问题索引 */
  falsePositives: number[];
  /** 对已有问题的置信度调整建议 */
  confidenceAdjustments: Array<{
    issueIndex: number;
    newConfidence: number;
    reason: string;
  }>;
}

/**
 * 编排器接口 - 管理整个审查流程
 */
export interface Orchestrator {
  /** 执行完整的审查流程 */
  run(request: import('./review').ReviewRequest): Promise<import('./review').ReviewReport>;
}
```

### 2. src/types/review.ts

```typescript
/**
 * 审查维度枚举 - 定义代码审查关注的不同方面
 * 每个维度对应一个独立的审查 Agent
 */
export enum ReviewDimension {
  /** 逻辑正确性 - 检查算法逻辑、控制流、数据流是否正确 */
  Logic = 'logic',
  /** 安全性 - 检查注入、越权、敏感数据泄露等安全问题 */
  Security = 'security',
  /** 性能 - 检查时间/空间复杂度、资源泄露、不必要的计算 */
  Performance = 'performance',
  /** 可维护性 - 检查代码结构、命名、重复代码、耦合度 */
  Maintainability = 'maintainability',
  /** 边界情况 - 检查空值、溢出、并发、异常路径等边界条件 */
  EdgeCases = 'edge_cases',
}

/**
 * 问题严重等级
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low';

/**
 * 单个审查问题 - 描述代码中发现的一个具体问题
 */
export interface ReviewIssue {
  /** 问题所在文件路径 */
  file: string;
  /** 问题所在行号 */
  line: number;
  /** 问题结束行号（可选，用于标记范围） */
  endLine?: number;
  /** 严重等级: 'critical' | 'high' | 'medium' | 'low' */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** 所属审查维度 */
  dimension: ReviewDimension;
  /** 问题描述 */
  description: string;
  /** 修复建议 */
  suggestion: string;
  /** 置信度（0-1），表示 Agent 对该问题判断的确信程度 */
  confidence: number;
  /** 发现该问题的 Agent 标识 */
  foundBy?: string;
  /** 相关代码片段 */
  codeSnippet?: string;
}

/**
 * 按严重等级统计的计数
 */
export interface SeverityCount {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

/**
 * 审查报告的统计摘要
 */
export interface ReviewSummary {
  /** 按严重等级分组的问题计数 */
  bySeverity: SeverityCount;
  /** 按审查维度分组的问题计数 */
  byDimension: Record<ReviewDimension, number>;
  /** 问题总数 */
  totalIssues: number;
}

/**
 * 审查元数据 - 记录审查过程的运行信息
 */
export interface ReviewMetadata {
  /** 审查总耗时（毫秒） */
  durationMs: number;
  /** Token 消耗统计 */
  tokenUsage: TokenUsage;
  /** 审查开始时间 */
  startedAt: string;
  /** 审查结束时间 */
  completedAt: string;
  /** 参与审查的 Agent 列表 */
  agents: string[];
}

/**
 * Token 消耗统计
 */
export interface TokenUsage {
  /** 输入 token 数量 */
  input: number;
  /** 输出 token 数量 */
  output: number;
  /** 总 token 数量 */
  total: number;
}

/**
 * 审查报告 - 整个审查流程的最终输出
 */
export interface ReviewReport {
  /** 发现的所有问题列表 */
  issues: ReviewIssue[];
  /** 统计摘要 */
  summary: ReviewSummary;
  /** 审查元数据 */
  metadata: ReviewMetadata;
}

/**
 * 单个文件的审查输入
 */
export interface FileToReview {
  /** 文件路径 */
  path: string;
  /** 文件完整内容（如可获取） */
  content?: string;
  /** 文件的 diff 内容 */
  diff?: string;
  /** 文件语言标识 */
  language?: string;
}

/**
 * 上下文配置 - 控制审查时的上下文信息
 */
export interface ContextConfig {
  /** 包含的上下文行数（diff 前后） */
  contextLines: number;
  /** 是否包含完整文件内容 */
  includeFullFile: boolean;
  /** 是否包含依赖文件 */
  includeDependencies: boolean;
  /** 项目根目录 */
  projectRoot: string;
}

/**
 * 审查请求 - 发起一次代码审查的完整输入
 */
export interface ReviewRequest {
  /** 待审查的文件列表 */
  files: FileToReview[];
  /** diff 内容（如整体 diff） */
  diff?: string;
  /** 上下文配置 */
  context: ContextConfig;
  /** 指定审查维度（空则审查所有维度） */
  dimensions?: ReviewDimension[];
  /** 审查模式：仅审查 / 审查+修复 */
  mode: 'review' | 'review-fix';
  /** 最大审查轮次（review-fix 模式下） */
  maxIterations?: number;
}
```

---

## Prompts System

### src/agents/prompts/index.ts

**LOGIC_AGENT_PROMPT** (Lines 12-47)
```
你是一个专注于代码逻辑正确性的审查专家。你的唯一目标是找到代码中的逻辑错误，直到找不到错误为止。

## 审查维度：逻辑正确性
重点审查以下方面，每个都要给出具体的反例或触发条件：

1. 控制流错误 - if/else/switch 分支逻辑是否遗漏了某些情况？是否有互斥条件处理不当？
2. 数据流错误 - 变量赋值、传递过程中是否有逻辑错误？数据是否被正确初始化和使用？
3. 循环错误 - 循环条件是否正确？循环体是否有死循环风险？是否有 off-by-one 错误？
4. 空值处理 - 是否正确处理了 null/undefined/empty 情况？是否有空指针风险？
5. 类型不匹配 - 类型转换是否正确？是否有隐式类型强制转换问题？
6. 边界条件 - 数组索引、字符串长度等边界是否正确处理？
7. 竞态条件 - 如果是异步代码，是否有竞态条件风险？
8. 逻辑反转 - 是否有条件判断反转（!= 应该是 ==）？
9. 操作符错误 - 是否有位运算符、逻辑运算符的误用？
10. 返回值处理 - 函数返回值是否被正确使用？是否遗漏了错误返回值的处理？
```

**SECURITY_AGENT_PROMPT** (Lines 49-85)
```
你是一个专注于代码安全性的审查专家。你的唯一目标是找到代码中的安全漏洞，直到找不到为止。

## 审查维度：安全性
重点审查以下方面，每个都要给出具体的攻击向量：

1. 注入漏洞 - SQL注入、命令注入、模板注入、XPath注入等？是否有未过滤的用户输入？
2. 跨站脚本 (XSS) - 是否直接将用户输入渲染到 HTML？是否缺少适当的转义？
3. 权限绕过 - 是否有权限检查遗漏？是否可以直接访问受限资源？
4. 敏感数据泄露 - 是否在日志/错误信息中输出了密码/token/API key？
5. 不安全的依赖 - 是否使用了已知的恶意或过时的依赖版本？
6. 身份验证/授权缺陷 - 是否缺少身份验证？是否有绕过身份验证的方法？
7. 加密和哈希 - 是否使用了弱加密算法？是否正确生成和存储了哈希值？
8. 会话管理 - Session token 是否安全生成和存储？是否缺少超时机制？
9. 不安全的序列化 - 是否反序列化了不可信的数据？
10. 错误处理中的信息泄露 - 错误消息是否泄露了系统信息？
11. 密钥管理 - 密钥是否硬编码在代码中？是否缺少密钥轮换机制？
12. 文件操作安全 - 是否有路径遍历漏洞？是否安全验证了文件路径？
```

**PERFORMANCE_AGENT_PROMPT** (Lines 87-120)
```
你是一个专注于代码性能的审查专家。你的唯一目标是找到代码中的性能问题，直到找不到为止。

## 审查维度：性能
重点审查以下方面，每个都要给出具体的性能影响：

1. N+1 查询问题 - 是否在循环中执行了重复的数据库查询？是否可以使用 JOIN 或批量操作？
2. 内存泄漏 - 是否有未释放的资源？是否有循环引用导致垃圾回收失效？
3. 不必要的计算 - 是否在循环中重复计算相同的值？是否可以缓存结果？
4. 阻塞操作 - 是否在主线程中执行了阻塞操作？是否缺少异步处理？
5. 算法复杂度 - 时间/空间复杂度是否过高？是否有更高效的算法选择？
6. 字符串拼接 - 是否在循环中使用字符串拼接？应该使用数组和 join 吗？
7. 正则表达式效率 - 是否有易导致回溯的复杂正则表达式？
8. 集合操作效率 - 是否多次遍历相同的集合？是否可以使用 Set 而不是 Array？
9. DOM 操作 - 是否有频繁的 DOM 查询或重排？是否缺少批量更新？
10. 序列化/反序列化 - 是否进行了不必要的序列化？数据结构是否可以优化？
```

**MAINTAINABILITY_AGENT_PROMPT** (Lines 122-155)
```
你是一个专注于代码可维护性的审查专家。你的唯一目标是找到代码中的可维护性问题，直到找不到为止。

## 审查维度：可维护性
重点审查以下方面，每个都要给出具体的维护困难：

1. 代码重复 - 是否有重复的代码块？是否可以提取为公共函数/组件？
2. 圈复杂度过高 - 函数是否有过多的分支？是否应该拆分为多个小函数？
3. 命名不当 - 变量/函数/类的名称是否有歧义或不清晰？
4. 缺少文档 - 是否缺少复杂逻辑的注释或文档字符串？
5. 函数过长 - 函数是否做了太多事情？是否超过 50 行应该考虑拆分？
6. 嵌套过深 - 代码嵌套层数是否过多（超过 3-4 层）？
7. 魔法数字 - 是否使用了未定义的常数？应该定义为具名常量吗？
8. 缺失错误处理 - 是否缺少 try-catch 或错误检查？
9. SOLID 原则违反 - 是否违反了单一职责、开闭、里氏替换、接口隔离、依赖倒置原则？
10. 代码风格不一致 - 是否与项目的代码风格不一致？
```

**EDGE_CASE_AGENT_PROMPT** (Lines 157-190)
```
你是一个专注于边界情况的审查专家。你的唯一目标是找到代码中处理不当的边界情况，直到找不到为止。

## 审查维度：边界情况
重点审查以下方面，每个都要给出具体的边界情况和触发条件：

1. 空输入处理 - 代码是否正确处理了空数组、空字符串、null、undefined？
2. 极端值处理 - 是否处理了最大/最小值、零、负数等极端情况？
3. 大数据输入 - 如果输入非常大（100MB 文件、百万级数组），代码是否会崩溃或超时？
4. 并发场景 - 多个请求同时到达时是否有竞态条件？是否正确处理了并发修改？
5. 网络失败 - 网络超时、中断、DNS 失败时代码如何表现？
6. 资源耗尽 - 磁盘满、内存溢出、文件句柄耗尽时代码如何处理？
7. 时间边界 - 闰年、月末、午夜等时间边界是否正确处理？时区是否考虑？
8. 浮点精度 - 是否有浮点数比较问题？是否忽略了精度误差？
9. 编码问题 - 是否正确处理了 UTF-8、特殊字符、emoji 等编码问题？
10. 路径和文件 - 特殊字符路径、符号链接、文件权限问题是否处理？
```

**ADVERSARY_AGENT_PROMPT** (Lines 205-276)
Comprehensive prompt for adversarial review with specific tasks:
- Task 1: Find missed issues from any dimension
- Task 2: Challenge existing issues (Confirmed, Disputed, False Positive)
- Requires complete independence and specific reasoning for each judgment

---

## Test Files

### __tests__/agents/dimension-agents.test.ts

```typescript
import {
  LogicAgent,
  SecurityAgent,
  PerformanceAgent,
  MaintainabilityAgent,
  EdgeCaseAgent,
} from '../../src/agents';
import { ReviewDimension } from '../../src/types';

describe('Dimension Agents', () => {
  describe('LogicAgent', () => {
    it('should have correct configuration', () => {
      const agent = new LogicAgent();
      expect(agent.getId()).toBe('logic-agent');
      expect(agent.getName()).toBe('Logic Correctness Agent');
      expect(agent.getDimension()).toBe(ReviewDimension.Logic);
    });

    it('should support custom configuration', () => {
      const agent = new LogicAgent({
        id: 'custom-logic',
        name: 'Custom Logic Agent',
      });
      expect(agent.getId()).toBe('custom-logic');
      expect(agent.getName()).toBe('Custom Logic Agent');
    });

    it('should have system prompt defined', () => {
      const agent = new LogicAgent();
      const config = agent.getConfig();
      expect(config.systemPrompt).toBeDefined();
      expect(config.systemPrompt.length).toBeGreaterThan(0);
    });

    it('should be able to perform review', async () => {
      const agent = new LogicAgent();
      const result = await agent.review(['test.ts'], 'function test() {}');
      expect(result.agentId).toBe('logic-agent');
      expect(result.success).toBe(true);
      expect(result.issues).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SecurityAgent', () => {
    it('should have correct configuration', () => {
      const agent = new SecurityAgent();
      expect(agent.getId()).toBe('security-agent');
      expect(agent.getDimension()).toBe(ReviewDimension.Security);
    });

    it('should have security-focused system prompt', () => {
      const agent = new SecurityAgent();
      const config = agent.getConfig();
      expect(config.systemPrompt).toBeDefined();
    });
  });

  describe('PerformanceAgent', () => {
    it('should have correct configuration', () => {
      const agent = new PerformanceAgent();
      expect(agent.getId()).toBe('performance-agent');
      expect(agent.getDimension()).toBe(ReviewDimension.Performance);
    });
  });

  describe('MaintainabilityAgent', () => {
    it('should have correct configuration', () => {
      const agent = new MaintainabilityAgent();
      expect(agent.getId()).toBe('maintainability-agent');
      expect(agent.getDimension()).toBe(ReviewDimension.Maintainability);
    });
  });

  describe('EdgeCaseAgent', () => {
    it('should have correct configuration', () => {
      const agent = new EdgeCaseAgent();
      expect(agent.getId()).toBe('edge-case-agent');
      expect(agent.getDimension()).toBe(ReviewDimension.EdgeCases);
    });
  });

  describe('Parallel Execution', () => {
    it('should support parallel review execution', async () => {
      const agents = [
        new LogicAgent(),
        new SecurityAgent(),
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      const startTime = Date.now();
      const results = await Promise.all(
        agents.map((agent) => agent.review(['test.ts'], 'const x = 1;'))
      );
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(5);
      expect(results.every((r) => r.success)).toBe(true);

      // All should complete within reasonable time (parallel execution)
      // If sequential, this would take much longer
      expect(duration).toBeLessThan(5000);
    });

    it('should maintain agent independence', async () => {
      const agent1 = new LogicAgent();
      const agent2 = new SecurityAgent();

      const result1 = await agent1.review(['test.ts'], 'code1');
      const result2 = await agent2.review(['test.ts'], 'code2');

      expect(result1.agentId).toBe('logic-agent');
      expect(result2.agentId).toBe('security-agent');
      expect(result1.agentId).not.toBe(result2.agentId);
    });
  });

  describe('System Prompts', () => {
    it('should have comprehensive system prompts for all agents', () => {
      const agents = [
        new LogicAgent(),
        new SecurityAgent(),
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      for (const agent of agents) {
        const config = agent.getConfig();
        expect(config.systemPrompt).toBeDefined();
        expect(config.systemPrompt.length).toBeGreaterThan(500);
      }
    });

    it('should have output format specifications in prompts', () => {
      const agents = [
        new LogicAgent(),
        new SecurityAgent(),
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      for (const agent of agents) {
        const prompt = agent.getConfig().systemPrompt;
        expect(prompt.toLowerCase()).toContain('json');
        expect(prompt).toContain('dimension');
        expect(prompt).toContain('confidence');
      }
    });
  });

  describe('Agent Configuration', () => {
    it('should have default max tokens set', () => {
      const agents = [
        new LogicAgent(),
        new SecurityAgent(),
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      for (const agent of agents) {
        const config = agent.getConfig();
        expect(config.maxTokens).toBeDefined();
        expect(config.maxTokens).toBeGreaterThan(1000);
      }
    });

    it('should have reasonable temperature values', () => {
      const agents = [
        new LogicAgent(),
        new SecurityAgent(),
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      for (const agent of agents) {
        const config = agent.getConfig();
        expect(config.temperature).toBeDefined();
        expect(config.temperature).toBeGreaterThanOrEqual(0);
        expect(config.temperature).toBeLessThanOrEqual(1);
      }
    });
  });
});
```

### __tests__/agents/adversary-agent.test.ts

```typescript
import { AdversaryAgent } from '../../src/agents';
import { IssueCalibrtor } from '../../src/agents/issue-calibrator';
import { ReviewIssue, ReviewDimension, AdversaryResult } from '../../src/types';

describe('AdversaryAgent', () => {
  describe('configuration', () => {
    it('should have correct default configuration', () => {
      const agent = new AdversaryAgent();
      expect(agent.getId()).toBe('adversary-agent');
      expect(agent.getName()).toBe('Adversary Code Review Agent');
    });

    it('should support custom configuration', () => {
      const agent = new AdversaryAgent({
        id: 'custom-adversary',
        name: 'Custom Adversary Agent',
      });
      expect(agent.getId()).toBe('custom-adversary');
      expect(agent.getName()).toBe('Custom Adversary Agent');
    });

    it('should have adversary-specific system prompt', () => {
      const agent = new AdversaryAgent();
      const config = agent.getConfig();
      expect(config.systemPrompt).toBeDefined();
      expect(config.systemPrompt.length).toBeGreaterThan(500);
      expect(config.systemPrompt).toContain('对抗');
    });

    it('should have higher temperature for creative thinking', () => {
      const agent = new AdversaryAgent();
      const config = agent.getConfig();
      expect(config.temperature).toBeDefined();
      expect(config.temperature).toBeGreaterThanOrEqual(0.6); // Higher for creativity
    });
  });

  describe('challenge method', () => {
    it('should handle empty existing issues', async () => {
      const agent = new AdversaryAgent();
      const result = await agent.challenge(['test.ts'], 'function test() {}', []);

      expect(result.agentId).toBe('adversary-agent');
      expect(result.success).toBe(true);
      expect(result.issues).toBeDefined();
      expect(result.falsePositives).toBeDefined();
      expect(result.confidenceAdjustments).toBeDefined();
    });

    it('should handle existing issues list', async () => {
      const agent = new AdversaryAgent();
      const existingIssues: ReviewIssue[] = [
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Potential null reference',
          suggestion: 'Add null check',
          confidence: 0.8,
        },
      ];

      const result = await agent.challenge(['test.ts'], 'function test() {}', existingIssues);

      expect(result.success).toBe(true);
      expect(result.falsePositives).toBeDefined();
      expect(result.confidenceAdjustments).toBeDefined();
    });

    it('should return proper AdversaryResult structure', async () => {
      const agent = new AdversaryAgent();
      const result = await agent.challenge(['test.ts'], 'code', []);

      expect(result).toHaveProperty('agentId');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('tokenUsage');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('falsePositives');
      expect(result).toHaveProperty('confidenceAdjustments');
    });
  });
});

describe('IssueCalibrtor', () => {
  describe('applyConfidenceAdjustments', () => {
    it('should adjust confidence scores', () => {
      const calibrator = new IssueCalibrtor();
      const issues: ReviewIssue[] = [
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Issue 1',
          suggestion: 'Fix it',
          confidence: 0.8,
        },
        {
          file: 'test.ts',
          line: 20,
          severity: 'medium',
          dimension: ReviewDimension.Security,
          description: 'Issue 2',
          suggestion: 'Fix it',
          confidence: 0.7,
        },
      ];

      const adversaryResult = {
        agentId: 'adversary',
        issues: [],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [],
        confidenceAdjustments: [
          { issueIndex: 0, newConfidence: 0.5, reason: 'Disputed' },
          { issueIndex: 1, newConfidence: 0.9, reason: 'Confirmed' },
        ],
      };

      const result = calibrator.calibrate(issues, adversaryResult);

      expect(result[0].confidence).toBe(0.5);
      expect(result[1].confidence).toBe(0.9);
    });

    it('should clamp confidence values to 0-1 range', () => {
      const calibrator = new IssueCalibrtor();
      const issues: ReviewIssue[] = [
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Issue',
          suggestion: 'Fix',
          confidence: 0.5,
        },
      ];

      const adversaryResult = {
        agentId: 'adversary',
        issues: [],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [],
        confidenceAdjustments: [{ issueIndex: 0, newConfidence: 1.5, reason: 'Test' }],
      };

      const result = calibrator.calibrate(issues, adversaryResult);
      expect(result[0].confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('filterFalsePositives', () => {
    it('should remove issues marked as false positives', () => {
      const calibrator = new IssueCalibrtor();
      const issues: ReviewIssue[] = [
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Issue 1',
          suggestion: 'Fix',
          confidence: 0.8,
        },
        {
          file: 'test.ts',
          line: 20,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Issue 2',
          suggestion: 'Fix',
          confidence: 0.7,
        },
      ];

      const adversaryResult = {
        agentId: 'adversary',
        issues: [],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [0], // Mark first issue as false positive
        confidenceAdjustments: [],
      };

      const result = calibrator.calibrate(issues, adversaryResult);

      expect(result.length).toBe(1);
      expect(result[0].description).toBe('Issue 2');
    });
  });

  describe('mergeeDuplicates', () => {
    it('should keep issue with higher confidence when duplicates exist', () => {
      const calibrator = new IssueCalibrtor();
      const issues: ReviewIssue[] = [
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Issue found by Agent 1',
          suggestion: 'Fix it',
          confidence: 0.7,
        },
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Issue found by Agent 2',
          suggestion: 'Fix it',
          confidence: 0.9,
        },
      ];

      const adversaryResult = {
        agentId: 'adversary',
        issues: [],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [],
        confidenceAdjustments: [],
      };

      const result = calibrator.calibrate(issues, adversaryResult);

      expect(result.length).toBe(1);
      expect(result[0].confidence).toBe(0.9);
      expect(result[0].description).toBe('Issue found by Agent 2');
    });
  });

  describe('sortIssues', () => {
    it('should sort by severity first, then by confidence', () => {
      const calibrator = new IssueCalibrtor();
      const issues: ReviewIssue[] = [
        {
          file: 'test.ts',
          line: 10,
          severity: 'low',
          dimension: ReviewDimension.Logic,
          description: 'Low severity',
          suggestion: 'Fix',
          confidence: 0.9,
        },
        {
          file: 'test.ts',
          line: 20,
          severity: 'critical',
          dimension: ReviewDimension.Logic,
          description: 'Critical low confidence',
          suggestion: 'Fix',
          confidence: 0.3,
        },
        {
          file: 'test.ts',
          line: 30,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'High high confidence',
          suggestion: 'Fix',
          confidence: 0.9,
        },
        {
          file: 'test.ts',
          line: 40,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'High low confidence',
          suggestion: 'Fix',
          confidence: 0.3,
        },
      ];

      const adversaryResult = {
        agentId: 'adversary',
        issues: [],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [],
        confidenceAdjustments: [],
      };

      const result = calibrator.calibrate(issues, adversaryResult);

      // Should be sorted: critical > high > low
      // Within same severity: higher confidence first
      expect(result[0].severity).toBe('critical');
      expect(result[1].severity).toBe('high');
      expect(result[1].confidence).toBe(0.9); // Higher confidence first
      expect(result[2].confidence).toBe(0.3); // Lower confidence second
    });
  });

  describe('generateCalibrationSummary', () => {
    it('should provide accurate calibration statistics', () => {
      const calibrator = new IssueCalibrtor();
      const originalIssues: ReviewIssue[] = [
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Issue',
          suggestion: 'Fix',
          confidence: 0.8,
        },
      ];

      const adversaryResult: AdversaryResult = {
        agentId: 'adversary',
        issues: [
          {
            file: 'test.ts',
            line: 50,
            severity: 'medium',
            dimension: ReviewDimension.Security,
            description: 'New issue',
            suggestion: 'Fix',
            confidence: 0.6,
          },
        ],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [0],
        confidenceAdjustments: [],
      };

      const finalIssues = calibrator.calibrate(originalIssues, adversaryResult);
      const summary = calibrator.generateCalibrationSummary(
        originalIssues,
        adversaryResult,
        finalIssues
      );

      expect(summary.originalCount).toBe(1);
      expect(summary.falsePositivesRemoved).toBe(1);
      expect(summary.newIssuesAdded).toBe(1);
      expect(summary.finalCount).toBeLessThanOrEqual(1); // After false positive removal
    });
  });
});
```

---

## Summary

### Architecture Overview

1. **AgentRunner** (Base Abstract Class)
   - Defines the interface for all agents
   - Handles timing, error wrapping, and JSON serialization
   - Provides utility methods: `getId()`, `getName()`, `getDimension()`, `getConfig()`

2. **Five Dimension Agents** (All extend AgentRunner)
   - LogicAgent: Checks logic errors, control flow, data flow, loops, null handling
   - SecurityAgent: Checks injection, XSS, privilege escalation, data leaks
   - PerformanceAgent: Checks N+1 queries, memory leaks, inefficient algorithms
   - MaintainabilityAgent: Checks code duplication, complexity, naming
   - EdgeCaseAgent: Checks boundary conditions, null inputs, resource exhaustion

3. **AdversaryAgent** (Specialized Agent)
   - Operates independently to find missed issues
   - Challenges existing conclusions (Confirmed/Disputed/False Positive)
   - Returns new issues + judgments on existing issues

4. **IssueCalibrtor** (Post-processing)
   - Applies confidence adjustments
   - Filters false positives
   - Merges duplicates (keeping highest confidence)
   - Sorts by severity and confidence

5. **Type System**
   - ReviewDimension enum: Logic, Security, Performance, Maintainability, EdgeCases
   - ReviewIssue: Core problem definition (file, line, severity, dimension, description, confidence)
   - AgentConfig: Configuration for agents (id, name, prompt, model params)
   - AdversaryResult: Extends AgentResult with falsePositives and confidenceAdjustments

### Key Design Patterns

- **Template Method**: AgentRunner.review() calls abstract performReview() in subclasses
- **Strategy Pattern**: Different agents implement different review strategies
- **Isolation**: Each agent runs independently with its own configuration
- **JSON Output Format**: All agents output JSON for parsing and consistency
- **Confidence Scoring**: All issues have 0-1 confidence scores for calibration
- **Adversarial Review**: Second-opinion mechanism to catch false positives and missed issues

