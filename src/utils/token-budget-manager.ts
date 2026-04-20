/**
 * Token Budget Manager - 在 orchestrator 层级管理和强制 token 预算
 * 
 * 设计原则：
 * 1. 定义不同审查模式的 token 预算
 * 2. 跟踪多个 agent 的累计 token 使用
 * 3. 实现多种分配策略（等份、优先级、自适应）
 * 4. 在 agent 执行前预估 token
 * 5. 超出预算时跳过或缩减 agent
 * 6. 支持优雅降级和详细日志记录
 */

import { TokenEstimator, TokenEstimate } from './token-estimator';
import { PromptOptimizer } from './prompt-optimizer';

/**
 * 审查模式定义
 */
export type ReviewMode = 'fast' | 'normal' | 'deep' | 'custom';

/**
 * token 分配策略
 */
export type AllocationStrategy = 'equal' | 'priority' | 'adaptive';

/**
 * Agent 执行配置
 */
export interface AgentConfig {
  // Agent 名称
  name: string;
  // 系统提示词
  systemPrompt: string;
  // 最大输出 token
  maxOutputTokens: number;
  // 优先级（1-10，越高越优先执行）
  priority: number;
  // 是否必需（超预算时不会被跳过）
  required: boolean;
}

/**
 * Agent 预估结果
 */
export interface AgentEstimate {
  // Agent 名称
  name: string;
  // 预估的输入 token
  estimatedInputTokens: number;
  // 预估的输出 token
  estimatedOutputTokens: number;
  // 预估的总 token
  estimatedTotalTokens: number;
  // 是否可在预算内执行
  canExecute: boolean;
  // 如果不能执行，原因是什么
  reason?: string;
}

/**
 * 预算执行计划
 */
export interface BudgetExecutionPlan {
  // 总预算
  totalBudget: number;
  // 已使用 token
  usedTokens: number;
  // 剩余 token
  remainingTokens: number;
  // 将执行的 agent
  agentsToExecute: AgentEstimate[];
  // 被跳过的 agent
  agentsSkipped: AgentEstimate[];
  // 预估总使用量
  estimatedTotalTokens: number;
  // 是否超过预算
  exceedsbudget: boolean;
}

/**
 * 预算统计信息
 */
export interface BudgetStatistics {
  // 总预算
  totalBudget: number;
  // 已使用 token
  usedTokens: number;
  // 剩余 token
  remainingTokens: number;
  // 利用率百分比
  utilizationPercentage: number;
  // 执行的 agent 数
  agentsExecuted: number;
  // 被跳过的 agent 数
  agentsSkipped: number;
  // 被优化的 agent 数
  agentsOptimized: number;
}

/**
 * TokenBudgetManager 类 - 管理 token 预算
 */
export class TokenBudgetManager {
  private estimator: TokenEstimator;
  private optimizer: PromptOptimizer;

  // 预定义的预算配置
  private budgets: Record<ReviewMode, number> = {
    fast: 30000, // 快速审查：30k tokens
    normal: 60000, // 正常审查：60k tokens
    deep: 120000, // 深度审查：120k tokens
    custom: 60000, // 自定义：默认 60k
  };

  // 当前预算和使用情况
  private currentBudget: number = 60000;
  private usedTokens: number = 0;
  private executionLog: Array<{
    name: string;
    tokens: number;
    timestamp: number;
  }> = [];

  constructor() {
    this.estimator = new TokenEstimator();
    this.optimizer = new PromptOptimizer();
  }

  /**
   * 设置预算
   */
  setBudget(mode: ReviewMode, tokens?: number): void {
    if (mode === 'custom' && tokens === undefined) {
      throw new Error('Custom mode requires explicit token count');
    }

    if (tokens !== undefined) {
      this.budgets[mode] = tokens;
    }

    this.currentBudget = this.budgets[mode];
    this.usedTokens = 0;
    this.executionLog = [];
  }

  /**
   * 获取当前预算
   */
  getCurrentBudget(): number {
    return this.currentBudget;
  }

  /**
   * 获取已使用的 token
   */
  getUsedTokens(): number {
    return this.usedTokens;
  }

  /**
   * 获取剩余的 token
   */
  getRemainingTokens(): number {
    return Math.max(0, this.currentBudget - this.usedTokens);
  }

  /**
   * 记录 token 使用
   */
  recordTokenUsage(agentName: string, tokens: number): void {
    this.usedTokens += tokens;
    this.executionLog.push({
      name: agentName,
      tokens,
      timestamp: Date.now(),
    });
  }

  /**
   * 预估单个 agent 的 token 使用
   */
  estimateAgent(
    config: AgentConfig,
    userMessage: string
  ): AgentEstimate {
    const estimate = this.estimator.estimate(
      config.systemPrompt,
      userMessage,
      config.maxOutputTokens
    );

    const canExecute =
      this.usedTokens + estimate.estimatedTotalTokens <=
      this.currentBudget;

    return {
      name: config.name,
      estimatedInputTokens: estimate.totalInputTokens,
      estimatedOutputTokens: estimate.estimatedOutputTokens,
      estimatedTotalTokens: estimate.estimatedTotalTokens,
      canExecute,
      reason: canExecute
        ? undefined
        : `预估 token 数 ${estimate.estimatedTotalTokens} 超出剩余预算 ${this.getRemainingTokens()}`,
    };
  }

  /**
   * 为多个 agent 规划执行顺序
   */
  planExecution(
    agents: AgentConfig[],
    userMessage: string,
    strategy: AllocationStrategy = 'priority'
  ): BudgetExecutionPlan {
    // 预估所有 agent
    const estimates = agents.map((agent) =>
      this.estimateAgent(agent, userMessage)
    );

    // 根据策略排序
    let sortedEstimates: AgentEstimate[];

    switch (strategy) {
      case 'priority':
      {
        // 按优先级排序
        const configMap = new Map(
          agents.map((a) => [a.name, a])
        );
        sortedEstimates = estimates.sort((a, b) => {
          const priorityA = configMap.get(a.name)?.priority ?? 0;
          const priorityB = configMap.get(b.name)?.priority ?? 0;
          return priorityB - priorityA;
        });
      }
        break;

      case 'adaptive':
      {
        // 自适应：必需 agent 优先，然后按效率排序
        const configMap2 = new Map(
          agents.map((a) => [a.name, a])
        );
        sortedEstimates = estimates.sort((a, b) => {
          const requiredA = configMap2.get(a.name)?.required ?? false;
          const requiredB = configMap2.get(b.name)?.required ?? false;
          if (requiredA !== requiredB) {
            return requiredA ? -1 : 1;
          }
          return a.estimatedTotalTokens - b.estimatedTotalTokens;
        });
      }
        break;

      case 'equal':
      default:
        // 平均分配，无需排序
        sortedEstimates = estimates;
        break;
    }

    // 规划哪些 agent 可以执行
    const agentsToExecute: AgentEstimate[] = [];
    const agentsSkipped: AgentEstimate[] = [];
    let totalEstimated = 0;

    for (const estimate of sortedEstimates) {
      const config = agents.find((a) => a.name === estimate.name);
      const isRequired = config?.required ?? false;

      if (
        totalEstimated + estimate.estimatedTotalTokens <=
        this.currentBudget
      ) {
        // 可以执行
        agentsToExecute.push(estimate);
        totalEstimated += estimate.estimatedTotalTokens;
      } else if (isRequired) {
        // 必需但超预算，标记但不跳过
        agentsToExecute.push(estimate);
        totalEstimated += estimate.estimatedTotalTokens;
      } else {
        // 可跳过
        agentsSkipped.push(estimate);
      }
    }

    return {
      totalBudget: this.currentBudget,
      usedTokens: this.usedTokens,
      remainingTokens: this.getRemainingTokens(),
      agentsToExecute,
      agentsSkipped,
      estimatedTotalTokens: this.usedTokens + totalEstimated,
      exceedsbudget:
        this.usedTokens + totalEstimated > this.currentBudget,
    };
  }

  /**
   * 在预算内优化 agent
   * 如果 agent 会超出预算，自动使用优化器压缩其 prompt
   */
  optimizeAgentForBudget(
    config: AgentConfig,
    userMessage: string
  ): { optimized: AgentConfig; tokens: number } {
    const estimate = this.estimateAgent(config, userMessage);

    if (estimate.canExecute) {
      // 已在预算内
      return {
        optimized: config,
        tokens: estimate.estimatedTotalTokens,
      };
    }

    // 超出预算，尝试优化
    const targetTokens = this.getRemainingTokens() - 1000; // 留点余地
    const optimized = this.optimizer.optimizePrompt(
      config.systemPrompt,
      targetTokens,
      'balanced'
    );

    const optimizedConfig: AgentConfig = {
      ...config,
      systemPrompt: optimized.optimizedPrompt,
    };

    const newEstimate = this.estimateAgent(
      optimizedConfig,
      userMessage
    );

    return {
      optimized: optimizedConfig,
      tokens: newEstimate.estimatedTotalTokens,
    };
  }

  /**
   * 获取预算统计信息
   */
  getStatistics(): BudgetStatistics {
    return {
      totalBudget: this.currentBudget,
      usedTokens: this.usedTokens,
      remainingTokens: this.getRemainingTokens(),
      utilizationPercentage:
        (this.usedTokens / this.currentBudget) * 100,
      agentsExecuted: this.executionLog.length,
      agentsSkipped: 0, // 会在 planExecution 中计算
      agentsOptimized: 0, // 会在调用 optimizeAgentForBudget 时更新
    };
  }

  /**
   * 生成预算报告
   */
  generateReport(): string {
    const stats = this.getStatistics();
    const lines: string[] = [
      '# Token Budget Report',
      '',
      '## Summary',
      `- Total Budget: ${stats.totalBudget} tokens`,
      `- Used Tokens: ${stats.usedTokens}`,
      `- Remaining: ${stats.remainingTokens}`,
      `- Utilization: ${stats.utilizationPercentage.toFixed(1)}%`,
      '',
      '## Execution History',
    ];

    for (const log of this.executionLog) {
      const timestamp = new Date(log.timestamp).toLocaleTimeString();
      lines.push(
        `- ${timestamp} ${log.name}: ${log.tokens} tokens`
      );
    }

    return lines.join('\n');
  }

  /**
   * 重置预算状态
   */
  reset(): void {
    this.usedTokens = 0;
    this.executionLog = [];
  }
}

/**
 * 便捷函数：快速创建预算管理器
 */
export function createBudgetManager(
  mode: ReviewMode,
  customTokens?: number
): TokenBudgetManager {
  const manager = new TokenBudgetManager();
  manager.setBudget(
    customTokens ? 'custom' : mode,
    customTokens
  );
  return manager;
}
