import { execSync } from 'child_process';
import { FileToReview } from '../types';

/**
 * 解析的 unified diff 块信息
 */
export interface DiffHunk {
  file: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

/**
 * Diff 行信息
 */
export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * GitDiffCollector - 解析 git diff 输出
 * 提取变更文件、变更行及周围上下文
 */
export class GitDiffCollector {
  private contextLines: number;

  constructor(contextLines: number = 50) {
    this.contextLines = contextLines;
  }

  /**
   * 获取 git diff 内容并解析为 FileToReview[]
   * @param ref 对比的 git ref，例如 "HEAD"、"main"、"origin/main"
   * @returns FileToReview 数组，包含文件路径、diff 内容、变更行范围等
   */
  async collect(ref: string = 'HEAD'): Promise<FileToReview[]> {
    try {
      // 获取 unified diff
      const diffOutput = this.getDiffOutput(ref);
      
      if (!diffOutput.trim()) {
        return [];
      }

      // 解析 diff 为 hunks
      const hunks = this.parseDiff(diffOutput);

      // 转换为 FileToReview
      return this.hunksToFileToReview(hunks);
    } catch (error) {
      throw new Error(
        `Failed to collect git diff from ${ref}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 获取原始 git diff 输出
   */
  private getDiffOutput(ref: string): string {
    try {
      // 使用 -U0 获取最少上下文，然后手动添加所需的上下文
      const cmd = `git diff -U0 ${ref}`;
      return execSync(cmd, { encoding: 'utf-8' });
    } catch (error) {
      throw new Error(`git diff command failed: ${error}`);
    }
  }

  /**
   * 解析 unified diff 格式
   * 返回所有 hunk（修改块）
   */
  parseDiff(diffOutput: string): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const lines = diffOutput.split('\n');

    let currentHunk: Partial<DiffHunk> | null = null;
    let currentFile: string | null = null;

    for (const line of lines) {
      // 检测文件行 (diff --git a/path b/path)
      if (line.startsWith('diff --git')) {
        const match = line.match(/^diff --git a\/(.*?) b\/(.*?)$/);
        if (match) {
          currentFile = match[2];
        }
      }

      // 检测 hunk header (@@)
      if (line.startsWith('@@')) {
        // 保存之前的 hunk
        if (currentHunk && currentFile) {
          hunks.push({
            file: currentFile,
            ...(currentHunk as Omit<DiffHunk, 'file'>),
          });
        }

        // 解析新 hunk
        const headerMatch = line.match(
          /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
        );
        if (headerMatch && currentFile) {
          currentHunk = {
            file: currentFile,
            oldStart: parseInt(headerMatch[1], 10),
            oldCount: parseInt(headerMatch[2] || '1', 10),
            newStart: parseInt(headerMatch[3], 10),
            newCount: parseInt(headerMatch[4] || '1', 10),
            lines: [],
          };
        }
        continue;
      }

      // 处理 hunk 内容行
      if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ') || line === '')) {
        const diffLine = this.parseDiffLine(line);
        if (diffLine) {
          (currentHunk.lines as DiffLine[]).push(diffLine);
        }
      }
    }

    // 保存最后一个 hunk
    if (currentHunk && currentFile) {
      hunks.push({
        file: currentFile,
        ...(currentHunk as Omit<DiffHunk, 'file'>),
      });
    }

    return hunks;
  }

  /**
   * 解析单行 diff 行
   */
  private parseDiffLine(line: string): DiffLine | null {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
      return null;
    }

    const prefix = line[0];
    const content = line.slice(1);

    if (prefix === '+') {
      return { type: 'add', content };
    } else if (prefix === '-') {
      return { type: 'remove', content };
    } else if (prefix === ' ' || prefix === '') {
      return { type: 'context', content };
    }

    return null;
  }

  /**
   * 将 hunks 转换为 FileToReview 数组
   * 为每个变更文件提供原始 diff 内容
   */
  hunksToFileToReview(hunks: DiffHunk[]): FileToReview[] {
    const fileMap = new Map<string, FileToReview>();

    for (const hunk of hunks) {
      if (!fileMap.has(hunk.file)) {
        fileMap.set(hunk.file, {
          path: hunk.file,
          diff: '',
          language: this.inferLanguage(hunk.file),
        });
      }

      const file = fileMap.get(hunk.file)!;
      
      // 构建 hunk 的 diff 表示
      const hunkDiff = this.formatHunkDiff(hunk);
      file.diff = (file.diff || '') + hunkDiff;
    }

    return Array.from(fileMap.values());
  }

  /**
   * 格式化单个 hunk 为 unified diff 格式
   */
  private formatHunkDiff(hunk: DiffHunk): string {
    const header = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@\n`;
    const content = hunk.lines
      .map((line) => {
        const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
        return prefix + line.content;
      })
      .join('\n');

    return header + content + '\n';
  }

  /**
   * 根据文件扩展名推断语言
   */
  private inferLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      java: 'java',
      go: 'go',
      rb: 'ruby',
      rs: 'rust',
      cpp: 'cpp',
      c: 'c',
      h: 'c',
      cs: 'csharp',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      sql: 'sql',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      xml: 'xml',
      html: 'html',
      css: 'css',
      scss: 'scss',
      less: 'less',
    };

    return languageMap[ext] || ext || 'text';
  }
}
