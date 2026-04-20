/**
 * Token Estimator - 在 API 调用前估计 token 使用量
 * 
 * 设计原则：
 * 1. 预测输入和输出的 token 数，避免超出上下文窗口
 * 2. 检查 token 使用是否在模型的限制范围内
 * 3. 提供详细的警告和错误信息
 * 4. 支持多种 Claude 模型的上下文窗口大小
 */

import { TokenCounter, PromptTokenCount } from './token-counter';

/**
 * Claude 模型的上下文窗口信息
 */
export interface ContextWindow {
  // 模型名称
  model: string;
  // 上下文窗口大小（token）
  maxTokens: number;
  // 通常推荐保留的缓冲大小（token）
  recommendedBuffer: number;
}

/**
 * Token 使用状态
 */
export type TokenStatus = 'ok' | 'warning' | 'error';

/**
 * Token 估计结果
 */
export interface TokenEstimate {
  // 模型名称
  model: string;
  // 系统提示的 token 数
  systemPromptTokens: number;
  // 用户消息的 token 数
  userMessageTokens: number;
  // API 消息格式的开销
  overheadTokens: number;
  // 输入总 token 数（系统 + 用户 + 开销）
  totalInputTokens: number;
  // 预计的输出 token 数
  estimatedOutputTokens: number;
  // 预计的总 token 使用（输入 + 输出）
  estimatedTotalTokens: number;
  // 模型的上下文窗口大小
  contextWindowSize: number;
  // 剩余可用 token（不含缓冲）
  remainingTokens: number;
  // 利用率百分比
  utilizationPercentage: number;
  // 是否超出上下文窗口
  exceedsWindow: boolean;
  // 当前状态
  status: TokenStatus;
  // 详细消息
  statusMessage: string;
}

/**
 * 已知的 Claude 模型上下文窗口
 * 
 * 参考：https://docs.anthropic.com/claude/reference/models-overview
 */
export const KNOWN_CONTEXT_WINDOWS: Record<string, ContextWindow> = {
  'claude-opus-4-1-20250805': {
    model: 'claude-opus-4-1-20250805',
    maxTokens: 200000,
    recommendedBuffer: 5000,
  },
  'claude-sonnet-4-20250514': {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 200000,
    recommendedBuffer: 5000,
  },
  'claude-haiku-3-5-20241022': {
    model: 'claude-haiku-3-5-20241022',
    maxTokens: 200000,
    recommendedBuffer: 5000,
  },
  // 旧版本
  'claude-3-opus-20240229': {
    model: 'claude-3-opus-20240229',
    maxTokens: 200000,
    recommendedBuffer: 5000,
  },
  'claude-3-sonnet-20240229': {
    model: 'claude-3-sonnet-20240229',
    maxTokens: 200000,
    recommendedBuffer: 5000,
  },
  'claude-3-haiku-20240307': {
    model: 'claude-3-haiku-20240307',
    maxTokens: 200000,
    recommendedBuffer: 5000,
  },
  'claude-2.1': {
    model: 'claude-2.1',
    maxTokens: 100000,
    recommendedBuffer: 5000,
  },
  'claude-2': {
    model: 'claude-2',
    maxTokens: 100000,
    recommendedBuffer: 5000,
  },
};

/**
 * 默认上下文窗口（当模型未知时使用）
 */
export const DEFAULT_CONTEXT_WINDOW: ContextWindow = {
  model: 'unknown',
  maxTokens: 200000, // 保守假设最新版本大小
  recommendedBuffer: 5000,
};

/**
 * TokenEstimator 类 - 估计 API 调用的 token 使用量
 */
export class TokenEstimator {
  private counter: TokenCounter;

  constructor() {
    this.counter = TokenCounter.getInstance();
  }

  /**
   * 根据模型名称获取上下文窗口
   * 
   * @param model 模型名称
   * @returns 上下文窗口信息，如果模型未知返回默认值
   */
  getContextWindow(model: string): ContextWindow {
    return KNOWN_CONTEXT_WINDOWS[model] || DEFAULT_CONTEXT_WINDOW;
  }

  /**
   * 估计 API 调用的 token 使用量
   * 
   * @param systemPrompt 系统提示
   * @param userMessage 用户消息
   * @param maxOutputTokens 允许的最大输出 token 数（API 调用时的 maxTokens 参数）
   * @param model 模型名称
   * @returns 详细的 token 使用估计
   * 
   * @example
   * const estimator = new TokenEstimator();
   * const estimate = estimator.estimate(
   *   'You are a code reviewer',
   *   'Review this code: ...',
   *   4000,
   *   'claude-sonnet-4-20250514'
   * );
   * console.log(estimate.status); // 'ok' 或 'warning' 或 'error'
   */
  estimate(
    systemPrompt: string,
    userMessage: string,
    maxOutputTokens: number = 4000,
    model: string = 'claude-sonnet-4-20250514',
  ): TokenEstimate {
    // 计数输入 token
    const promptCount = this.counter.countPromptTokens(systemPrompt, userMessage);

    // 计数输出 token（实际就是 maxOutputTokens）
    const estimatedOutputTokens = maxOutputTokens;

    // 计算总使用
    const totalInputTokens = promptCount.totalTokens;
    const estimatedTotalTokens = totalInputTokens + estimatedOutputTokens;

    // 获取上下文窗口
    const contextWindow = this.getContextWindow(model);
    const contextWindowSize = contextWindow.maxTokens;

    // 计算利用率和剩余空间
    const remainingTokens = contextWindowSize - totalInputTokens;
    const utilizationPercentage = (totalInputTokens / contextWindowSize) * 100;

    // 检查是否超出窗口
    const exceedsWindow = estimatedTotalTokens > contextWindowSize;

    // 确定状态和消息
    let status: TokenStatus = 'ok';
    let statusMessage = '';

    if (exceedsWindow) {
      status = 'error';
      statusMessage = `总 token 使用 ${estimatedTotalTokens} 超出上下文窗口 ${contextWindowSize}。` +
        `需要减少输入或降低 maxOutputTokens。`;
    } else if (estimatedTotalTokens > contextWindowSize - contextWindow.recommendedBuffer) {
      status = 'warning';
      statusMessage = `总 token 使用 ${estimatedTotalTokens} 接近上下文窗口上限 ${contextWindowSize}。` +
        `建议预留至少 ${contextWindow.recommendedBuffer} tokens 的缓冲。`;
    } else if (utilizationPercentage > 80) {
      status = 'warning';
      statusMessage = `输入 token 利用率 ${utilizationPercentage.toFixed(1)}% 超过 80%，` +
        `剩余空间有限，无法处理长输出。`;
    } else {
      statusMessage = `正常。输入利用率 ${utilizationPercentage.toFixed(1)}%，` +
        `剩余 ${remainingTokens} tokens 用于输出。`;
    }

    return {
      model,
      systemPromptTokens: promptCount.systemPromptTokens,
      userMessageTokens: promptCount.userMessageTokens,
      overheadTokens: promptCount.overheadTokens,
      totalInputTokens,
      estimatedOutputTokens,
      estimatedTotalTokens,
      contextWindowSize,
      remainingTokens,
      utilizationPercentage,
      exceedsWindow,
      status,
      statusMessage,
    };
  }

  /**
   * 验证估计是否安全
   * 
   * @param estimate 估计结果
   * @param throwOnError 是否在出错时抛出异常（默认 false）
   * @returns 是否安全
   * @throws 如果 throwOnError=true 且状态为 error，抛出异常
   * 
   * @example
   * const estimator = new TokenEstimator();
   * const estimate = estimator.estimate(systemPrompt, userMessage, 4000);
   * 
   * if (!estimator.isValid(estimate)) {
   *   console.warn(estimate.statusMessage);
   * }
   */
  isValid(estimate: TokenEstimate, throwOnError: boolean = false): boolean {
    if (estimate.status === 'error') {
      if (throwOnError) {
        throw new Error(`Token 估计错误: ${estimate.statusMessage}`);
      }
      return false;
    }
    return true;
  }

  /**
   * 获取估计的详细摘要（用于日志）
   * 
   * @param estimate 估计结果
   * @returns 人类可读的摘要
   * 
   * @example
   * const estimator = new TokenEstimator();
   * const estimate = estimator.estimate(systemPrompt, userMessage, 4000);
   * console.log(estimator.summarize(estimate));
   * // 输出: [claude-sonnet-4-20250514] 输入: 1500 tokens (0.8%) | 输出预估: 4000 | 总计: 5500 | 状态: ok
   */
  summarize(estimate: TokenEstimate): string {
    return (
      `[${estimate.model}] ` +
      `输入: ${estimate.totalInputTokens} tokens (${estimate.utilizationPercentage.toFixed(1)}%) | ` +
      `输出预估: ${estimate.estimatedOutputTokens} | ` +
      `总计: ${estimate.estimatedTotalTokens} | ` +
      `状态: ${estimate.status}`
    );
  }

  /**
   * 计算节省 token 的潜力
   * 
   * 比较两个提示词，看改进后可以节省多少 token
   * 
   * @param originalSystemPrompt 原始系统提示
   * @param improvedSystemPrompt 改进的系统提示
   * @param userMessage 用户消息
   * @returns 节省的 token 数和百分比
   * 
   * @example
   * const estimator = new TokenEstimator();
   * const savings = estimator.calculateSavings(
   *   originalSystemPrompt,
   *   improvedSystemPrompt,
   *   userMessage
   * );
   * console.log(`节省: ${savings.tokensSaved} tokens (${savings.percentageSaved}%)`);
   */
  calculateSavings(
    originalSystemPrompt: string,
    improvedSystemPrompt: string,
    userMessage: string,
  ): { tokensSaved: number; percentageSaved: number } {
    const originalCount = this.counter.countPromptTokens(originalSystemPrompt, userMessage);
    const improvedCount = this.counter.countPromptTokens(improvedSystemPrompt, userMessage);

    const tokensSaved = originalCount.totalTokens - improvedCount.totalTokens;
    const percentageSaved = (tokensSaved / originalCount.totalTokens) * 100;

    return {
      tokensSaved: Math.max(0, tokensSaved),
      percentageSaved: Math.max(0, percentageSaved),
    };
  }
}

/**
 * 便捷函数：快速估计 token 使用量
 */
export function estimate(
  systemPrompt: string,
  userMessage: string,
  maxOutputTokens?: number,
  model?: string,
): TokenEstimate {
  const estimator = new TokenEstimator();
  return estimator.estimate(systemPrompt, userMessage, maxOutputTokens, model);
}

/**
 * 便捷函数：快速验证 token 使用量
 */
export function validateTokens(
  systemPrompt: string,
  userMessage: string,
  maxOutputTokens?: number,
  model?: string,
  throwOnError: boolean = false,
): boolean {
  const estimator = new TokenEstimator();
  const tokenEstimate = estimator.estimate(systemPrompt, userMessage, maxOutputTokens, model);
  return estimator.isValid(tokenEstimate, throwOnError);
}
