import { ReviewIssue, AdversaryResult } from '../types';

/**
 * IssueCalibrtor - 根据对抗审查结果调整问题置信度
 * 
 * 职责：
 * 1. 应用对抗 Agent 的置信度调整建议
 * 2. 删除/降级被标记为误报的问题
 * 3. 合并来自不同 Agent 的重复问题
 * 4. 生成最终的审查结果
 */
export class IssueCalibrtor {
  /**
   * 使用对抗 Agent 的结果调整问题
   * @param originalIssues 原始问题列表
   * @param adversaryResult 对抗 Agent 的审查结果
   * @returns 调整后的最终问题列表
   */
  calibrate(originalIssues: ReviewIssue[], adversaryResult: AdversaryResult): ReviewIssue[] {
    if (!adversaryResult.success) {
      // 如果对抗审查失败，返回原始问题
      return originalIssues;
    }

    // 第一步：应用置信度调整
    const adjustedIssues = this.applyConfidenceAdjustments(
      originalIssues,
      adversaryResult.confidenceAdjustments
    );

    // 第二步：过滤误报和低置信度问题
    const filteredIssues = this.filterFalsePositives(adjustedIssues, adversaryResult.falsePositives);

    // 第三步：添加对抗 Agent 发现的新问题
    const finalIssues = [...filteredIssues, ...adversaryResult.issues];

    // 第四步：合并重复问题
    const mergedIssues = this.mergeeDuplicates(finalIssues);

    // 第五步：按严重程度和置信度排序
    return this.sortIssues(mergedIssues);
  }

  /**
   * 应用置信度调整
   */
  private applyConfidenceAdjustments(
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
   * 过滤误报和低置信度问题
   * @param issues 问题列表
   * @param falsePositiveIndices 被标记为误报的索引
   */
  private filterFalsePositives(issues: ReviewIssue[], falsePositiveIndices: number[]): ReviewIssue[] {
    const falsePositiveSet = new Set(falsePositiveIndices);

    return issues.filter((_, index) => {
      // 如果被标记为误报，过滤掉
      if (falsePositiveSet.has(index)) {
        return false;
      }

      // 如果置信度过低（< 0.3），也过滤掉
      return true;
    });
  }

  /**
   * 合并重复问题
   * 如果多个 Agent 发现了相同的问题，只保留置信度最高的那个
   */
  private mergeeDuplicates(issues: ReviewIssue[]): ReviewIssue[] {
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
  private sortIssues(issues: ReviewIssue[]): ReviewIssue[] {
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
