/**
 * review-command.ts - /review 命令参数解析器
 *
 * 解析用户输入的 /review 命令参数，将其转换为结构化的 ReviewCommandArgs 对象。
 * 支持以下模式：
 * - /review           -> mode: 'diff'（默认）
 * - /review path      -> mode: 'file'
 * - /review --full dir -> mode: 'directory'
 * - /review --fast    -> enableAdversary: false
 */

/**
 * 解析后的审查命令参数
 */
export interface ReviewCommandArgs {
  /** 审查模式 */
  mode: 'diff' | 'file' | 'directory';
  /** 文件或目录路径 */
  path?: string;
  /** 是否启用对抗审查（默认 true） */
  enableAdversary: boolean;
  /** 输出格式（逗号分隔） */
  formats?: string;
  /** 审查维度（逗号分隔） */
  dimensions?: string;
}

/**
 * 解析 /review 命令的参数字符串
 *
 * @param argsString - 命令后面的参数字符串（不含 /review 本身）
 * @returns 解析后的 ReviewCommandArgs
 *
 * @example
 * parseReviewArgs('')                           // { mode: 'diff', enableAdversary: true }
 * parseReviewArgs('src/foo.ts')                 // { mode: 'file', path: 'src/foo.ts', enableAdversary: true }
 * parseReviewArgs('--full src/')                // { mode: 'directory', path: 'src/', enableAdversary: true }
 * parseReviewArgs('--fast')                     // { mode: 'diff', enableAdversary: false }
 * parseReviewArgs('--fast --formats json,markdown src/foo.ts')
 *   // { mode: 'file', path: 'src/foo.ts', enableAdversary: false, formats: 'json,markdown' }
 */
export function parseReviewArgs(argsString: string): ReviewCommandArgs {
  const result: ReviewCommandArgs = {
    mode: 'diff',
    enableAdversary: true,
  };

  // 将参数字符串拆分为 token 列表
  const trimmed = argsString.trim();
  if (!trimmed) {
    return result;
  }

  const tokens = trimmed.split(/\s+/);

  // 标记是否遇到了 --full 标志
  let isFullMode = false;
  // 收集裸路径参数（非 -- 开头的参数）
  const barePaths: string[] = [];

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token === '--fast') {
      // 快速模式：跳过对抗审查
      result.enableAdversary = false;
      i++;
    } else if (token === '--full') {
      // 全目录扫描模式
      isFullMode = true;
      i++;
    } else if (token === '--formats') {
      // 输出格式参数
      i++;
      if (i < tokens.length) {
        result.formats = tokens[i];
        i++;
      }
    } else if (token === '--dimensions') {
      // 审查维度参数
      i++;
      if (i < tokens.length) {
        result.dimensions = tokens[i];
        i++;
      }
    } else if (token.startsWith('--')) {
      // 未知的标志参数，跳过
      i++;
    } else {
      // 裸参数，视为路径
      barePaths.push(token);
      i++;
    }
  }

  // 确定模式和路径
  if (isFullMode) {
    result.mode = 'directory';
    if (barePaths.length > 0) {
      result.path = barePaths[0];
    }
  } else if (barePaths.length > 0) {
    result.mode = 'file';
    result.path = barePaths[0];
  }
  // 否则保持默认的 'diff' 模式

  return result;
}
