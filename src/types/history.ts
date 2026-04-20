import { ReviewReport, Severity } from './review';

/**
 * 质量评级类型
 */
export type QualityGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * 历史记录元数据 - 保存审查报告时附带的额外信息
 */
export interface HistoryMetadata {
  /** 项目标识 */
  projectId: string;
  /** Git commit hash */
  commitHash?: string;
  /** Git 分支名 */
  branch?: string;
  /** 审查涉及的文件路径列表 */
  files?: string[];
  /** 自定义标签 */
  tags?: string[];
}

/**
 * 历史记录 - 持久化存储的单条审查记录
 */
export interface HistoryRecord {
  /** 唯一标识 */
  id: string;
  /** 记录创建时间戳（ISO 8601） */
  timestamp: string;
  /** 项目标识 */
  projectId: string;
  /** Git commit hash */
  commitHash?: string;
  /** Git 分支名 */
  branch?: string;
  /** 完整审查报告 */
  report: ReviewReport;
  /** 审查涉及的文件路径列表 */
  files?: string[];
  /** 自定义标签 */
  tags?: string[];
}

/**
 * 历史记录摘要 - list 方法返回的轻量版本，不含完整 issues 列表
 */
export interface HistoryRecordSummary {
  /** 唯一标识 */
  id: string;
  /** 记录创建时间戳 */
  timestamp: string;
  /** 项目标识 */
  projectId: string;
  /** Git commit hash */
  commitHash?: string;
  /** Git 分支名 */
  branch?: string;
  /** 问题总数 */
  totalIssues: number;
  /** 各严重级别计数 */
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  /** 质量评级（如果有 metaReview） */
  qualityGrade?: QualityGrade;
  /** 审查耗时（毫秒） */
  durationMs: number;
  /** 自定义标签 */
  tags?: string[];
}

/**
 * 历史记录过滤条件
 */
export interface HistoryFilter {
  /** 按项目标识过滤 */
  projectId?: string;
  /** 按时间范围过滤 - 起始时间 */
  startDate?: string;
  /** 按时间范围过滤 - 截止时间 */
  endDate?: string;
  /** 按质量评级过滤 */
  qualityGrade?: QualityGrade;
  /** 按分支过滤 */
  branch?: string;
  /** 按标签过滤 */
  tags?: string[];
}

/**
 * ReviewHistory 构造参数
 */
export interface ReviewHistoryOptions {
  /** 存储目录路径，默认为 .inquisitor/history/ */
  storagePath?: string;
}

/**
 * 对比结果 - 两份审查报告的差异分析
 */
export interface ComparisonResult {
  /** 新增问题（reportB 有而 reportA 没有） */
  newIssues: import('./review').ReviewIssue[];
  /** 已修复问题（reportA 有而 reportB 没有） */
  fixedIssues: import('./review').ReviewIssue[];
  /** 持续存在的问题（两份报告都有） */
  persistingIssues: import('./review').ReviewIssue[];
  /** 各严重级别变化: { severity: newCount - oldCount } */
  severityChanges: Record<Severity, number>;
  /** 质量评级变化 */
  qualityGradeChange?: {
    from?: QualityGrade;
    to?: QualityGrade;
  };
  /** 问题总数变化 */
  totalIssuesDelta: number;
}

/**
 * 趋势数据点
 */
export interface TrendDataPoint {
  /** 记录 ID */
  recordId: string;
  /** 时间戳 */
  timestamp: string;
  /** 问题总数 */
  totalIssues: number;
  /** 各严重级别计数 */
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  /** 质量评级 */
  qualityGrade?: QualityGrade;
}

/**
 * 趋势分析结果
 */
export interface TrendResult {
  /** 按时间排序的数据点 */
  dataPoints: TrendDataPoint[];
  /** issue 总数变化趋势: 'improving' | 'degrading' | 'stable' */
  overallTrend: 'improving' | 'degrading' | 'stable';
  /** 各严重级别趋势 */
  severityTrends: Record<Severity, 'improving' | 'degrading' | 'stable'>;
  /** 质量评级变化轨迹 */
  qualityGradeTrajectory: Array<{ timestamp: string; grade?: QualityGrade }>;
  /** 平均修复速度：两次审查间修复的 issue 数 / 时间间隔（issue/天） */
  averageFixRate: number;
}

/**
 * 审查效率指标
 */
export interface EfficiencyMetrics {
  /** 平均审查耗时（毫秒） */
  averageDurationMs: number;
  /** 平均 token 消耗 */
  averageTokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  /** 每千行代码发现问题数（如果有文件信息） */
  issuesPerKLoc?: number;
  /** 误报率趋势（如有 adversary 数据） */
  falsePositiveRateTrend: Array<{
    timestamp: string;
    rate: number;
  }>;
  /** 总审查次数 */
  totalReviews: number;
}
