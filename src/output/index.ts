/**
 * 输出模块 - 生成代码审查报告
 *
 * 核心组件：
 * - JsonReporter: 生成类 SARIF 格式的 JSON 报告，供 CodeAgent 程序化消费
 * - MarkdownReporter: 生成可读性好的 Markdown 报告，供人类阅读
 * - SummaryGenerator: 从 ReviewIssue[] 生成 ReviewSummary 统计信息
 * - ReportGenerator: 兼容旧接口的报告生成器（包装上述组件）
 * - DashboardReporter: 将 ReviewReport 转换为仪表板友好的数据格式
 *
 * 使用方式：
 * ```typescript
 * import { JsonReporter, MarkdownReporter, SummaryGenerator, DashboardReporter } from './output';
 *
 * // 生成 JSON 报告
 * const json = JsonReporter.generate(report);
 *
 * // 生成 Markdown 报告
 * const md = MarkdownReporter.generate(report);
 *
 * // 生成统计摘要
 * const summary = SummaryGenerator.generate(issues);
 *
 * // 生成仪表板数据
 * const dashboard = DashboardReporter.generate(report);
 * ```
 */

export { JsonReporter, JsonReportOutput, JsonReportIssue } from './json-reporter';
export { MarkdownReporter } from './markdown-reporter';
export { SummaryGenerator, generateSummary } from './summary-generator';
export { ReportGenerator, GeneratorConfig } from './report-generator';
export {
  DashboardReporter,
  generateDashboard,
  DashboardData,
  DashboardMetrics,
  DashboardQualityMetrics,
  DashboardPerformanceMetrics,
  DashboardMetadata,
} from './dashboard-reporter';
