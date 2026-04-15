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
