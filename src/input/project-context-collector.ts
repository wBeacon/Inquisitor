/**
 * project-context-collector.ts - 项目级上下文采集器
 *
 * 自动检测项目配置文件（eslint、editorconfig、tsconfig 等），
 * 将其内容注入审查上下文，帮助审查 Agent 了解项目规范。
 *
 * 设计原则：
 * 1. 任何单个配置文件缺失时不抛异常，缺失字段为 undefined
 * 2. 所有文件 IO 错误（权限不足、符号链接断裂等）graceful 处理
 * 3. 序列化后总大小不超过 MAX_CONTEXT_BYTES，超出部分截断并标记
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/** 序列化上下文最大字节数 */
const MAX_CONTEXT_BYTES = 4096;

/** 截断标记 */
const TRUNCATION_MARKER = '...[TRUNCATED]';

/**
 * 单个配置文件的采集结果
 */
export interface ConfigFileEntry {
  /** 配置文件相对路径 */
  filePath: string;
  /** 文件内容（可能被截断） */
  content: string;
  /** 是否被截断 */
  truncated: boolean;
}

/**
 * 项目上下文结构化对象
 * 每个可选字段对应一类配置文件
 */
export interface ProjectContext {
  /** ESLint 配置 */
  eslint?: ConfigFileEntry;
  /** EditorConfig 配置 */
  editorconfig?: ConfigFileEntry;
  /** TypeScript 配置 */
  tsconfig?: ConfigFileEntry;
  /** README 文件 */
  readme?: ConfigFileEntry;
  /** 采集元数据 */
  metadata: {
    /** 项目根目录 */
    projectRoot: string;
    /** 采集到的配置文件数量 */
    collectedCount: number;
    /** 序列化总大小（字节） */
    totalBytes: number;
    /** 是否因总大小限制发生截断 */
    truncatedByLimit: boolean;
  };
}

/**
 * 项目上下文采集器配置
 */
export interface ProjectContextCollectorOptions {
  /** 是否启用项目上下文采集（默认 true） */
  enabled?: boolean;
}

/**
 * ESLint 配置文件候选列表（按优先级排序）
 */
const ESLINT_CANDIDATES = [
  '.eslintrc.json',
  '.eslintrc.js',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  '.eslintrc',
];

/**
 * ProjectContextCollector - 项目级上下文采集器
 *
 * 自动检测并读取项目配置文件，生成结构化的项目上下文信息。
 * 供审查 Agent 参考项目的编码规范、类型约束等。
 */
export class ProjectContextCollector {
  private options: Required<ProjectContextCollectorOptions>;

  constructor(options?: ProjectContextCollectorOptions) {
    this.options = {
      enabled: options?.enabled ?? true,
    };
  }

  /**
   * 采集项目上下文
   *
   * @param projectRoot - 项目根目录
   * @returns 结构化的项目上下文对象
   */
  collect(projectRoot: string): ProjectContext {
    // 禁用时直接返回空结果
    if (!this.options.enabled) {
      return {
        metadata: {
          projectRoot,
          collectedCount: 0,
          totalBytes: 0,
          truncatedByLimit: false,
        },
      };
    }

    const result: ProjectContext = {
      metadata: {
        projectRoot,
        collectedCount: 0,
        totalBytes: 0,
        truncatedByLimit: false,
      },
    };

    // 采集各类配置文件
    result.eslint = this.collectEslint(projectRoot);
    result.editorconfig = this.collectFile(projectRoot, '.editorconfig');
    result.tsconfig = this.collectFile(projectRoot, 'tsconfig.json');
    result.readme = this.collectReadme(projectRoot);

    // 统计采集到的数量
    const fields: (keyof ProjectContext)[] = ['eslint', 'editorconfig', 'tsconfig', 'readme'];
    for (const field of fields) {
      if (result[field] !== undefined) {
        result.metadata.collectedCount++;
      }
    }

    // 强制总大小限制
    this.enforceMaxSize(result);

    return result;
  }

  /**
   * 将项目上下文序列化为可拼入审查上下文的字符串
   */
  static serialize(ctx: ProjectContext): string {
    if (ctx.metadata.collectedCount === 0) {
      return '';
    }

    const parts: string[] = ['\n--- Project Configuration Context ---'];

    if (ctx.eslint) {
      parts.push(`\n[ESLint Config: ${ctx.eslint.filePath}]`);
      parts.push(ctx.eslint.content);
    }
    if (ctx.editorconfig) {
      parts.push(`\n[EditorConfig: ${ctx.editorconfig.filePath}]`);
      parts.push(ctx.editorconfig.content);
    }
    if (ctx.tsconfig) {
      parts.push(`\n[TypeScript Config: ${ctx.tsconfig.filePath}]`);
      parts.push(ctx.tsconfig.content);
    }
    if (ctx.readme) {
      parts.push(`\n[README: ${ctx.readme.filePath}]`);
      parts.push(ctx.readme.content);
    }

    if (ctx.metadata.truncatedByLimit) {
      parts.push('\n[Note: Project context was truncated due to size limit]');
    }

    return parts.join('\n');
  }

  /**
   * 采集 ESLint 配置文件（按候选列表优先级匹配第一个存在的文件）
   */
  private collectEslint(projectRoot: string): ConfigFileEntry | undefined {
    for (const candidate of ESLINT_CANDIDATES) {
      const entry = this.collectFile(projectRoot, candidate);
      if (entry) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * 采集 README 文件（支持多种命名）
   */
  private collectReadme(projectRoot: string): ConfigFileEntry | undefined {
    const candidates = ['README.md', 'README.MD', 'readme.md', 'README', 'README.txt'];
    for (const candidate of candidates) {
      const entry = this.collectFile(projectRoot, candidate);
      if (entry) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * 安全读取单个配置文件
   * 所有 IO 错误均被捕获，不抛异常
   */
  private collectFile(projectRoot: string, fileName: string): ConfigFileEntry | undefined {
    try {
      const filePath = resolve(projectRoot, fileName);
      if (!existsSync(filePath)) {
        return undefined;
      }
      const content = readFileSync(filePath, 'utf-8');
      return {
        filePath: fileName,
        content,
        truncated: false,
      };
    } catch {
      // 权限不足、符号链接断裂等 IO 错误，静默忽略
      return undefined;
    }
  }

  /**
   * 强制序列化总大小不超过 MAX_CONTEXT_BYTES
   * 如果超出，按优先级从低到高依次截断：readme > editorconfig > tsconfig > eslint
   */
  private enforceMaxSize(ctx: ProjectContext): void {
    let serialized = JSON.stringify(ctx);
    let totalBytes = Buffer.byteLength(serialized, 'utf-8');
    ctx.metadata.totalBytes = totalBytes;

    if (totalBytes <= MAX_CONTEXT_BYTES) {
      return;
    }

    // 需要截断，按优先级从低到高截断
    const truncationOrder: (keyof ProjectContext)[] = ['readme', 'editorconfig', 'tsconfig', 'eslint'];

    for (const field of truncationOrder) {
      if (totalBytes <= MAX_CONTEXT_BYTES) {
        break;
      }

      const entry = ctx[field] as ConfigFileEntry | undefined;
      if (!entry || !entry.content) {
        continue;
      }

      // 计算需要释放的字节数
      const currentBytes = Buffer.byteLength(JSON.stringify(ctx), 'utf-8');
      if (currentBytes <= MAX_CONTEXT_BYTES) {
        break;
      }

      // 逐步截断该字段的内容
      const excess = currentBytes - MAX_CONTEXT_BYTES;
      const contentBytes = Buffer.byteLength(entry.content, 'utf-8');

      if (contentBytes <= excess + TRUNCATION_MARKER.length) {
        // 内容不够截，直接移除
        delete (ctx as unknown as Record<string, unknown>)[field];
        ctx.metadata.collectedCount--;
      } else {
        // 截断内容
        entry.content = this.truncateToBytes(entry.content, contentBytes - excess - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
        entry.truncated = true;
      }

      ctx.metadata.truncatedByLimit = true;
      serialized = JSON.stringify(ctx);
      totalBytes = Buffer.byteLength(serialized, 'utf-8');
    }

    ctx.metadata.totalBytes = totalBytes;
  }

  /**
   * 将字符串截断到指定字节数（安全处理多字节字符）
   */
  private truncateToBytes(str: string, maxBytes: number): string {
    const buf = Buffer.from(str, 'utf-8');
    if (buf.length <= maxBytes) {
      return str;
    }
    // 截断到 maxBytes，然后转回字符串（可能截断多字节字符的中间）
    let truncated = buf.subarray(0, maxBytes).toString('utf-8');
    // 移除末尾可能的不完整字符（替换字符 \uFFFD）
    truncated = truncated.replace(/\uFFFD$/, '');
    return truncated;
  }
}
