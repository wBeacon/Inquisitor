import { ReviewIssue, ReviewSummary, ReviewDimension, Severity } from '../types';
import { ExtendedReviewMetadata } from '../orchestrator/orchestrator';

/**
 * InquisitorAgent 配置
 */
export interface InquisitorAgentConfig {
  /** LLM 模型名称 */
  model?: string;
  /** LLM 提供商配置 */
  provider?: {
    type: 'anthropic' | string;
    baseUrl?: string;
    apiKey?: string;
  };
  /** 总超时时间（毫秒） */
  timeout?: number;
  /** 单个 Agent 超时时间（毫秒） */
  agentTimeout?: number;
  /** 是否启用对抗审查 */
  enableAdversary?: boolean;
  /** 最大并行 Agent 数量 */
  maxParallel?: number;
}

/**
 * InquisitorAgent 输入
 */
export interface InquisitorInput {
  /** 待审查的文件列表 */
  files: Array<{
    /** 文件路径 */
    path: string;
    /** 文件内容（可选，若不提供则从磁盘读取） */
    content?: string;
    /** 文件 diff 内容（可选，用于增量审查） */
    diff?: string;
  }>;
  /** 审查选项 */
  options?: {
    /** 审查维度过滤 */
    dimensions?: ReviewDimension[];
    /** 严重程度阈值 */
    severityThreshold?: Severity;
    /** 是否启用对抗审查 */
    enableAdversary?: boolean;
    /** 自定义模型 */
    model?: string;
  };
}

/**
 * InquisitorAgent 输出
 */
export interface InquisitorOutput {
  /** 审查发现的问题列表 */
  issues: ReviewIssue[];
  /** 审查统计摘要 */
  summary: ReviewSummary;
  /** 审查元数据 */
  metadata: ExtendedReviewMetadata;
}

/**
 * Agent 架构信息（用于 Agent 发现） */
export interface AgentSchema {
  /** Agent 名称 */
  name: string;
  /** Agent 描述 */
  description: string;
  /** 输入架构 */
  input: any;
}
