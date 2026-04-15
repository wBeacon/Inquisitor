/**
 * 输入采集层 - 负责将各种源（git diff、文件系统等）转化为结构化的 ReviewRequest
 * 
 * 模块职责：
 * 1. GitDiffCollector: 解析 git diff，提取变更文件和周围上下文
 * 2. FileCollector: 读取文件系统中的代码文件（支持单文件、目录、glob 模式）
 * 3. ContextEnricher: 自动发现依赖文件作为审查上下文
 * 
 * 典型用法：
 * ```typescript
 * const gitCollector = new GitDiffCollector();
 * const files = await gitCollector.collect('HEAD');
 * 
 * const enricher = new ContextEnricher({ projectRoot: '.' });
 * const enrichedFiles = await enricher.enrich(files);
 * 
 * const reviewRequest: ReviewRequest = {
 *   files: enrichedFiles,
 *   context: { contextLines: 50, includeFullFile: false, includeDependencies: true, projectRoot: '.' },
 *   mode: 'review'
 * };
 * ```
 */

export { GitDiffCollector } from './git-diff-collector';
export { FileCollector } from './file-collector';
export { ContextEnricher } from './context-enricher';
