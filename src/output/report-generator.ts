import * as fs from 'fs';
import * as path from 'path';
import { ReviewReport, ReviewIssue, ReviewDimension, Severity } from '../types';

/**
 * 报告生成器配置
 */
export interface GeneratorConfig {
  /** 输出格式（'json', 'markdown', 'both'） */
  formats?: Array<'json' | 'markdown'>;
  /** Markdown 主题（'dark' | 'light'） */
  theme?: 'dark' | 'light';
  /** 自定义模板 */
  templates?: {
    jsonIndent?: number;
    markdownTitle?: string;
    markdownTemplate?: string;
  };
  /** 是否输出代码片段 */
  includeCodeSnippets?: boolean;
}

/**
 * 严重程度表情符号映射
 */
const SEVERITY_EMOJI = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🟢',
};

/**
 * 维度标签
 */
const DIMENSION_LABELS: Record<ReviewDimension, string> = {
  [ReviewDimension.Logic]: '逻辑正确性',
  [ReviewDimension.Security]: '安全性',
  [ReviewDimension.Performance]: '性能',
  [ReviewDimension.Maintainability]: '可维护性',
  [ReviewDimension.EdgeCases]: '边界情况',
};

/**
 * ReportGenerator - 生成 JSON 和 Markdown 格式的审查报告
 */
export class ReportGenerator {
  private config: Required<GeneratorConfig>;

  constructor(config?: GeneratorConfig) {
    this.config = {
      formats: config?.formats || ['markdown'],
      theme: config?.theme || 'light',
      templates: config?.templates || {
        jsonIndent: 2,
        markdownTitle: '代码审查报告',
      },
      includeCodeSnippets: config?.includeCodeSnippets !== false,
    };
  }

  /**
   * 将报告转换为 JSON 字符串
   */
  toJSON(report: ReviewReport): string {
    const indent = this.config.templates!.jsonIndent || 2;
    return JSON.stringify(report, null, indent);
  }

  /**
   * 将报告转换为 Markdown 字符串
   */
  toMarkdown(report: ReviewReport): string {
    const lines: string[] = [];

    // 标题
    lines.push(`# ${this.config.templates!.markdownTitle || '代码审查报告'}\n`);

    // 执行摘要
    lines.push(this.generateExecutiveSummary(report));

    // 统计数据
    lines.push(this.generateStatisticsSection(report));

    // 问题列表
    lines.push(this.generateIssuesSection(report));

    // 按维度分组的问题
    lines.push(this.generateIssuesByDimensionSection(report));

    // 元数据
    lines.push(this.generateMetadataSection(report));

    return lines.join('\n');
  }

  /**
   * 执行摘要部分
   */
  private generateExecutiveSummary(report: ReviewReport): string {
    const { totalIssues } = report.summary;
    const { critical, high, medium, low } = report.summary.bySeverity;

    const lines: string[] = [];
    lines.push('## 执行摘要\n');
    lines.push(`- **发现问题总数**: ${totalIssues}`);
    lines.push(`- **${SEVERITY_EMOJI.critical} 严重**: ${critical} 项`);
    lines.push(`- **${SEVERITY_EMOJI.high} 高**: ${high} 项`);
    lines.push(`- **${SEVERITY_EMOJI.medium} 中**: ${medium} 项`);
    lines.push(`- **${SEVERITY_EMOJI.low} 低**: ${low} 项`);

    if (totalIssues === 0) {
      lines.push('\n✅ 没有发现问题，代码质量良好！\n');
    } else {
      const criticalInfo =
        critical > 0 ? `发现 ${critical} 个严重问题需要立即处理。` : '';
      const highInfo = high > 0 ? `还有 ${high} 个高优先级问题。` : '';
      lines.push(`\n⚠️ ${[criticalInfo, highInfo].filter(Boolean).join('')}\n`);
    }

    return lines.join('\n');
  }

  /**
   * 统计数据部分
   */
  private generateStatisticsSection(report: ReviewReport): string {
    const lines: string[] = [];
    lines.push('## 统计数据\n');

    // 按严重程度的表格
    lines.push('### 按严重程度分布\n');
    lines.push('| 级别 | 数量 |');
    lines.push('|------|------|');
    lines.push(`| 严重 | ${report.summary.bySeverity.critical} |`);
    lines.push(`| 高 | ${report.summary.bySeverity.high} |`);
    lines.push(`| 中 | ${report.summary.bySeverity.medium} |`);
    lines.push(`| 低 | ${report.summary.bySeverity.low} |`);
    lines.push('');

    // 按维度的表格
    lines.push('### 按审查维度分布\n');
    lines.push('| 维度 | 数量 |');
    lines.push('|------|------|');

    for (const dimension of Object.values(ReviewDimension)) {
      const count = report.summary.byDimension[dimension] || 0;
      const label = DIMENSION_LABELS[dimension];
      lines.push(`| ${label} | ${count} |`);
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 问题列表部分（按严重程度分组）
   */
  private generateIssuesSection(report: ReviewReport): string {
    if (report.issues.length === 0) {
      return '## 问题详情\n\n没有发现问题。\n';
    }

    const lines: string[] = [];
    lines.push('## 问题详情\n');

    const severities: Severity[] = ['critical', 'high', 'medium', 'low'];

    for (const severity of severities) {
      const issuesOfSeverity = report.issues.filter((i) => i.severity === severity);

      if (issuesOfSeverity.length === 0) {
        continue;
      }

      lines.push(`### ${SEVERITY_EMOJI[severity]} ${severity.toUpperCase()} - ${issuesOfSeverity.length} 项\n`);

      for (let i = 0; i < issuesOfSeverity.length; i++) {
        const issue = issuesOfSeverity[i];
        lines.push(this.formatIssueDetail(issue, i + 1, issuesOfSeverity.length));
      }
    }

    return lines.join('\n');
  }

  /**
   * 格式化单个问题详情
   */
  private formatIssueDetail(issue: ReviewIssue, index: number, total: number): string {
    const lines: string[] = [];

    lines.push(`#### 问题 ${index}. ${issue.description}\n`);
    lines.push(`- **文件**: \`${issue.file}\``);
    lines.push(`- **行号**: ${issue.line}${issue.endLine ? `-${issue.endLine}` : ''}`);
    lines.push(`- **维度**: ${DIMENSION_LABELS[issue.dimension]}`);
    lines.push(`- **置信度**: ${(issue.confidence * 100).toFixed(1)}%`);

    if (issue.foundBy) {
      lines.push(`- **发现者**: ${issue.foundBy}`);
    }

    lines.push(`- **建议**: ${issue.suggestion}`);

    if (issue.codeSnippet && this.config.includeCodeSnippets) {
      lines.push('\n**代码片段**:\n');
      lines.push('```');
      lines.push(issue.codeSnippet);
      lines.push('```');
    }

    lines.push('');

    if (index < total) {
      lines.push('---\n');
    }

    return lines.join('\n');
  }

  /**
   * 按维度分组的问题部分
   */
  private generateIssuesByDimensionSection(report: ReviewReport): string {
    if (report.issues.length === 0) {
      return '';
    }

    const lines: string[] = [];
    lines.push('## 按维度分类\n');

    for (const dimension of Object.values(ReviewDimension)) {
      const issuesOfDimension = report.issues.filter((i) => i.dimension === dimension);

      if (issuesOfDimension.length === 0) {
        continue;
      }

      const label = DIMENSION_LABELS[dimension];
      lines.push(`### ${label} (${issuesOfDimension.length} 项)\n`);

      for (const issue of issuesOfDimension) {
        const emoji = SEVERITY_EMOJI[issue.severity];
        lines.push(
          `- ${emoji} **${issue.file}:${issue.line}** - ${issue.description} (置信度: ${(issue.confidence * 100).toFixed(1)}%)`
        );
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 元数据部分
   */
  private generateMetadataSection(report: ReviewReport): string {
    const lines: string[] = [];
    lines.push('## 审查元数据\n');

    const startTime = new Date(report.metadata.startedAt);
    const endTime = new Date(report.metadata.completedAt);

    lines.push(`- **审查开始时间**: ${startTime.toLocaleString()}`);
    lines.push(`- **审查完成时间**: ${endTime.toLocaleString()}`);
    lines.push(`- **总耗时**: ${(report.metadata.durationMs / 1000).toFixed(2)}秒`);
    lines.push(`- **Token 消耗**: ${report.metadata.tokenUsage.total} (输入: ${report.metadata.tokenUsage.input}, 输出: ${report.metadata.tokenUsage.output})`);

    if (report.metadata.agents.length > 0) {
      lines.push(`- **参与的 Agent**:`);
      for (const agent of report.metadata.agents) {
        lines.push(`  - ${agent}`);
      }
    }

    lines.push('');

    return lines.join('\n');
  }

  /**
   * 将报告写入文件
   */
  async toFile(report: ReviewReport, outputDir: string, prefix: string = 'review'): Promise<void> {
    // 创建输出目录
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const formats = this.config.formats;

    // 写入 JSON 格式
    if (formats.includes('json')) {
      const jsonPath = path.join(outputDir, `${prefix}-${timestamp}.json`);
      const jsonContent = this.toJSON(report);
      fs.writeFileSync(jsonPath, jsonContent, 'utf-8');
    }

    // 写入 Markdown 格式
    if (formats.includes('markdown')) {
      const mdPath = path.join(outputDir, `${prefix}-${timestamp}.md`);
      const mdContent = this.toMarkdown(report);
      fs.writeFileSync(mdPath, mdContent, 'utf-8');
    }
  }

  /**
   * 获取配置
   */
  getConfig(): Required<GeneratorConfig> {
    return this.config;
  }
}
