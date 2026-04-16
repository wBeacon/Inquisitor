import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { FileToReview } from '../types';
import { inferLanguage } from '../utils/language-util';

/**
 * ContextEnricher - 扩展文件上下文
 * 通过分析 import/require 语句发现相关文件，读取依赖文件作为上下文
 */
export class ContextEnricher {
  private maxDepth: number;
  private maxTotalSize: number;
  private projectRoot: string;
  private visited: Set<string> = new Set();
  private currentSize: number = 0;

  constructor(options: {
    maxDepth?: number;
    maxTotalSize?: number;
    projectRoot?: string;
  } = {}) {
    this.maxDepth = options.maxDepth ?? 2;
    this.maxTotalSize = options.maxTotalSize ?? 500 * 1024; // 500KB 默认值
    this.projectRoot = options.projectRoot || process.cwd();
  }

  /**
   * 丰富文件上下文
   * @param files 初始文件列表
   * @returns 增加了上下文的文件列表
   */
  async enrich(files: FileToReview[]): Promise<FileToReview[]> {
    this.visited.clear();
    this.currentSize = 0;

    const enrichedMap = new Map<string, FileToReview>();

    // 首先添加所有初始文件
    for (const file of files) {
      enrichedMap.set(file.path, file);
      this.visited.add(resolve(this.projectRoot, file.path));
      this.currentSize += (file.content || '').length;
    }

    // 对每个文件发现依赖
    for (const file of files) {
      if (this.currentSize >= this.maxTotalSize) {
        break;
      }

      const dependencies = this.extractDependencies(file.path, file.content || '');
      await this.discoverDependencies(
        dependencies,
        enrichedMap,
        file.path,
        0
      );
    }

    return Array.from(enrichedMap.values());
  }

  /**
   * 从文件内容中提取依赖（import/require 语句）
   */
  private extractDependencies(filePath: string, content: string): string[] {
    const dependencies: string[] = [];
    
    // TypeScript/JavaScript import patterns
    const importPatterns = [
      // ES6 imports: import ... from 'module'
      /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:,\s*)?)*?\s*from\s+['"]([^'"]+)['"]/g,
      // CommonJS require: require('module')
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const modulePath = match[1];
        
        // 过滤外部包，只保留相对路径
        if (modulePath.startsWith('.')) {
          dependencies.push(modulePath);
        }
      }
    }

    return dependencies;
  }

  /**
   * 递归发现依赖文件
   * @param dependencies 依赖路径列表
   * @param fileMap 已发现的文件集合
   * @param sourceFilePath 当前正在处理的源文件路径（用于解析相对路径）
   * @param depth 当前递归深度
   */
  private async discoverDependencies(
    dependencies: string[],
    fileMap: Map<string, FileToReview>,
    sourceFilePath: string,
    depth: number
  ): Promise<void> {
    if (depth >= this.maxDepth || this.currentSize >= this.maxTotalSize) {
      return;
    }

    const fileDir = dirname(resolve(this.projectRoot, sourceFilePath));

    for (const depPath of dependencies) {
      if (this.currentSize >= this.maxTotalSize) {
        break;
      }

      // 解析依赖路径
      const resolvedPaths = this.resolveDependencyPath(depPath, fileDir);

      for (const resolved of resolvedPaths) {
        if (this.visited.has(resolved)) {
          continue;
        }

        const file = this.readDependencyFile(resolved);
        if (file) {
          this.visited.add(resolved);
          const relativePath = resolved.replace(this.projectRoot + '/', '');
          fileMap.set(relativePath, file);
          this.currentSize += (file.content || '').length;

          // 继续递归发现子依赖
          const subDeps = this.extractDependencies(
            relativePath,
            file.content || ''
          );
          await this.discoverDependencies(subDeps, fileMap, relativePath, depth + 1);
        }
      }
    }
  }

  /**
   * 解析依赖路径
   * 支持多种扩展名
   */
  private resolveDependencyPath(depPath: string, fromDir: string): string[] {
    const basePath = resolve(fromDir, depPath);
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];
    const candidates: string[] = [];

    // 尝试不同的扩展名
    for (const ext of extensions) {
      const candidate = basePath + ext;
      if (existsSync(candidate)) {
        candidates.push(candidate);
      }
    }

    // 尝试 index 文件
    const indexPath = resolve(basePath, 'index');
    for (const ext of extensions) {
      const candidate = indexPath + ext;
      if (existsSync(candidate)) {
        candidates.push(candidate);
      }
    }

    // 尝试目录本身
    if (existsSync(basePath)) {
      candidates.push(basePath);
    }

    return candidates;
  }

  /**
   * 读取依赖文件
   */
  private readDependencyFile(filePath: string): FileToReview | null {
    try {
      if (!existsSync(filePath)) {
        return null;
      }

      const content = readFileSync(filePath, 'utf-8');
      const relativePath = filePath.replace(this.projectRoot + '/', '');

      return {
        path: relativePath,
        content,
        language: inferLanguage(filePath),
      };
    } catch (error) {
      // 忽略读取错误
      return null;
    }
  }

}
