import * as fs from 'fs';
import * as path from 'path';
import {
  ReviewReport,
  ReviewIssue,
  ReviewDimension,
  ReviewSummary,
  Severity,
} from '../types';
import { MetaReviewResult } from '../types/agent';

/**
 * 仪表板数据 - 为可视化层准备的数据格式
 */
export interface DashboardData {
  /** 关键指标 */
  metrics: DashboardMetrics;

  /** 按严重程度分类的问题 */
  issuesBySeverity: Record<Severity, ReviewIssue[]>;

  /** 按维度分类的问题 */
  issuesByDimension: Record<ReviewDimension, ReviewIssue[]>;

  /** 按文件分类的问题 */
  issuesByFile: Record<string, ReviewIssue[]>;

  /** 质量评估（如果启用了元审查） */
  quality?: DashboardQualityMetrics;

  /** 性能和成本数据 */
  performance: DashboardPerformanceMetrics;

  /** 时间戳和审查信息 */
  metadata: DashboardMetadata;
}

/**
 * 仪表板关键指标
 */
export interface DashboardMetrics {
  totalIssues: number;
  critical: number;
  high: number;
  medium: number;
  low: number;

  /** 各维度问题数 */
  byDimension: Record<ReviewDimension, number>;

  /** 平均置信度 */
  averageConfidence: number;

  /** 误报率（如果有对抗审查结果） */
  falsePositiveRate?: number;

  /** 被驳回的问题数（如果启用了元审查） */
  dismissedCount?: number;
}

/**
 * 仪表板质量指标
 */
export interface DashboardQualityMetrics {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  score: number;
  coveragePercentage: number;
  completenessPercentage: number;
  criticalFindingsCount: number;
  rootCauses: string[];
  priorityRecommendation?: string;
}

/**
 * 仪表板性能指标
 */
export interface DashboardPerformanceMetrics {
  durationMs: number;
  durationSeconds: string;

  /** Token 消耗统计 */
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };

  /** 各阶段耗时（毫秒，如果有的话）*/
  stages?: {
    input?: number;
    dimensionReview?: number;
    adversaryReview?: number;
    calibration?: number;
    metaReview?: number;
    reportGeneration?: number;
  };

  /** 各 Agent 的 token 消耗（如果有的话）*/
  agentTokenUsage?: Record<
    string,
    {
      input: number;
      output: number;
      total: number;
      percentage: number;
    }
  >;
}

/**
 * 仪表板元数据
 */
export interface DashboardMetadata {
  agents: string[];
  totalAgents: number;
  startedAt: Date;
  completedAt: Date;
}

/**
 * 严重程度的样式配置
 */
export interface SeverityStyle {
  icon: string;
  color: string;
  label: string;
}

/**
 * 质量等级的样式配置
 */
export interface QualityGradeStyle {
  color: string;
  description: string;
}

/**
 * 维度显示名称映射
 */
const DIMENSION_LABELS: Record<string, string> = {
  [ReviewDimension.Logic]: '逻辑正确性',
  [ReviewDimension.Security]: '安全性',
  [ReviewDimension.Performance]: '性能',
  [ReviewDimension.Maintainability]: '可维护性',
  [ReviewDimension.EdgeCases]: '边界情况',
  [ReviewDimension.AdversaryFound]: '对抗审查发现',
};

/**
 * 严重程度排序权重
 */
const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * 裁决显示名称映射
 */
const VERDICT_LABELS: Record<string, string> = {
  approve: '通过',
  request_changes: '需要修改',
  needs_discussion: '需要讨论',
};

/**
 * DashboardReporter - 将 ReviewReport 转换为仪表板数据格式，并支持生成自包含 HTML 报告
 *
 * 静态方法：数据转换（向后兼容）
 * 实例方法：HTML 渲染
 */
export class DashboardReporter {

  // ==================== HTML 渲染（实例方法） ====================

  /**
   * 渲染 HTML 仪表板报告
   * @param report - 审查报告数据
   * @returns 完整的自包含 HTML 字符串（CSS/JS 内联，无外部依赖）
   */
  render(report: ReviewReport): string {
    // 读取模板
    const templatePath = path.join(__dirname, 'templates', 'dashboard.html');
    let template = fs.readFileSync(templatePath, 'utf-8');

    const meta = report.metaReview;
    const issues = report.issues || [];
    const summary = report.summary;

    // 替换各占位符
    template = template.replace('{{title}}', 'Inquisitor 代码审查仪表板');
    template = template.replace('{{subtitle}}', `共发现 ${summary.totalIssues} 个问题`);
    template = template.replace('{{headerMeta}}', this.renderHeaderMeta(report));
    template = template.replace('{{gradeCard}}', this.renderGradeCard(meta));
    template = template.replace('{{metricsCards}}', this.renderMetricsCards(report, meta));
    template = template.replace('{{severityChart}}', this.renderSeverityChart(summary.bySeverity));
    template = template.replace('{{dimensionChart}}', this.renderDimensionChart(summary.byDimension));
    template = template.replace('{{rootCauseHeatmap}}', this.renderRootCauseHeatmap(meta));
    template = template.replace('{{verdictCard}}', this.renderVerdictCard(meta));
    template = template.replace('{{severityFilters}}', this.renderSeverityFilters());
    template = template.replace('{{dimensionFilters}}', this.renderDimensionFilters());
    template = template.replace('{{issueRows}}', this.renderIssueRows(issues));
    template = template.replace('{{footer}}', this.renderFooter(report));
    template = template.replace('{{reportData}}', JSON.stringify(this.sanitizeReportData(report)));

    return template;
  }

  /**
   * 渲染头部元信息
   */
  private renderHeaderMeta(report: ReviewReport): string {
    const startTime = new Date(report.metadata.startedAt).toLocaleString('zh-CN');
    const duration = (report.metadata.durationMs / 1000).toFixed(1);
    const tokens = report.metadata.tokenUsage.total;
    const agents = report.metadata.agents.length;

    return [
      `<div class="meta-item">开始时间: <span>${this.escapeHtml(startTime)}</span></div>`,
      `<div class="meta-item">耗时: <span>${duration}s</span></div>`,
      `<div class="meta-item">Token: <span>${tokens.toLocaleString()}</span></div>`,
      `<div class="meta-item">Agent: <span>${agents} 个</span></div>`,
    ].join('\n');
  }

  /**
   * 渲染质量评级卡片（包含 grade 和 qualityScore）
   */
  private renderGradeCard(meta?: MetaReviewResult): string {
    if (!meta) {
      return `<div class="grade-card">
        <div class="grade-letter grade-C">-</div>
        <div class="grade-label">qualityScore: N/A</div>
      </div>`;
    }

    const grade = meta.qualityGrade || 'C';
    const metaAny = meta as unknown as Record<string, unknown>;
    const score = metaAny.qualityScore ?? 'N/A';

    return `<div class="grade-card">
      <div class="grade-letter grade-${this.escapeHtml(grade)}">${this.escapeHtml(grade)}</div>
      <div class="grade-label">qualityScore: ${score}</div>
    </div>`;
  }

  /**
   * 渲染指标卡片（包含 coverage 和 completeness）
   */
  private renderMetricsCards(report: ReviewReport, meta?: MetaReviewResult): string {
    const totalIssues = report.summary.totalIssues;
    const criticalCount = report.summary.bySeverity.critical;
    const cards: string[] = [];

    // 总问题数
    cards.push(this.renderMetricCard(
      '问题总数', String(totalIssues),
      totalIssues > 10 ? 'fill-red' : totalIssues > 5 ? 'fill-yellow' : 'fill-green',
      Math.min(totalIssues * 5, 100)
    ));

    // 严重问题数
    cards.push(this.renderMetricCard(
      '严重问题', String(criticalCount),
      criticalCount > 0 ? 'fill-red' : 'fill-green',
      criticalCount > 0 ? Math.min(criticalCount * 25, 100) : 0
    ));

    if (meta) {
      const metaAny = meta as unknown as Record<string, unknown>;
      // coverage 指标
      const coverage = metaAny.coveragePercentage ?? metaAny.coverage ?? 0;
      cards.push(this.renderMetricCard(
        'coverage', `${coverage}%`,
        Number(coverage) >= 80 ? 'fill-green' : Number(coverage) >= 60 ? 'fill-yellow' : 'fill-red',
        Number(coverage)
      ));

      // completeness 指标
      const completeness = metaAny.completenessPercentage ?? metaAny.completeness ?? 0;
      cards.push(this.renderMetricCard(
        'completeness', `${completeness}%`,
        Number(completeness) >= 80 ? 'fill-green' : Number(completeness) >= 60 ? 'fill-yellow' : 'fill-red',
        Number(completeness)
      ));
    } else {
      cards.push(this.renderMetricCard('coverage', 'N/A', 'fill-blue', 0));
      cards.push(this.renderMetricCard('completeness', 'N/A', 'fill-blue', 0));
    }

    return cards.join('\n');
  }

  /**
   * 渲染单个指标卡片
   */
  private renderMetricCard(label: string, value: string, fillClass: string, percentage: number): string {
    return `<div class="metric-card">
      <div class="metric-value">${this.escapeHtml(value)}</div>
      <div class="metric-label">${this.escapeHtml(label)}</div>
      <div class="metric-bar"><div class="metric-bar-fill ${fillClass}" style="width:${percentage}%"></div></div>
    </div>`;
  }

  /**
   * 渲染 severity 分布柱状图
   */
  private renderSeverityChart(bySeverity: { critical: number; high: number; medium: number; low: number }): string {
    const max = Math.max(bySeverity.critical, bySeverity.high, bySeverity.medium, bySeverity.low, 1);
    const severities: Array<{ key: Severity; label: string; cssClass: string }> = [
      { key: 'critical', label: 'Critical', cssClass: 'sev-critical' },
      { key: 'high', label: 'High', cssClass: 'sev-high' },
      { key: 'medium', label: 'Medium', cssClass: 'sev-medium' },
      { key: 'low', label: 'Low', cssClass: 'sev-low' },
    ];

    return severities.map(s => {
      const count = bySeverity[s.key];
      const pct = (count / max) * 100;
      return `<div class="bar-row">
        <div class="bar-label">${s.label}</div>
        <div class="bar-track">
          <div class="bar-fill ${s.cssClass}" style="width:${pct}%"></div>
          <span class="bar-count">${count}</span>
        </div>
      </div>`;
    }).join('\n');
  }

  /**
   * 渲染 dimension 分布柱状图
   */
  private renderDimensionChart(byDimension: Record<string, number>): string {
    const dims = Object.values(ReviewDimension);
    const max = Math.max(...dims.map(d => byDimension[d] || 0), 1);

    return dims.map(d => {
      const count = byDimension[d] || 0;
      const pct = (count / max) * 100;
      const label = DIMENSION_LABELS[d] || d;
      const cssClass = `dim-${d}`;
      return `<div class="bar-row">
        <div class="bar-label">${this.escapeHtml(label)}</div>
        <div class="bar-track">
          <div class="bar-fill ${cssClass}" style="width:${pct}%"></div>
          <span class="bar-count">${count}</span>
        </div>
      </div>`;
    }).join('\n');
  }

  /**
   * 渲染 root-cause 热力图
   */
  private renderRootCauseHeatmap(meta?: MetaReviewResult): string {
    if (!meta || !meta.rootCauses || meta.rootCauses.length === 0) {
      return '<div class="no-issues">暂无 root-cause 分析数据</div>';
    }

    const rootCauses = meta.rootCauses;
    const total = rootCauses.length;

    return rootCauses.map((cause, idx) => {
      // 靠前的根因影响更大，颜色更深
      const heatLevel = idx === 0 ? 'high' : idx < total / 2 ? 'medium' : 'low';
      const heatNumber = total - idx;
      const description = typeof cause === 'string' ? cause : String(cause);

      return `<div class="root-cause-item heat-${heatLevel}">
        <div class="root-cause-heat">${heatNumber}</div>
        <div class="root-cause-content">
          <div class="root-cause-desc">${this.escapeHtml(description)}</div>
          <div class="root-cause-affected">影响程度: ${heatLevel === 'high' ? '严重' : heatLevel === 'medium' ? '中等' : '轻微'}</div>
        </div>
      </div>`;
    }).join('\n');
  }

  /**
   * 渲染裁决卡片
   */
  private renderVerdictCard(meta?: MetaReviewResult): string {
    if (!meta) {
      return `<div class="verdict-card">
        <h2>最终裁决</h2>
        <div class="verdict-badge">未执行元审查</div>
      </div>`;
    }

    const verdict = meta.verdict || 'needs_discussion';
    const verdictLabel = VERDICT_LABELS[String(verdict)] || String(verdict);

    return `<div class="verdict-card">
      <h2>最终裁决</h2>
      <div class="verdict-badge verdict-${this.escapeHtml(String(verdict))}">${this.escapeHtml(verdictLabel)}</div>
      <div class="verdict-summary">${this.escapeHtml(String(verdict))}: 质量评级 ${meta.qualityGrade || '-'}</div>
    </div>`;
  }

  /**
   * 渲染 severity 过滤按钮
   */
  private renderSeverityFilters(): string {
    const severities = ['critical', 'high', 'medium', 'low'];
    return severities.map(s =>
      `<button class="filter-btn" data-severity="${s}" onclick="toggleFilter('severity','${s}',this)">${s}</button>`
    ).join('\n');
  }

  /**
   * 渲染 dimension 过滤按钮
   */
  private renderDimensionFilters(): string {
    return Object.values(ReviewDimension).map(d => {
      const label = DIMENSION_LABELS[d] || d;
      return `<button class="filter-btn" data-dimension="${d}" onclick="toggleFilter('dimension','${d}',this)">${this.escapeHtml(label)}</button>`;
    }).join('\n');
  }

  /**
   * 渲染问题行列表
   */
  private renderIssueRows(issues: ReviewIssue[]): string {
    if (issues.length === 0) {
      return '<div class="no-issues">没有发现问题</div>';
    }

    // 按 severity 排序
    const sorted = [...issues].sort((a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
    );

    return sorted.map((issue, idx) => {
      const dimLabel = DIMENSION_LABELS[issue.dimension] || issue.dimension;
      const confPct = (issue.confidence * 100).toFixed(0);
      const fileInfo = `${issue.file}:${issue.line}${issue.endLine ? '-' + issue.endLine : ''}`;
      const snippet = issue.codeSnippet ? `<pre>${this.escapeHtml(issue.codeSnippet)}</pre>` : '';

      return `<div class="issue-row" data-severity="${issue.severity}" data-dimension="${issue.dimension}" data-confidence="${issue.confidence}" data-file="${this.escapeHtml(issue.file)}" onclick="toggleIssueDetail(${idx})">
        <div class="issue-sev issue-sev-${issue.severity}">${issue.severity}</div>
        <div class="issue-dim">${this.escapeHtml(dimLabel)}</div>
        <div class="issue-body">
          <div class="issue-desc">${this.escapeHtml(issue.description)}</div>
          <div class="issue-file">${this.escapeHtml(fileInfo)}</div>
        </div>
        <div class="issue-conf">${confPct}%</div>
      </div>
      <div class="issue-detail" id="detail-${idx}">
        <p><strong>建议:</strong> ${this.escapeHtml(issue.suggestion)}</p>
        ${issue.foundBy ? `<p><strong>发现者:</strong> ${this.escapeHtml(issue.foundBy)}</p>` : ''}
        ${issue.adversaryVerdict ? `<p><strong>对抗裁决:</strong> ${this.escapeHtml(issue.adversaryVerdict)}</p>` : ''}
        ${snippet}
      </div>`;
    }).join('\n');
  }

  /**
   * 渲染页脚
   */
  private renderFooter(report: ReviewReport): string {
    const endTime = new Date(report.metadata.completedAt).toLocaleString('zh-CN');
    return `由 Inquisitor 生成 | ${this.escapeHtml(endTime)}`;
  }

  /**
   * 为 JS 注入清理报告数据（避免注入完整敏感数据）
   */
  private sanitizeReportData(report: ReviewReport): Record<string, unknown> {
    const metaAny = report.metaReview as unknown as Record<string, unknown> | undefined;
    return {
      totalIssues: report.summary.totalIssues,
      bySeverity: report.summary.bySeverity,
      byDimension: report.summary.byDimension,
      hasMetaReview: !!report.metaReview,
      grade: report.metaReview?.qualityGrade || null,
      qualityScore: metaAny?.qualityScore ?? null,
    };
  }

  /**
   * HTML 字符转义
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ==================== 数据转换（静态方法，向后兼容） ====================

  /**
   * 生成仪表板数据
   */
  static generate(report: ReviewReport): DashboardData {
    const { issues, summary, metadata } = report;

    return {
      metrics: this.extractMetrics(issues, summary, metadata),
      issuesBySeverity: this.groupBySeverity(issues),
      issuesByDimension: this.groupByDimension(issues),
      issuesByFile: this.groupByFile(issues),
      quality: this.extractQuality(report),
      performance: this.extractPerformance(report),
      metadata: this.extractMetadata(metadata),
    };
  }

  /**
   * 获取严重程度样式配置
   */
  static getSeverityStyle(severity: Severity): SeverityStyle {
    const styles: Record<Severity, SeverityStyle> = {
      critical: {
        icon: '\u{1F534}',
        color: '#e74c3c',
        label: '严重',
      },
      high: {
        icon: '\u{1F7E0}',
        color: '#f39c12',
        label: '高',
      },
      medium: {
        icon: '\u{1F7E1}',
        color: '#f1c40f',
        label: '中',
      },
      low: {
        icon: '\u{1F7E2}',
        color: '#2ecc71',
        label: '低',
      },
    };

    return styles[severity];
  }

  /**
   * 获取维度标签
   */
  static getDimensionLabel(dimension: ReviewDimension): string {
    const labels: Record<ReviewDimension, string> = {
      [ReviewDimension.Logic]: '逻辑正确性',
      [ReviewDimension.Security]: '安全性',
      [ReviewDimension.Performance]: '性能',
      [ReviewDimension.Maintainability]: '可维护性',
      [ReviewDimension.EdgeCases]: '边界情况',
      [ReviewDimension.AdversaryFound]: '对抗发现',
    };

    return labels[dimension];
  }

  /**
   * 获取质量等级样式
   */
  static getQualityGradeStyle(
    grade: 'A' | 'B' | 'C' | 'D' | 'F'
  ): QualityGradeStyle {
    const styles: Record<'A' | 'B' | 'C' | 'D' | 'F', QualityGradeStyle> = {
      A: { color: '#27ae60', description: '优秀' },
      B: { color: '#3498db', description: '良好' },
      C: { color: '#f39c12', description: '中等' },
      D: { color: '#e67e22', description: '较差' },
      F: { color: '#e74c3c', description: '不及格' },
    };

    return styles[grade];
  }

  /**
   * 提取关键指标
   */
  private static extractMetrics(
    issues: ReviewIssue[],
    summary: ReviewSummary,
    metadata: any
  ): DashboardMetrics {
    // 计算平均置信度
    const averageConfidence =
      issues.length > 0
        ? issues.reduce((sum, issue) => sum + issue.confidence, 0) /
          issues.length
        : 0;

    // 计算误报率
    const falsePositives = issues.filter(
      (i) => i.adversaryVerdict === 'false_positive'
    ).length;
    const falsePositiveRate =
      issues.length > 0 ? (falsePositives / issues.length) * 100 : 0;

    // 被驳回的问题数（来自元审查）
    const dismissedCount = metadata.metaReview
      ? metadata.metaReview.dismissedIssueIndices?.length ?? 0
      : undefined;

    return {
      totalIssues: summary.totalIssues,
      critical: summary.bySeverity.critical,
      high: summary.bySeverity.high,
      medium: summary.bySeverity.medium,
      low: summary.bySeverity.low,
      byDimension: summary.byDimension,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      falsePositiveRate: Math.round(falsePositiveRate * 100) / 100,
      dismissedCount: dismissedCount || undefined,
    };
  }

  /**
   * 按严重程度分组
   */
  private static groupBySeverity(
    issues: ReviewIssue[]
  ): Record<Severity, ReviewIssue[]> {
    const grouped: Record<Severity, ReviewIssue[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };

    for (const issue of issues) {
      grouped[issue.severity].push(issue);
    }

    return grouped;
  }

  /**
   * 按维度分组
   */
  private static groupByDimension(
    issues: ReviewIssue[]
  ): Record<ReviewDimension, ReviewIssue[]> {
    const grouped: Record<ReviewDimension, ReviewIssue[]> = {
      [ReviewDimension.Logic]: [],
      [ReviewDimension.Security]: [],
      [ReviewDimension.Performance]: [],
      [ReviewDimension.Maintainability]: [],
      [ReviewDimension.EdgeCases]: [],
      [ReviewDimension.AdversaryFound]: [],
    };

    for (const issue of issues) {
      grouped[issue.dimension].push(issue);
    }

    return grouped;
  }

  /**
   * 按文件分组
   */
  private static groupByFile(issues: ReviewIssue[]): Record<string, ReviewIssue[]> {
    const grouped: Record<string, ReviewIssue[]> = {};

    for (const issue of issues) {
      if (!grouped[issue.file]) {
        grouped[issue.file] = [];
      }
      grouped[issue.file].push(issue);
    }

    return grouped;
  }

  /**
   * 提取质量评估数据
   */
  private static extractQuality(
    report: ReviewReport
  ): DashboardQualityMetrics | undefined {
    const metaReview = (report.metadata as any).metaReview;

    if (!metaReview) {
      return undefined;
    }

    return {
      grade: metaReview.qualityGrade,
      score: metaReview.qualityScore,
      coveragePercentage: metaReview.coveragePercentage,
      completenessPercentage: metaReview.completenessPercentage,
      criticalFindingsCount: metaReview.criticalFindingsCount,
      rootCauses: metaReview.rootCauses,
      priorityRecommendation: metaReview.priorityRecommendation,
    };
  }

  /**
   * 提取性能数据
   */
  private static extractPerformance(
    report: ReviewReport
  ): DashboardPerformanceMetrics {
    const { metadata } = report;
    const extendedMetadata = metadata as any;

    // 计算各 Agent 的百分比
    const agentTokenUsage: Record<
      string,
      { input: number; output: number; total: number; percentage: number }
    > = {};

    if (extendedMetadata.agentTokenUsage) {
      const totalTokens = metadata.tokenUsage.total;
      for (const [agentId, tokens] of Object.entries(
        extendedMetadata.agentTokenUsage
      )) {
        const tokenData = tokens as any;
        agentTokenUsage[agentId] = {
          input: tokenData.input,
          output: tokenData.output,
          total: tokenData.total,
          percentage: Math.round((tokenData.total / totalTokens) * 10000) / 100,
        };
      }
    }

    return {
      durationMs: metadata.durationMs,
      durationSeconds: (metadata.durationMs / 1000).toFixed(2) + 's',
      tokenUsage: metadata.tokenUsage,
      stages: extendedMetadata.stages,
      agentTokenUsage: Object.keys(agentTokenUsage).length > 0 ? agentTokenUsage : undefined,
    };
  }

  /**
   * 提取元数据
   */
  private static extractMetadata(metadata: any): DashboardMetadata {
    return {
      agents: metadata.agents,
      totalAgents: metadata.agents.length,
      startedAt: new Date(metadata.startedAt),
      completedAt: new Date(metadata.completedAt),
    };
  }
}

/**
 * 便捷函数：生成仪表板数据（向后兼容）
 */
export function generateDashboard(report: ReviewReport): string {
  const reporter = new DashboardReporter();
  return reporter.render(report);
}
