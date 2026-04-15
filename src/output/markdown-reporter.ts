import { ReviewReport, ReviewIssue, ReviewDimension, Severity } from '../types';

/**
 * 对抗判定标签映射（中文）
 */
const VERDICT_LABELS: Record<string, string> = {
  confirmed: '已确认',
  disputed: '存疑',
  false_positive: '误报',
};

/**
 * 严重等级中文标签
 */
const SEVERITY_LABELS: Record<string, string> = {
  critical: '严重',
  high: '高',
  medium: '中',
  low: '低',
};

/**
 * 维度中文标签
 */
const DIMENSION_LABELS: Record<string, string> = {
  [ReviewDimension.Logic]: '逻辑正确性',
  [ReviewDimension.Security]: '安全性',
  [ReviewDimension.Performance]: '性能',
  [ReviewDimension.Maintainability]: '可维护性',
  [ReviewDimension.EdgeCases]: '边界情况',
};

/**
 * MarkdownReporter - 生成可读性好的 Markdown 审查报告
 *
 * 独立模块，可独立于 JsonReporter 使用。
 * 报告按 severity 分组展示，包含代码片段引用和对抗判定结果。
 */
export class MarkdownReporter {
  /**
   * 从 ReviewReport 生成 Markdown 字符串
   * @param report - 审查报告
   * @returns Markdown 格式字符串
   */
  static generate(report: ReviewReport): string {
    const lines: string[] = [];

    // 标题
    lines.push('# Inquisitor 代码审查报告\n');

    // 概要统计
    lines.push(MarkdownReporter.generateSummarySection(report));

    // 问题详情（按 severity 分组）
    lines.push(MarkdownReporter.generateIssuesSection(report));

    // 元数据
    lines.push(MarkdownReporter.generateMetadataSection(report));

    return lines.join('\n');
  }

  /**
   * 生成概要统计部分，包含 severity 分布表格和 dimension 分布表格
   */
  private static generateSummarySection(report: ReviewReport): string {
    const lines: string[] = [];
    lines.push('## 概要统计\n');
    lines.push(`共发现 **${report.summary.totalIssues}** 个问题。\n`);

    // severity 分布表格
    lines.push('### 按严重程度分布\n');
    lines.push('| 级别 | 数量 |');
    lines.push('|------|------|');
    lines.push(`| 严重 | ${report.summary.bySeverity.critical} |`);
    lines.push(`| 高 | ${report.summary.bySeverity.high} |`);
    lines.push(`| 中 | ${report.summary.bySeverity.medium} |`);
    lines.push(`| 低 | ${report.summary.bySeverity.low} |`);
    lines.push('');

    // dimension 分布表格
    lines.push('### 按审查维度分布\n');
    lines.push('| 维度 | 数量 |');
    lines.push('|------|------|');
    for (const dim of Object.values(ReviewDimension)) {
      const count = report.summary.byDimension[dim] || 0;
      const label = DIMENSION_LABELS[dim] || dim;
      lines.push(`| ${label} | ${count} |`);
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 生成问题详情部分，按 severity 降序分组（critical -> high -> medium -> low）
   */
  private static generateIssuesSection(report: ReviewReport): string {
    if (report.issues.length === 0) {
      return '## 问题详情\n\n没有发现问题，代码质量良好。\n';
    }

    const lines: string[] = [];
    lines.push('## 问题详情\n');

    // 按 severity 降序排列: critical -> high -> medium -> low
    const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low'];

    for (const severity of severityOrder) {
      const issues = report.issues.filter(i => i.severity === severity);
      if (issues.length === 0) continue;

      const label = SEVERITY_LABELS[severity] || severity;
      lines.push(`### ${severity.toUpperCase()} (${label}) - ${issues.length} 个问题\n`);

      for (const issue of issues) {
        lines.push(MarkdownReporter.formatIssue(issue));
      }
    }

    return lines.join('\n');
  }

  /**
   * 格式化单个问题
   */
  private static formatIssue(issue: ReviewIssue): string {
    const lines: string[] = [];

    // 问题描述
    lines.push(`**${issue.description}**\n`);

    // 文件位置
    const lineRange = issue.endLine ? `${issue.line}-${issue.endLine}` : `${issue.line}`;
    lines.push(`- 文件: \`${issue.file}\``);
    lines.push(`- 行号: ${lineRange}`);
    lines.push(`- 维度: ${DIMENSION_LABELS[issue.dimension] || issue.dimension}`);
    lines.push(`- 置信度: ${(issue.confidence * 100).toFixed(1)}%`);

    // 对抗判定
    if (issue.adversaryVerdict) {
      const verdictLabel = VERDICT_LABELS[issue.adversaryVerdict] || issue.adversaryVerdict;
      lines.push(`- 对抗判定: ${issue.adversaryVerdict} (${verdictLabel})`);
    }

    // 发现者
    if (issue.foundBy) {
      lines.push(`- 发现者: ${issue.foundBy}`);
    }

    // 修复建议
    lines.push(`- 建议: ${issue.suggestion}`);

    // 代码片段
    if (issue.codeSnippet) {
      lines.push('\n代码片段:\n');
      lines.push('```');
      lines.push(issue.codeSnippet);
      lines.push('```');
    }

    lines.push('\n---\n');

    return lines.join('\n');
  }

  /**
   * 生成元数据部分
   */
  private static generateMetadataSection(report: ReviewReport): string {
    const lines: string[] = [];
    lines.push('## 审查元数据\n');

    lines.push(`- 审查耗时: ${(report.metadata.durationMs / 1000).toFixed(2)} 秒`);
    lines.push(`- Token 消耗: ${report.metadata.tokenUsage.total} (输入: ${report.metadata.tokenUsage.input}, 输出: ${report.metadata.tokenUsage.output})`);
    lines.push(`- 开始时间: ${report.metadata.startedAt}`);
    lines.push(`- 完成时间: ${report.metadata.completedAt}`);

    if (report.metadata.agents.length > 0) {
      lines.push(`- 参与 Agent: ${report.metadata.agents.join(', ')}`);
    }

    lines.push('');

    return lines.join('\n');
  }
}
