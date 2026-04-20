/**
 * Token Manager - 基于 Anthropic token counting 的 prompt 长度预估和成本管理
 *
 * 设计原则：
 * 1. 使用 js-tiktoken (cl100k_base) 进行精确 token 计数
 * 2. 为不同模型配置独立的 token 策略（maxInputTokens、recommendedMaxOutput）
 * 3. 提供每次审查的 token 消耗预估报告（各 Agent 预估输入/输出/成本）
 * 4. 与 PromptOptimizer 协作，在超出阈值时触发截断/压缩
 */

import { TokenCounter } from '../../utils/token-counter';

/**
 * 模型 token 配置
 */
export interface ModelTokenConfig {
  /** 模型标识 */
  modelId: string;
  /** 模型友好名称 */
  displayName: string;
  /** 上下文窗口大小（总 token 数） */
  contextWindow: number;
  /** 最大输入 token 数（推荐值，通常留出输出空间） */
  maxInputTokens: number;
  /** 推荐的最大输出 token 数 */
  recommendedMaxOutput: number;
  /** 输入价格（每百万 token，美元） */
  inputPricePerMillion: number;
  /** 输出价格（每百万 token，美元） */
  outputPricePerMillion: number;
}

/**
 * 单个 Agent 的 token 消耗预估
 */
export interface AgentTokenEstimate {
  /** Agent 标识 */
  agentId: string;
  /** 预估输入 token 数 */
  estimatedInputTokens: number;
  /** 预估输出 token 数 */
  estimatedOutputTokens: number;
  /** 预估总 token 数 */
  estimatedTotalTokens: number;
  /** 预估输入成本（美元） */
  estimatedInputCost: number;
  /** 预估输出成本（美元） */
  estimatedOutputCost: number;
  /** 预估总成本（美元） */
  estimatedTotalCost: number;
}

/**
 * 审查 token 消耗预估报告
 */
export interface TokenCostReport {
  /** 使用的模型配置 */
  model: string;
  /** 各 Agent 的预估 */
  perAgent: AgentTokenEstimate[];
  /** 总预估输入 token */
  totalInputTokens: number;
  /** 总预估输出 token */
  totalOutputTokens: number;
  /** 总预估 token */
  totalTokens: number;
  /** 总预估输入成本（美元） */
  totalInputCost: number;
  /** 总预估输出成本（美元） */
  totalOutputCost: number;
  /** 总预估成本（美元） */
  totalCost: number;
}

/**
 * 已知的 Claude 模型配置
 *
 * 定价参考: https://docs.anthropic.com/en/docs/about-claude/models
 * claude-sonnet-4-20250514: 200K context, $3/$15 per million tokens
 * claude-3-5-haiku-20241022: 200K context, $0.80/$4 per million tokens
 */
export const MODEL_CONFIGS: Record<string, ModelTokenConfig> = {
  'claude-sonnet-4-20250514': {
    modelId: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet 4',
    contextWindow: 200000,
    maxInputTokens: 195000,
    recommendedMaxOutput: 8192,
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
  },
  'claude-3-5-haiku-20241022': {
    modelId: 'claude-3-5-haiku-20241022',
    displayName: 'Claude 3.5 Haiku',
    contextWindow: 200000,
    maxInputTokens: 195000,
    recommendedMaxOutput: 8192,
    inputPricePerMillion: 0.8,
    outputPricePerMillion: 4,
  },
  'claude-opus-4-1-20250805': {
    modelId: 'claude-opus-4-1-20250805',
    displayName: 'Claude Opus 4.1',
    contextWindow: 200000,
    maxInputTokens: 195000,
    recommendedMaxOutput: 8192,
    inputPricePerMillion: 15,
    outputPricePerMillion: 75,
  },
};

/**
 * 默认模型配置（未知模型的回退）
 */
export const DEFAULT_MODEL_CONFIG: ModelTokenConfig = {
  modelId: 'unknown',
  displayName: 'Unknown Model',
  contextWindow: 200000,
  maxInputTokens: 195000,
  recommendedMaxOutput: 8192,
  inputPricePerMillion: 3,
  outputPricePerMillion: 15,
};

/**
 * TokenManager - token 预估与成本管理
 */
export class TokenManager {
  private counter: TokenCounter;

  constructor() {
    this.counter = TokenCounter.getInstance();
  }

  /**
   * 获取模型的 token 配置
   *
   * @param modelId 模型标识
   * @returns 对应的 ModelTokenConfig
   */
  getModelConfig(modelId: string): ModelTokenConfig {
    return MODEL_CONFIGS[modelId] || { ...DEFAULT_MODEL_CONFIG, modelId };
  }

  /**
   * 预估 prompt 的 token 数
   * 使用 js-tiktoken (cl100k_base) 进行精确计数
   *
   * @param systemPrompt 系统提示
   * @param userMessage 用户消息
   * @returns 预估的总输入 token 数
   */
  estimateInputTokens(systemPrompt: string, userMessage: string): number {
    const promptCount = this.counter.countPromptTokens(systemPrompt, userMessage);
    return promptCount.totalTokens;
  }

  /**
   * 检查 prompt 是否超过模型的上下文窗口阈值
   *
   * @param systemPrompt 系统提示
   * @param userMessage 用户消息
   * @param modelId 模型标识
   * @param maxOutputTokens 预期最大输出 token 数
   * @returns 是否超出阈值
   */
  exceedsThreshold(
    systemPrompt: string,
    userMessage: string,
    modelId: string,
    maxOutputTokens?: number,
  ): boolean {
    const config = this.getModelConfig(modelId);
    const inputTokens = this.estimateInputTokens(systemPrompt, userMessage);
    const outputTokens = maxOutputTokens || config.recommendedMaxOutput;
    return inputTokens + outputTokens > config.contextWindow;
  }

  /**
   * 预估单个 Agent 的 token 消耗和成本
   *
   * @param agentId Agent 标识
   * @param systemPrompt 系统提示
   * @param userMessage 用户消息
   * @param modelId 模型标识
   * @param maxOutputTokens 最大输出 token 数
   * @returns Agent token 消耗预估
   */
  estimateAgentCost(
    agentId: string,
    systemPrompt: string,
    userMessage: string,
    modelId: string = 'claude-sonnet-4-20250514',
    maxOutputTokens?: number,
  ): AgentTokenEstimate {
    const config = this.getModelConfig(modelId);
    const inputTokens = this.estimateInputTokens(systemPrompt, userMessage);
    const outputTokens = maxOutputTokens || config.recommendedMaxOutput;
    const totalTokens = inputTokens + outputTokens;

    const inputCost = (inputTokens / 1_000_000) * config.inputPricePerMillion;
    const outputCost = (outputTokens / 1_000_000) * config.outputPricePerMillion;

    return {
      agentId,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      estimatedTotalTokens: totalTokens,
      estimatedInputCost: inputCost,
      estimatedOutputCost: outputCost,
      estimatedTotalCost: inputCost + outputCost,
    };
  }

  /**
   * 生成完整审查的 token 消耗预估报告
   *
   * @param agents 各 Agent 的信息 (agentId, systemPrompt, userMessage)
   * @param modelId 模型标识
   * @param maxOutputTokens 最大输出 token 数
   * @returns 结构化的 token 成本报告
   */
  estimateCost(
    agents: Array<{
      agentId: string;
      systemPrompt: string;
      userMessage: string;
      maxOutputTokens?: number;
    }>,
    modelId: string = 'claude-sonnet-4-20250514',
  ): TokenCostReport {
    const config = this.getModelConfig(modelId);

    const perAgent = agents.map((agent) =>
      this.estimateAgentCost(
        agent.agentId,
        agent.systemPrompt,
        agent.userMessage,
        modelId,
        agent.maxOutputTokens,
      ),
    );

    const totalInputTokens = perAgent.reduce((sum, a) => sum + a.estimatedInputTokens, 0);
    const totalOutputTokens = perAgent.reduce((sum, a) => sum + a.estimatedOutputTokens, 0);
    const totalTokens = totalInputTokens + totalOutputTokens;

    const totalInputCost = (totalInputTokens / 1_000_000) * config.inputPricePerMillion;
    const totalOutputCost = (totalOutputTokens / 1_000_000) * config.outputPricePerMillion;

    return {
      model: modelId,
      perAgent,
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      totalInputCost,
      totalOutputCost,
      totalCost: totalInputCost + totalOutputCost,
    };
  }
}
