import { ReviewReport, ReviewIssue, Severity } from './review';
import { AgentResult } from './agent';

/**
 * 根因分析 - 描述一个根本问题及其影响范围
 */
export interface RootCause {
  /** 根因描述 */
  description: string;
  /** 与这个根因相关的问题索引 */
  affectedIssueIndices: number[];
  /** 这个根因的严重程度 */
  severity: Severity;
}

/**
 * 元审查判决 - 对已有问题的最终裁决
 */
export interface MetaReviewVerdict {
  /** 被驳回的问题索引（认为不应该报告） */
  dismissedIssueIndices: number[];
  /** 被提升优先级的问题索引 */
  elevatedIssueIndices: number[];
  /** 最终执行摘要 */
  summary: string;
}

/**
 * 元审查结果摘要 - 整体质量评估
 */
export interface MetaReviewSummary {
  /** 整体质量评级：A（优秀）、B（良好）、C（中等）、D（较差）、F（不及格） */
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** 整体质量分数（0-100） */
  qualityScore: number;
  /** 代码覆盖率估计（0-100） */
  coveragePercentage: number;
  /** 审查完整性评估（0-100） */
  completenessPercentage: number;
  /** 关键发现数量 */
  criticalFindingsCount: number;
  /** 优先级建议 */
  priorityRecommendation: string;
}

/**
 * 元审查报告 - 完整的元审查分析结果
 */
export interface MetaReviewReport extends AgentResult {
  /** 整体质量评估 */
  summary: MetaReviewSummary;
  /** 根因分析结果 */
  rootCauses: RootCause[];
  /** 最终判决 */
  verdict: MetaReviewVerdict;
  /** 附加的元审查观察 */
  observations?: string[];
}

/**
 * 元审查问题 - 对审查流程本身的问题
 */
export interface MetaReviewIssue {
  /** 问题分类：coverage（覆盖不足）、accuracy（准确性有疑）、duplication（重复）、inconsistency（不一致） */
  category: 'coverage' | 'accuracy' | 'duplication' | 'inconsistency';
  /** 问题描述 */
  description: string;
  /** 相关问题索引（如适用） */
  relatedIssueIndices?: number[];
  /** 建议 */
  suggestion: string;
  /** 严重程度 */
  severity: Severity;
}
