/**
 * 语言推断工具模块
 * 根据文件扩展名推断编程语言，统一供所有 Collector 和 Enricher 使用
 * 此模块是三处 inferLanguage 实现的超集，包含所有已知扩展名映射
 */

/**
 * 扩展名到语言的映射表（不带点号的 key）
 * 包含 GitDiffCollector、FileCollector、ContextEnricher 三处实现的完整超集
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // TypeScript
  ts: 'typescript',
  tsx: 'typescript',
  // JavaScript
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  // Python
  py: 'python',
  pyi: 'python',
  // Java
  java: 'java',
  // Go
  go: 'go',
  // Ruby
  rb: 'ruby',
  // Rust
  rs: 'rust',
  // C/C++
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  // C#
  cs: 'csharp',
  // PHP
  php: 'php',
  // Swift
  swift: 'swift',
  // Kotlin
  kt: 'kotlin',
  // SQL
  sql: 'sql',
  // 数据/配置格式
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  // 标记语言
  html: 'html',
  md: 'markdown',
  // 样式
  css: 'css',
  scss: 'scss',
  less: 'less',
  // Shell
  sh: 'bash',
  bash: 'bash',
  // 其他配置
  txt: 'text',
  ini: 'ini',
  conf: 'text',
  config: 'text',
};

/**
 * 根据文件路径或扩展名推断编程语言
 * 支持两种输入格式：
 *   - 完整文件路径: "src/app.ts" -> "typescript"
 *   - 扩展名（带点号或不带点号）: ".ts" 或 "ts" -> "typescript"
 *
 * @param filePathOrExt 文件路径或扩展名
 * @returns 推断出的语言名称，未知扩展名返回扩展名本身，无扩展名返回 'text'
 */
export function inferLanguage(filePathOrExt: string): string {
  if (!filePathOrExt) {
    return 'text';
  }

  // 提取扩展名：先尝试获取最后一个点号后的部分
  let ext: string;

  // 如果输入包含路径分隔符或点号在中间，按文件路径处理
  const lastDotIndex = filePathOrExt.lastIndexOf('.');
  if (lastDotIndex > 0) {
    // 有点号且不在开头，取点号后的部分
    ext = filePathOrExt.substring(lastDotIndex + 1).toLowerCase();
  } else if (lastDotIndex === 0) {
    // 点号在开头（如 ".ts"），取点号后的部分
    ext = filePathOrExt.substring(1).toLowerCase();
  } else {
    // 没有点号，整个输入作为扩展名（如 "ts"）
    ext = filePathOrExt.toLowerCase();
  }

  return EXTENSION_TO_LANGUAGE[ext] || ext || 'text';
}
