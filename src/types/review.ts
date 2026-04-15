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
