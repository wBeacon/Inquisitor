import { ReviewDimension, ReviewIssue } from './review';
import { PromptVersioningConfig } from '../agents/prompts/versioning/types';

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
  /** Prompt 版本控制配置（可选，当启用时使用版本化的 Prompt） */
  promptVersioning?: PromptVersioningConfig;
}

/**
 * Token usage metrics for detailed tracking
 */
export interface TokenMetrics {
  // Pre-API estimation
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;

  // Actual vs estimated
  actualInputTokens: number;
  actualOutputTokens: number;
  actualTotalTokens: number;

  // Efficiency tracking
  efficiency: {
    inputAccuracy: number; // actual / estimated (1.0 = perfect)
    outputAccuracy: number;
    totalAccuracy: number;
  };

  // Context window tracking
  contextWindowSize: number;
  utilizationPercentage: number;

  // Pre-API validation
  preApiStatus: 'ok' | 'warning' | 'error';
  preApiMessage: string;
}

/**
 * Prompt 版本信息 - 在 AgentResult 中追踪使用的版本
 */
export interface PromptVersionInfo {
  /** 使用的 Prompt 版本号 */
  version: string;
  /** 版本选择策略 */
  strategy: string;
  /** 是否是 A/B 测试变体 */
  isABTestVariant?: boolean;
  /** A/B 测试分组 */
  abTestGroup?: 'A' | 'B';
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
  /** 详细的 token 度量信息（可选） */
  tokenMetrics?: TokenMetrics;
  /** 使用的 Prompt 版本信息（可选，当启用版本化时） */
  promptVersionInfo?: PromptVersionInfo;
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
    existingIssues: ReviewIssue[],
  ): Promise<AdversaryResult>;
}

/**
 * 对抗 Agent 对单个已有问题的判断结果
 */
export interface IssueJudgment {
  /** 已有问题列表中的索引 */
  existingIssueIndex: number;
  /** 判断结果：confirmed、disputed、false_positive */
  judgment: 'confirmed' | 'disputed' | 'false_positive';
  /** 判断理由（必须非空） */
  reason: string;
  /** 建议的置信度调整 */
  suggestedConfidenceAdjustment?: number;
  /** 建议的严重程度调整 */
  suggestedSeverityAdjustment?: string;
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
  /** 对抗 Agent 对每个已有问题的完整判断（可选，供 IssueCalibrator 使用） */
  judgments?: IssueJudgment[];
}

/**
 * MetaReviewResult - 元审查最终结果
 * 包含整体质量评级、根因分析、最终裁决和被驳回的问题索引
 */
export interface MetaReviewResult {
  /** 整体质量评级：A（优秀）、B（良好）、C（中等）、D（较差）、F（不及格） */
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** 根因分析列表（每个条目是对一个根因的自然语言描述） */
  rootCauses: string[];
  /** 最终裁决 */
  verdict: 'approve' | 'request_changes' | 'needs_discussion';
  /** 被驳回的问题索引（不应出现在最终报告中） */
  dismissedIssueIndices: number[];
}

/**
 * 编排器接口 - 管理整个审查流程
 */
export interface Orchestrator {
  /** 执行完整的审查流程 */
  run(request: import('./review').ReviewRequest): Promise<import('./review').ReviewReport>;
}
