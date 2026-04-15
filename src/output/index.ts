/**
 * 输出模块 - 生成代码审查报告
 * 
 * 核心类：
 * - ReportGenerator: 生成 JSON 和 Markdown 格式的报告
 * 
 * 使用方式：
 * ```typescript
 * const generator = new ReportGenerator({ formats: ['json', 'markdown'] });
 * const json = generator.toJSON(report);
 * const markdown = generator.toMarkdown(report);
 * await generator.toFile(report, './output');
 * ```
 */

export { ReportGenerator, GeneratorConfig } from './report-generator';
