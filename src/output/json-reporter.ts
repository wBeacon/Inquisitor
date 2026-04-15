import { ReviewReport, ReviewIssue, ReviewSummary } from '../types';
import { SummaryGenerator } from './summary-generator';

/**
 * JSON 报告输出结构 - 类 SARIF 格式
 */
export interface JsonReportOutput {
  /** 报告格式版本 */
  $schema: string;
  /** 报告版本 */
  version: string;
  /** 工具信息 */
  tool: {
    name: string;
    version: string;
  };
  /** 发现的所有问题 */
  issues: JsonReportIssue[];
  /** 统计摘要 */
  summary: ReviewSummary;
  /** 审查元数据 */
  metadata: ReviewReport['metadata'];
}

/**
 * JSON 报告中的单个问题
 */
export interface JsonReportIssue {
  file: string;
  line: number;
  endLine?: number;
  severity: string;
  dimension: string;
  description: string;
  suggestion: string;
  confidence: number;
  foundBy?: string;
  codeSnippet?: string;
  adversaryVerdict?: 'confirmed' | 'disputed' | 'false_positive';
}

/**
 * JsonReporter - 生成类 SARIF 格式的 JSON 审查报告
 *
 * 独立模块，可独立于 MarkdownReporter 使用。
 * 输出可被 JSON.parse 解析，包含所有 ReviewIssue 字段和 summary 统计信息。
 */
export class JsonReporter {
  /**
   * 从 ReviewReport 生成 JSON 字符串
   * @param report - 审查报告
   * @param indent - JSON 缩进空格数，默认 2
   * @returns JSON 字符串
   */
  static generate(report: ReviewReport, indent: number = 2): string {
    const output: JsonReportOutput = {
      $schema: 'https://inquisitor.dev/schema/report-v1.json',
      version: '1.0.0',
      tool: {
        name: 'Inquisitor',
        version: '1.0.0',
      },
      issues: report.issues.map(JsonReporter.mapIssue),
      summary: report.summary,
      metadata: report.metadata,
    };

    return JSON.stringify(output, null, indent);
  }

  /**
   * 从 ReviewIssue[] 和可选元数据生成 JSON 字符串
   * 当没有完整的 ReviewReport 时可使用此方法
   */
  static generateFromIssues(
    issues: ReviewIssue[],
    metadata?: ReviewReport['metadata'],
    indent: number = 2
  ): string {
    const summary = SummaryGenerator.generate(issues);
    const defaultMetadata: ReviewReport['metadata'] = metadata ?? {
      durationMs: 0,
      tokenUsage: { input: 0, output: 0, total: 0 },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      agents: [],
    };

    const report: ReviewReport = {
      issues,
      summary,
      metadata: defaultMetadata,
    };

    return JsonReporter.generate(report, indent);
  }

  /**
   * 将 ReviewIssue 映射为 JSON 输出格式
   */
  private static mapIssue(issue: ReviewIssue): JsonReportIssue {
    const mapped: JsonReportIssue = {
      file: issue.file,
      line: issue.line,
      severity: issue.severity,
      dimension: issue.dimension,
      description: issue.description,
      suggestion: issue.suggestion,
      confidence: issue.confidence,
    };

    // 可选字段仅在存在时包含
    if (issue.endLine !== undefined) {
      mapped.endLine = issue.endLine;
    }
    if (issue.foundBy !== undefined) {
      mapped.foundBy = issue.foundBy;
    }
    if (issue.codeSnippet !== undefined) {
      mapped.codeSnippet = issue.codeSnippet;
    }
    if (issue.adversaryVerdict !== undefined) {
      mapped.adversaryVerdict = issue.adversaryVerdict;
    }

    return mapped;
  }
}
