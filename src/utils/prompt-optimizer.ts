/**
 * Prompt Optimizer - 自动检测和压缩过大的提示词
 * 
 * 设计原则：
 * 1. 检测提示词组件超过最优大小
 * 2. 实现多种压缩策略（缩写、减少示例、指令合并）
 * 3. 提供优化指标和报告
 * 4. 与 TokenEstimator 集成以强制 token 预算
 * 5. 支持多级优化策略（aggressive、balanced、conservative）
 */

import { TokenCounter, countTokens } from './token-counter';

/**
 * 优化级别
 */
export type OptimizationLevel = 'aggressive' | 'balanced' | 'conservative';

/**
 * 提示词组件类型
 */
export interface PromptComponent {
  // 组件名称（用于识别）
  name: string;
  // 组件内容
  content: string;
  // 组件类型（system、instruction、example、format）
  type: 'system' | 'instruction' | 'example' | 'format' | 'constraint';
  // 组件优先级（1-10，数字越大优先级越高，优化时保留高优先级）
  priority: number;
  // 是否必需（必需组件不会被删除）
  required: boolean;
}

/**
 * 压缩策略定义
 */
export interface CompressionStrategy {
  // 策略名称
  name: string;
  // 策略描述
  description: string;
  // 压缩函数
  apply: (component: PromptComponent) => PromptComponent;
  // 预期的压缩率（0.0-1.0，1.0 表示不压缩）
  expectedCompressionRate: number;
  // 质量损失（0.0-1.0，高值表示更多质量损失）
  qualityLoss: number;
}

/**
 * 优化结果
 */
export interface OptimizationResult {
  // 原始提示词
  originalPrompt: string;
  // 优化后的提示词
  optimizedPrompt: string;
  // 原始 token 数
  originalTokens: number;
  // 优化后的 token 数
  optimizedTokens: number;
  // 节省的 token 数
  tokensSaved: number;
  // 压缩率（百分比）
  compressionPercentage: number;
  // 应用的压缩策略
  strategiesApplied: string[];
  // 被移除的组件
  removedComponents: PromptComponent[];
  // 被压缩的组件
  compressedComponents: PromptComponent[];
}

/**
 * PromptOptimizer 类 - 自动优化提示词
 */
export class PromptOptimizer {
  private counter: TokenCounter;
  private strategies: Map<string, CompressionStrategy>;

  constructor() {
    this.counter = TokenCounter.getInstance();
    this.strategies = new Map();
    this.initializeStrategies();
  }

  /**
   * 初始化压缩策略
   */
  private initializeStrategies(): void {
    // 策略 1: 移除冗余文字
    this.strategies.set('remove-redundancy', {
      name: 'Remove Redundancy',
      description: 'Remove repeated explanations and redundant text',
      apply: (component: PromptComponent) => ({
        ...component,
        content: this.removeRedundancy(component.content),
      }),
      expectedCompressionRate: 0.85, // 压缩到 85%
      qualityLoss: 0.05,
    });

    // 策略 2: 缩写冗长的解释
    this.strategies.set('abbreviate-explanations', {
      name: 'Abbreviate Explanations',
      description: 'Use shorter phrasing while maintaining meaning',
      apply: (component: PromptComponent) => ({
        ...component,
        content: this.abbreviateExplanations(component.content),
      }),
      expectedCompressionRate: 0.90, // 压缩到 90%
      qualityLoss: 0.08,
    });

    // 策略 3: 减少示例数量
    this.strategies.set('reduce-examples', {
      name: 'Reduce Examples',
      description: 'Use fewer but more representative examples',
      apply: (component: PromptComponent) => {
        if (component.type !== 'example') {
          return component;
        }
        return {
          ...component,
          content: this.reduceExamples(component.content),
        };
      },
      expectedCompressionRate: 0.70, // 压缩到 70%
      qualityLoss: 0.15,
    });

    // 策略 4: 简化格式规范
    this.strategies.set('simplify-format', {
      name: 'Simplify Format',
      description: 'Condense format specifications while maintaining clarity',
      apply: (component: PromptComponent) => {
        if (component.type !== 'format') {
          return component;
        }
        return {
          ...component,
          content: this.simplifyFormat(component.content),
        };
      },
      expectedCompressionRate: 0.80, // 压缩到 80%
      qualityLoss: 0.10,
    });

    // 策略 5: 合并相似指令
    this.strategies.set('merge-instructions', {
      name: 'Merge Instructions',
      description: 'Combine related instructions into single points',
      apply: (component: PromptComponent) => {
        if (component.type !== 'instruction') {
          return component;
        }
        return {
          ...component,
          content: this.mergeInstructions(component.content),
        };
      },
      expectedCompressionRate: 0.88, // 压缩到 88%
      qualityLoss: 0.12,
    });
  }

  /**
   * 移除冗余文字
   */
  private removeRedundancy(text: string): string {
    // 移除重复的短语
    const lines = text.split('\n');
    const seen = new Set<string>();
    const unique = lines.filter((line) => {
      const trimmed = line.trim();
      if (seen.has(trimmed)) {
        return false;
      }
      if (trimmed) {
        seen.add(trimmed);
      }
      return true;
    });
    return unique.join('\n');
  }

  /**
   * 缩写冗长的解释
   */
  private abbreviateExplanations(text: string): string {
    let result = text;

    // 常见的冗长表达 → 缩短版本
    const replacements: [RegExp, string][] = [
      [/必须先进行以下逐步推理过程/g, '必须进行逐步推理'],
      [/思考步骤不需要输出，但必须在内部执行/g, '内部执行即可'],
      [/请在推理阶段过滤掉/g, '过滤掉'],
      [/非常重要|十分重要/g, '重要'],
      [/这是(?:一个|\.\.\.)?正常模式/g, '正常模式'],
      [/虽然某处代码看似有问题，但/g, '虽然看似有问题，但'],
      [/在编译期防止了该错误/g, '在编译期防止'],
    ];

    for (const [pattern, replacement] of replacements) {
      result = result.replace(pattern, replacement);
    }

    // 移除多余的连词
    result = result.replace(/\s*[，，、；；]\s*/g, ', ');

    return result;
  }

  /**
   * 减少示例数量
   */
  private reduceExamples(text: string): string {
    // 按照示例块分割
    const examplePattern =
      /###\s*示例\s*\d*\n([\s\S]*?)(?=###|$)/g;
    const examples: string[] = [];
    let match;

    while ((match = examplePattern.exec(text)) !== null) {
      examples.push(match[1].trim());
    }

    // 如果有超过 2 个示例，只保留前 2 个
    if (examples.length > 2) {
      const keptExamples = examples.slice(0, 2).join('\n\n');
      const original = text.replace(examplePattern, '').trim();
      return original + '\n\n### 示例\n' + keptExamples;
    }

    return text;
  }

  /**
   * 简化格式规范
   */
  private simplifyFormat(text: string): string {
    // 压缩 JSON 格式表示
    let result = text;

    // 移除冗长的格式说明
    result = result.replace(
      /### 格式要求[\s\S]*?(?=\n\n|$)/g,
      (match) => {
        // 保留最关键的点
        const critical = [
          '- 仅输出 JSON 数组',
          '- 必需字段：file、line、severity、description、suggestion、confidence',
        ].join('\n');
        return '### 格式要求\n' + critical;
      }
    );

    return result;
  }

  /**
   * 合并相似指令
   */
  private mergeInstructions(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    let lastCategory = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // 检测类别标题
      if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
        const category = trimmed.replace(/\*\*/g, '');

        // 如果类别相同且描述简短，可以合并
        if (lastCategory === category && result.length > 0) {
          // 跳过重复的类别标题
          continue;
        }
        lastCategory = category;
      }

      result.push(line);
    }

    return result.join('\n');
  }

  /**
   * 解析提示词为组件
   * 这是一个简化版本，可以根据需要扩展
   */
  parsePromptComponents(prompt: string): PromptComponent[] {
    const components: PromptComponent[] = [];

    // 简单的启发式解析
    const sections = prompt.split(/\n## /);

    for (const section of sections) {
      if (!section.trim()) continue;

      const lines = section.split('\n');
      const title = lines[0] || 'Unknown';
      const content = lines.slice(1).join('\n');

      // 根据标题确定类型
      let type: PromptComponent['type'] = 'instruction';
      let priority = 5;
      let required = false;

      if (
        title.includes('推理框架') ||
        title.includes('Chain-of-Thought')
      ) {
        type = 'instruction';
        priority = 9;
        required = true;
      } else if (
        title.includes('输出格式') ||
        title.includes('JSON')
      ) {
        type = 'format';
        priority = 10;
        required = true;
      } else if (
        title.includes('示例') ||
        title.includes('Example')
      ) {
        type = 'example';
        priority = 3;
        required = false;
      } else if (
        title.includes('约束') ||
        title.includes('不应')
      ) {
        type = 'constraint';
        priority = 7;
        required = false;
      }

      components.push({
        name: title.trim(),
        content: content.trim(),
        type,
        priority,
        required,
      });
    }

    return components;
  }

  /**
   * 优化单个组件
   */
  optimizeComponent(
    component: PromptComponent,
    level: OptimizationLevel
  ): PromptComponent {
    // 必需组件、高优先级指令和格式不能删除
    if (
      component.required ||
      component.priority >= 9 ||
      component.type === 'format' ||
      component.type === 'system'
    ) {
      // 只应用压缩，不删除
      const strategies =
        level === 'aggressive'
          ? ['abbreviate-explanations', 'simplify-format']
          : level === 'balanced'
            ? ['abbreviate-explanations']
            : [];

      let optimized = component;
      for (const strategyName of strategies) {
        const strategy = this.strategies.get(strategyName);
        if (strategy) {
          optimized = strategy.apply(optimized);
        }
      }
      return optimized;
    }

    // 低优先级、非必需的组件可以选择性地删除或压缩
    return component;
  }

  /**
   * 优化完整的提示词
   */
  optimizePrompt(
    prompt: string,
    targetTokens?: number,
    level: OptimizationLevel = 'balanced'
  ): OptimizationResult {
    const originalTokens = this.counter.countTokens(prompt)
      .tokenCount;

    // 如果未指定目标 token 数，使用 90% 的原始 token 数
    const target = targetTokens || Math.floor(originalTokens * 0.9);

    const components = this.parsePromptComponents(prompt);
    const strategiesApplied: string[] = [];
    const removedComponents: PromptComponent[] = [];
    const compressedComponents: PromptComponent[] = [];

    let optimizedComponents = components.map((comp) => {
      const optimized = this.optimizeComponent(comp, level);
      if (optimized.content !== comp.content) {
        compressedComponents.push(optimized);
      }
      return optimized;
    });

    // 计算当前 token 数
    let currentTokens = this.counter.countTokens(
      optimizedComponents.map((c) => c.content).join('\n')
    ).tokenCount;

    // 如果仍然超过目标，开始删除低优先级的组件
    if (currentTokens > target && level !== 'conservative') {
      optimizedComponents.sort((a, b) => b.priority - a.priority);

      const kept: PromptComponent[] = [];
      for (const comp of optimizedComponents) {
        if (comp.required || comp.type === 'format' || comp.type === 'system') {
          kept.push(comp);
        } else {
          const testTokens = this.counter.countTokens(
            kept.map((c) => c.content).join('\n')
          ).tokenCount;

          if (testTokens < target) {
            kept.push(comp);
          } else {
            removedComponents.push(comp);
            strategiesApplied.push(`Removed: ${comp.name}`);
          }
        }
      }

      optimizedComponents = kept;
      currentTokens = this.counter.countTokens(
        optimizedComponents.map((c) => c.content).join('\n')
      ).tokenCount;
    }

    const optimizedPrompt = optimizedComponents
      .map((c) => c.content)
      .join('\n\n');

    return {
      originalPrompt: prompt,
      optimizedPrompt,
      originalTokens,
      optimizedTokens: currentTokens,
      tokensSaved: originalTokens - currentTokens,
      compressionPercentage:
        ((originalTokens - currentTokens) / originalTokens) * 100,
      strategiesApplied,
      removedComponents,
      compressedComponents,
    };
  }

  /**
   * 比较多个优化级别
   */
  compareOptimizationLevels(prompt: string): {
    conservative: OptimizationResult;
    balanced: OptimizationResult;
    aggressive: OptimizationResult;
  } {
    return {
      conservative: this.optimizePrompt(
        prompt,
        undefined,
        'conservative'
      ),
      balanced: this.optimizePrompt(prompt, undefined, 'balanced'),
      aggressive: this.optimizePrompt(
        prompt,
        undefined,
        'aggressive'
      ),
    };
  }

  /**
   * 生成优化报告
   */
  generateReport(result: OptimizationResult): string {
    const lines: string[] = [
      '# Prompt Optimization Report',
      '',
      `## Summary`,
      `- Original tokens: ${result.originalTokens}`,
      `- Optimized tokens: ${result.optimizedTokens}`,
      `- Tokens saved: ${result.tokensSaved}`,
      `- Compression rate: ${result.compressionPercentage.toFixed(1)}%`,
      '',
    ];

    if (result.strategiesApplied.length > 0) {
      lines.push('## Strategies Applied');
      for (const strategy of result.strategiesApplied) {
        lines.push(`- ${strategy}`);
      }
      lines.push('');
    }

    if (result.compressedComponents.length > 0) {
      lines.push('## Compressed Components');
      for (const comp of result.compressedComponents) {
        lines.push(`- ${comp.name} (${comp.type})`);
      }
      lines.push('');
    }

    if (result.removedComponents.length > 0) {
      lines.push('## Removed Components');
      for (const comp of result.removedComponents) {
        lines.push(
          `- ${comp.name} (${comp.type}, priority: ${comp.priority})`
        );
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * 便捷函数：快速优化提示词
 */
export function optimizePrompt(
  prompt: string,
  targetTokens?: number,
  level?: OptimizationLevel
): OptimizationResult {
  const optimizer = new PromptOptimizer();
  return optimizer.optimizePrompt(prompt, targetTokens, level);
}

/**
 * 便捷函数：比较优化级别
 */
export function compareOptimizationLevels(prompt: string) {
  const optimizer = new PromptOptimizer();
  return optimizer.compareOptimizationLevels(prompt);
}
