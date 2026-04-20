import * as fs from 'fs';
import * as path from 'path';
import { ReviewReport, ReviewIssue, ReviewDimension, Severity } from '../types';
import { DashboardReporter } from './dashboard-reporter';

/**
 * 报告生成器配置
 */
export interface GeneratorConfig {
  /** 输出格式（'json', 'markdown', 'html'） */
  formats?: Array<'json' | 'markdown' | 'html'>;
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
  [ReviewDimension.AdversaryFound]: '对抗审查发现',
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

    // 不完整警告（仅在有 agent 失败时渲染）
    // 放在最顶部、标题之下，保证调用方第一眼就能看到结论不可信
    const warningSection = this.generateIncompleteWarningSection(report);
    if (warningSection) {
      lines.push(warningSection);
    }

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
   * 渲染"审查未完整"警告（仅当 metadata.incompleteAgents 非空）
   * 将失败的 agentId、error 消息、耗时列出，防止调用方把
   * "0 问题" 误读为 "代码无问题"
   */
  private generateIncompleteWarningSection(report: ReviewReport): string | null {
    const failures = report.metadata.incompleteAgents;
    if (!failures || failures.length === 0) {
      return null;
    }

    const totalAgents = report.metadata.agents.length;
    const failedCount = failures.length;
    const lines: string[] = [];
    lines.push('> ⚠️ **审查未完整执行**');
    lines.push('>');
    lines.push(
      `> ${failedCount} 个 Agent 失败或超时（参与总数 ${totalAgents}），本报告结论**不完整**，不应被解读为代码无问题。`
    );
    lines.push('>');
    lines.push('> 失败详情：');
    for (const f of failures) {
      const seconds = (f.durationMs / 1000).toFixed(2);
      lines.push(`> - \`${f.agentId}\`: ${f.error}（耗时 ${seconds}s）`);
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 执行摘要部分
   */
  private generateExecutiveSummary(report: ReviewReport): string {
    const { totalIssues } = report.summary;
    const { critical, high, medium, low } = report.summary.bySeverity;
    const hasFailures = (report.metadata.incompleteAgents?.length ?? 0) > 0;

    const lines: string[] = [];
    lines.push('## 执行摘要\n');
    lines.push(`- **发现问题总数**: ${totalIssues}`);
    lines.push(`- **${SEVERITY_EMOJI.critical} 严重**: ${critical} 项`);
    lines.push(`- **${SEVERITY_EMOJI.high} 高**: ${high} 项`);
    lines.push(`- **${SEVERITY_EMOJI.medium} 中**: ${medium} 项`);
    lines.push(`- **${SEVERITY_EMOJI.low} 低**: ${low} 项`);

    if (totalIssues === 0 && !hasFailures) {
      lines.push('\n✅ 没有发现问题，代码质量良好！\n');
    } else if (totalIssues === 0 && hasFailures) {
      // 不能说"代码质量良好"——审查根本没跑完
      lines.push('\n⛔ 审查未完整，0 问题不代表代码无缺陷，请先处理上方警告中的 Agent 失败原因后重跑。\n');
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

    // 元数据区列出每个失败 agent 的详情（与顶部警告互补：顶部给结论，这里给调试信息）
    const failures = report.metadata.incompleteAgents;
    if (failures && failures.length > 0) {
      lines.push('');
      lines.push('### Agent 失败详情');
      lines.push('');
      for (const f of failures) {
        const seconds = (f.durationMs / 1000).toFixed(2);
        lines.push(`- \`${f.agentId}\` - 耗时 ${seconds}s`);
        lines.push(`  - 错误: ${f.error}`);
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

    // 写入 HTML 格式（自包含仪表板）
    if (formats.includes('html')) {
      const htmlPath = path.join(outputDir, `${prefix}-${timestamp}.html`);
      const dashboardReporter = new DashboardReporter();
      const htmlContent = dashboardReporter.render(report);
      fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
    }
  }

  /**
   * 获取配置
   */
  getConfig(): Required<GeneratorConfig> {
    return this.config;
  }
}
