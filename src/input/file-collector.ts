import { readFileSync, statSync, readdirSync } from 'fs';
import { resolve, extname, relative } from 'path';
import { glob } from 'glob';
import { minimatch } from 'minimatch';
import { FileToReview } from '../types';

/**
 * FileCollector - 收集要审查的文件
 * 支持单文件、目录、glob 模式
 */
export class FileCollector {
  /**
   * 收集文件并返回 FileToReview 数组
   * @param input 文件路径、目录路径或 glob 模式
   * @param ignorePatterns 可选的忽略模式列表（glob 格式），匹配的文件会被排除
   * @returns FileToReview 数组
   */
  async collect(input: string, ignorePatterns?: string[]): Promise<FileToReview[]> {
    try {
      let files: FileToReview[];

      // 判断输入类型
      if (input.includes('*') || input.includes('?') || input.includes('[')) {
        // 是 glob 模式
        files = await this.collectFromGlob(input);
      } else {
        const stat = statSync(input);
        if (stat.isFile()) {
          files = this.collectFromFile(input);
        } else if (stat.isDirectory()) {
          files = this.collectFromDirectory(input);
        } else {
          throw new Error(`Path is neither file nor directory: ${input}`);
        }
      }

      // 应用 ignore 模式过滤
      if (ignorePatterns && ignorePatterns.length > 0) {
        files = this.applyIgnorePatterns(files, ignorePatterns);
      }

      return files;
    } catch (error) {
      throw new Error(
        `Failed to collect files from ${input}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 使用 ignore 模式过滤文件列表
   * @param files 文件列表
   * @param ignorePatterns glob 格式的忽略模式
   * @returns 过滤后的文件列表
   */
  private applyIgnorePatterns(
    files: FileToReview[],
    ignorePatterns: string[]
  ): FileToReview[] {
    return files.filter((file) => {
      return !ignorePatterns.some((pattern) => minimatch(file.path, pattern));
    });
  }

  /**
   * 从单个文件收集
   */
  private collectFromFile(filePath: string): FileToReview[] {
    const absPath = resolve(filePath);
    const content = readFileSync(absPath, 'utf-8');
    
    return [
      {
        path: filePath,
        content,
        language: this.inferLanguage(filePath),
      },
    ];
  }

  /**
   * 从目录递归收集所有代码文件
   */
  private collectFromDirectory(dirPath: string): FileToReview[] {
    const absPath = resolve(dirPath);
    const files: FileToReview[] = [];
    
    this.walkDirectory(absPath, (filePath) => {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const relativePath = filePath.replace(absPath, '').replace(/^\//, '');
        
        files.push({
          path: relativePath || filePath,
          content,
          language: this.inferLanguage(filePath),
        });
      } catch (error) {
        // 忽略无法读取的文件（权限问题、二进制文件等）
        console.warn(`Cannot read file ${filePath}: ${error}`);
      }
    });

    return files;
  }

  /**
   * 从 glob 模式收集
   */
  private async collectFromGlob(pattern: string): Promise<FileToReview[]> {
    const matches = await glob(pattern, {
      nodir: true,
    });

    const files: FileToReview[] = [];

    for (const filePath of matches) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        files.push({
          path: filePath,
          content,
          language: this.inferLanguage(filePath),
        });
      } catch (error) {
        // 忽略无法读取的文件
        console.warn(`Cannot read file ${filePath}: ${error}`);
      }
    }

    return files;
  }

  /**
   * 递归遍历目录
   */
  private walkDirectory(
    dirPath: string,
    callback: (filePath: string) => void,
    options: {
      excludePatterns?: string[];
      maxDepth?: number;
    } = {}
  ): void {
    const { excludePatterns = [], maxDepth = Infinity } = options;
    
    const defaultExclude = [
      'node_modules',
      '.git',
      '.svn',
      'dist',
      'build',
      'coverage',
      '.next',
      '.venv',
      '__pycache__',
    ];

    const excludeAll = [...defaultExclude, ...excludePatterns];

    const walk = (currentPath: string, depth: number) => {
      if (depth > maxDepth) return;

      try {
        const entries = readdirSync(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          // 检查是否在排除列表中
          if (excludeAll.includes(entry.name)) {
            continue;
          }

          const fullPath = resolve(currentPath, entry.name);

          if (entry.isDirectory()) {
            walk(fullPath, depth + 1);
          } else if (entry.isFile()) {
            // 过滤掉二进制文件和无用的扩展名
            if (this.isCodeFile(entry.name)) {
              callback(fullPath);
            }
          }
        }
      } catch (error) {
        // 忽略目录访问错误
        console.warn(`Cannot read directory ${currentPath}: ${error}`);
      }
    };

    walk(dirPath, 0);
  }

  /**
   * 判断是否为代码文件
   */
  private isCodeFile(fileName: string): boolean {
    const ext = extname(fileName).toLowerCase();
    
    // 代码相关的扩展名
    const codeExtensions = [
      // TypeScript/JavaScript
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      // Python
      '.py', '.pyi',
      // Java
      '.java',
      // Go
      '.go',
      // Rust
      '.rs',
      // C/C++
      '.c', '.cc', '.cpp', '.h', '.hpp',
      // C#
      '.cs',
      // PHP
      '.php',
      // Ruby
      '.rb',
      // Swift
      '.swift',
      // Kotlin
      '.kt',
      // SQL
      '.sql',
      // Markup
      '.html', '.xml', '.json', '.yaml', '.yml',
      // Stylesheet
      '.css', '.scss', '.less',
      // Shell
      '.sh', '.bash',
      // Other
      '.md', '.txt', '.ini', '.conf', '.config',
    ];

    // 排除的模式（只排除明确的非代码文件）
    const excludePatterns = [
      /\.min\.(js|css)$/, // 压缩后的文件
      /\.(jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf|eot)$/, // 二进制资源文件
    ];

    if (!codeExtensions.includes(ext)) {
      return false;
    }

    return !excludePatterns.some((pattern) => pattern.test(fileName));
  }

  /**
   * 根据文件扩展名推断语言
   */
  private inferLanguage(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rb': 'ruby',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.cs': 'csharp',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.sql': 'sql',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.less': 'less',
      '.sh': 'bash',
      '.md': 'markdown',
    };

    return languageMap[ext] || ext.slice(1) || 'text';
  }
}
