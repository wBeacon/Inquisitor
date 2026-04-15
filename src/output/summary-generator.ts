import { ReviewIssue, ReviewSummary, ReviewDimension, SeverityCount } from '../types';

/**
 * SummaryGenerator - 从 ReviewIssue[] 生成 ReviewSummary 统计信息
 *
 * 独立可复用的统计生成器，不依赖任何报告格式。
 */
export class SummaryGenerator {
  /**
   * 从问题列表生成统计摘要
   * @param issues - 审查发现的问题列表
   * @returns ReviewSummary 统计信息
   */
  static generate(issues: ReviewIssue[]): ReviewSummary {
    return {
      totalIssues: issues.length,
      bySeverity: SummaryGenerator.countBySeverity(issues),
      byDimension: SummaryGenerator.countByDimension(issues),
    };
  }

  /**
   * 按严重等级统计问题数量
   */
  static countBySeverity(issues: ReviewIssue[]): SeverityCount {
    const counts: SeverityCount = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const issue of issues) {
      if (issue.severity in counts) {
        counts[issue.severity]++;
      }
    }

    return counts;
  }

  /**
   * 按审查维度统计问题数量
   */
  static countByDimension(issues: ReviewIssue[]): Record<ReviewDimension, number> {
    // 初始化所有维度为 0
    const counts: Record<ReviewDimension, number> = {
      [ReviewDimension.Logic]: 0,
      [ReviewDimension.Security]: 0,
      [ReviewDimension.Performance]: 0,
      [ReviewDimension.Maintainability]: 0,
      [ReviewDimension.EdgeCases]: 0,
    };

    for (const issue of issues) {
      const dim = issue.dimension as ReviewDimension;
      if (dim in counts) {
        counts[dim]++;
      }
    }

    return counts;
  }
}

/**
 * 便捷函数：从 ReviewIssue[] 生成 ReviewSummary
 */
export function generateSummary(issues: ReviewIssue[]): ReviewSummary {
  return SummaryGenerator.generate(issues);
}
