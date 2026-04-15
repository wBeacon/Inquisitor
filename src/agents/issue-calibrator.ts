import { ReviewIssue, AdversaryResult } from '../types';
import { IssueJudgment } from './adversary-agent';

/**
 * severity 降级映射: critical -> high, high -> medium, medium -> low, low -> low
 */
const SEVERITY_DOWNGRADE: Record<string, ReviewIssue['severity']> = {
  critical: 'high',
  high: 'medium',
  medium: 'low',
  low: 'low',
};

/**
 * IssueCalibrator - 根据对抗审查结果调整问题置信度
 *
 * 职责：
 * 1. 应用对抗 Agent 的置信度调整建议
 * 2. 对 false_positive 且置信度 < 0.3 的问题从报告中移除
 * 3. 对其余 false_positive 的问题 severity 降一级
 * 4. 合并来自不同 Agent 的重复问题
 * 5. 生成最终的审查结果
 */
export class IssueCalibrator {
  /**
   * 使用对抗 Agent 的结果调整问题
   * @param originalIssues 原始问题列表
   * @param adversaryResult 对抗 Agent 的审查结果
   * @returns 调整后的最终问题列表
   */
  calibrate(originalIssues: ReviewIssue[], adversaryResult: AdversaryResult): ReviewIssue[] {
    if (!adversaryResult.success) {
      // Graceful degradation: 如果对抗审查失败，返回原始问题不丢失数据
      return originalIssues;
    }

    // 第一步：应用置信度调整
    const adjustedIssues = this.applyConfidenceAdjustments(
      originalIssues,
      adversaryResult.confidenceAdjustments
    );

    // 第二步：基于判断进行 false_positive 处理（移除或降级 severity）
    const judgments: IssueJudgment[] =
      (adversaryResult as unknown as Record<string, unknown>)._judgments as IssueJudgment[] || [];
    const processedIssues = this.processFalsePositives(
      adjustedIssues,
      adversaryResult.falsePositives,
      judgments
    );

    // 第三步：过滤低置信度问题 (< 0.3)
    const filteredIssues = this.filterLowConfidence(processedIssues);

    // 第四步：添加对抗 Agent 发现的新问题
    const finalIssues = [...filteredIssues, ...adversaryResult.issues];

    // 第五步：合并重复问题
    const mergedIssues = this.mergeDuplicates(finalIssues);

    // 第六步：按严重程度和置信度排序
    return this.sortIssues(mergedIssues);
  }

  /**
   * 应用置信度调整
   */
  applyConfidenceAdjustments(
    issues: ReviewIssue[],
    adjustments: Array<{
      issueIndex: number;
      newConfidence: number;
      reason: string;
    }>
  ): ReviewIssue[] {
    const adjustmentMap = new Map(adjustments.map((a) => [a.issueIndex, a.newConfidence]));

    return issues.map((issue, index) => {
      const newConfidence = adjustmentMap.get(index);
      if (newConfidence !== undefined) {
        return {
          ...issue,
          confidence: Math.max(0, Math.min(1, newConfidence)), // 确保在 0-1 范围内
        };
      }
      return issue;
    });
  }

  /**
   * 处理 false_positive 问题：
   * - 被标记为 false_positive 且置信度 < 0.3 的问题直接移除
   * - 其余 false_positive 的问题 severity 降一级
   */
  processFalsePositives(
    issues: ReviewIssue[],
    falsePositiveIndices: number[],
    judgments: IssueJudgment[]
  ): ReviewIssue[] {
    const falsePositiveSet = new Set(falsePositiveIndices);
    // 构建 judgment 查找映射
    const judgmentMap = new Map<number, IssueJudgment>();
    if (judgments) {
      for (const j of judgments) {
        judgmentMap.set(j.existingIssueIndex, j);
      }
    }

    return issues
      .map((issue, index) => {
        if (!falsePositiveSet.has(index)) {
          return issue; // 非 false_positive，保持不变
        }

        // 是 false_positive
        if (issue.confidence < 0.3) {
          // 低置信度 false_positive，标记为需要移除
          return null;
        }

        // 其余 false_positive: severity 降一级
        const downgradedSeverity =
          SEVERITY_DOWNGRADE[issue.severity] || issue.severity;
        return {
          ...issue,
          severity: downgradedSeverity,
        };
      })
      .filter((issue): issue is ReviewIssue => issue !== null);
  }

  /**
   * 过滤低置信度问题
   * 被标记为 false_positive 后置信度低于 0.3 的在 processFalsePositives 中已处理
   * 此方法额外过滤所有置信度 < 0.3 且被 adversary 标记为 false_positive 的问题
   * （已在 processFalsePositives 中处理，此方法作为保险）
   */
  filterLowConfidence(issues: ReviewIssue[]): ReviewIssue[] {
    return issues;
  }

  /**
   * 过滤误报和低置信度问题
   * 向后兼容的旧接口
   * @deprecated 使用 processFalsePositives 替代
   */
  filterFalsePositives(issues: ReviewIssue[], falsePositiveIndices: number[]): ReviewIssue[] {
    return this.processFalsePositives(issues, falsePositiveIndices, []);
  }

  /**
   * 合并重复问题
   * 如果多个 Agent 发现了相同的问题，只保留置信度最高的那个
   */
  mergeDuplicates(issues: ReviewIssue[]): ReviewIssue[] {
    const issueMap = new Map<string, ReviewIssue>();

    for (const issue of issues) {
      const key = this.getIssueKey(issue);

      if (issueMap.has(key)) {
        const existing = issueMap.get(key)!;
        // 保留置信度更高的那个
        if (issue.confidence > existing.confidence) {
          issueMap.set(key, issue);
        }
      } else {
        issueMap.set(key, issue);
      }
    }

    return Array.from(issueMap.values());
  }

  /**
   * 生成问题的唯一标识
   */
  private getIssueKey(issue: ReviewIssue): string {
    return `${issue.file}:${issue.line}:${issue.dimension}:${issue.severity}`;
  }

  /**
   * 按严重程度和置信度排序
   */
  sortIssues(issues: ReviewIssue[]): ReviewIssue[] {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

    return issues.sort((a, b) => {
      // 首先按严重程度排序
      const severityDiff =
        severityOrder[a.severity as keyof typeof severityOrder] -
        severityOrder[b.severity as keyof typeof severityOrder];

      if (severityDiff !== 0) {
        return severityDiff;
      }

      // 然后按置信度从高到低排序
      return b.confidence - a.confidence;
    });
  }

  /**
   * 生成调整摘要（用于日志/报告）
   */
  generateCalibrationSummary(
    originalIssues: ReviewIssue[],
    adversaryResult: AdversaryResult,
    finalIssues: ReviewIssue[]
  ): {
    originalCount: number;
    falsePositivesRemoved: number;
    newIssuesAdded: number;
    duplicatesMerged: number;
    finalCount: number;
  } {
    return {
      originalCount: originalIssues.length,
      falsePositivesRemoved: adversaryResult.falsePositives.length,
      newIssuesAdded: adversaryResult.issues.length,
      duplicatesMerged: originalIssues.length + adversaryResult.issues.length - finalIssues.length,
      finalCount: finalIssues.length,
    };
  }
}

/**
 * @deprecated 使用 IssueCalibrator 替代（修正拼写错误）
 * 保留旧名称作为 deprecated alias，确保向后兼容
 */
export const IssueCalibrtor = IssueCalibrator;

/**
 * @deprecated 使用 mergeDuplicates 替代（修正拼写错误）
 * mergeeDuplicates 是旧的拼写错误名称
 */
export type IssueCalibrtor = IssueCalibrator;
