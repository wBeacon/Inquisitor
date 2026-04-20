/**
 * Prompt Versioning Types - 版本化管理的类型定义
 *
 * 设计原则：
 * 1. 支持语义版本化 (semver) - major.minor.patch(-prerelease)(+build)
 * 2. 每个版本为独立的 Prompt 快照，包含完整内容和元数据
 * 3. 版本选择支持确定性 A/B 测试分配
 * 4. 版本历史可完整追踪，支持快速回滚
 */

import { ReviewDimension } from '../../../types';

/**
 * Prompt 版本元数据
 */
export interface PromptVersionMetadata {
  /** 版本号 (semver): "1.0.0", "1.1.0-beta", "2.0.0-rc.1" */
  version: string;
  /** 创建时间 (ISO 8601) */
  createdAt: string;
  /** 更新时间 (ISO 8601) */
  updatedAt: string;
  /** 作者 */
  author?: string;
  /** 版本描述/改进说明 */
  description: string;
  /** 变更日志 */
  changelog?: string;
  /** 版本标签 (如: production, experimental, beta, stable) */
  tags: string[];
  /** Git commit 哈希 (如果是从 Git 版本化) */
  gitCommit?: string;
  /** 是否为发布版本 */
  isReleased: boolean;
  /** 是否已弃用 */
  deprecated: boolean;
}

/**
 * Prompt 版本性能指标
 */
export interface PromptVersionMetrics {
  /** 平均准确度 (0-1) */
  averageAccuracy?: number;
  /** 平均置信度 (0-1) */
  averageConfidence?: number;
  /** 平均使用 token 数 */
  averageTokens?: number;
  /** 已使用次数 */
  usageCount?: number;
  /** 上一次使用时间 */
  lastUsedAt?: string;
  /** 性能等级 (A-F) */
  performanceGrade?: 'A' | 'B' | 'C' | 'D' | 'F';
  /** 问题 issue 平均数 */
  averageIssueCount?: number;
}

/**
 * 版本化的 Prompt - 完整版本快照
 */
export interface VersionedPrompt {
  /** 所属维度 */
  dimension: ReviewDimension;
  /** 版本元数据 */
  metadata: PromptVersionMetadata;
  /** Prompt 完整内容 */
  content: string;
  /** 性能指标 */
  metrics?: PromptVersionMetrics;
}

/**
 * Prompt 版本列表项 - 用于版本列表显示
 */
export interface PromptVersionListItem {
  dimension: ReviewDimension;
  version: string;
  description: string;
  createdAt: string;
  author?: string;
  tags: string[];
  isReleased: boolean;
  deprecated: boolean;
  metrics?: PromptVersionMetrics;
}

/**
 * 版本选择策略
 */
export enum VersionSelectionStrategy {
  /** 总是使用最新版本 */
  LATEST = 'latest',
  /** 使用生产稳定版本 */
  STABLE = 'stable',
  /** 使用 A/B 测试指定版本 */
  AB_TEST = 'ab-test',
  /** 根据权重选择版本 */
  WEIGHTED = 'weighted',
  /** 用户明确指定版本 */
  EXPLICIT = 'explicit',
}

/**
 * 版本选择结果
 */
export interface VersionSelectionResult {
  /** 选中的版本号 */
  selectedVersion: string;
  /** 选择策略 */
  strategy: VersionSelectionStrategy;
  /** 是否是 A/B 测试变体 */
  isABTestVariant?: boolean;
  /** A/B 测试分组 (如果适用) */
  abTestGroup?: 'A' | 'B';
  /** 选择原因/说明 */
  reason?: string;
}

/**
 * 版本对比结果
 */
export interface VersionComparison {
  /** 版本 A */
  versionA: string;
  /** 版本 B */
  versionB: string;
  /** 字符差异 */
  charDiff: number;
  /** 行差异 */
  lineDiff: number;
  /** 主要变更 (统计) */
  changes: {
    additions: number;
    deletions: number;
    modifications: number;
  };
  /** Diff 内容 (unified diff format) */
  diff?: string;
  /** 性能对比 */
  performanceComparison?: {
    versionAMetrics?: PromptVersionMetrics;
    versionBMetrics?: PromptVersionMetrics;
    improvement?: number; // 百分比
  };
}

/**
 * 版本回滚请求
 */
export interface VersionRollbackRequest {
  /** 目标维度 */
  dimension: ReviewDimension;
  /** 回滚到的版本号 */
  targetVersion: string;
  /** 原因 */
  reason: string;
  /** 回滚者 */
  rolledBackBy?: string;
  /** 是否备份当前版本 */
  backupCurrent?: boolean;
}

/**
 * 版本回滚结果
 */
export interface VersionRollbackResult {
  /** 成功 */
  success: boolean;
  /** 前一个版本 */
  previousVersion: string;
  /** 新版本 */
  newVersion: string;
  /** 备份版本 (如果有备份) */
  backupVersion?: string;
  /** 完成时间 */
  completedAt: string;
  /** 消息 */
  message: string;
}

/**
 * 版本查询选项
 */
export interface VersionQueryOptions {
  /** 版本号/模式 (支持 *, 如 "1.*" 匹配 1.0.0, 1.1.0 等) */
  version?: string;
  /** 过滤标签 */
  tags?: string[];
  /** 包括已弃用版本 */
  includeDeprecated?: boolean;
  /** 分页 */
  limit?: number;
  offset?: number;
  /** 排序字段 */
  sortBy?: 'version' | 'createdAt' | 'performance';
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
}

/**
 * 版本查询结果
 */
export interface VersionQueryResult {
  /** 匹配的版本列表 */
  versions: PromptVersionListItem[];
  /** 总数 */
  total: number;
  /** 分页信息 */
  pagination: {
    limit: number;
    offset: number;
    page: number;
    pageSize: number;
  };
}

/**
 * 版本化 Prompt 注册表 - 所有维度的版本集合
 */
export interface VersionedPromptRegistry {
  /** 各维度的版本列表 */
  [dimension: string]: VersionedPrompt[];
}

/**
 * 版本化配置 - 在 AgentConfig 中使用
 */
export interface PromptVersioningConfig {
  /** 是否启用版本化 */
  enabled: boolean;
  /** 版本选择策略 */
  strategy: VersionSelectionStrategy;
  /** 显式指定的版本 (当 strategy 为 EXPLICIT 时) */
  explicitVersion?: string;
  /** A/B 测试配置 (当 strategy 为 AB_TEST 时) */
  abTestConfig?: {
    versionA: string;
    versionB: string;
    trafficSplitPercentage: number; // A 版本的流量百分比 (0-100)
  };
  /** 权重配置 (当 strategy 为 WEIGHTED 时) */
  weights?: {
    [version: string]: number; // 0-1 之间的权重
  };
}
