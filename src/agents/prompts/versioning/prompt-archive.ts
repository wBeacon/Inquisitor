/**
 * Prompt Archive - Snapshot 存储和查询系统
 *
 * 设计原则：
 * 1. 将每次执行的 prompt 版本信息作为快照存储
 * 2. 文件组织: .inquisitor/prompt-archive/[dimension]/[YYYY-MM-DD]/snapshot-*.json
 * 3. 支持按维度、日期、A/B 测试 ID 查询
 * 4. 支持性能指标聚合和对比
 * 5. 快照包含完整元数据用于追踪和分析
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { ReviewDimension } from '../../../types';

/**
 * Prompt 快照 - 完整的执行记录
 */
export interface PromptSnapshot {
  /** 快照唯一标识 */
  id: string;
  /** 创建时间戳 (ISO 8601) */
  timestamp: string;
  /** 关联的审查 ID (可选) */
  reviewId?: string;
  /** 审查维度 */
  dimension: ReviewDimension;
  /** 使用的 Prompt 版本 */
  promptVersion: string;
  /** System prompt 内容的 SHA256 哈希 */
  systemPromptHash: string;
  /** User message 内容的 SHA256 哈希 */
  userMessageHash: string;
  /** A/B 测试 ID (如果适用) */
  abTestId?: string;
  /** A/B 测试分组 (A 或 B) */
  abTestGroup?: 'A' | 'B';
  /** 执行指标 */
  metrics: {
    /** 输入 token 数 */
    inputTokens: number;
    /** 输出 token 数 */
    outputTokens: number;
    /** 执行耗时 (毫秒) */
    durationMs: number;
    /** 发现的问题数 */
    issueCount: number;
    /** 问题的平均置信度 */
    averageConfidence?: number;
    /** 问题的最高严重程度 */
    maxSeverity?: string;
  };
  /** 版本选择策略 */
  selectionStrategy?: string;
  /** 执行是否成功 */
  success: boolean;
  /** 错误信息 (如有) */
  error?: string;
}

/**
 * 快照查询选项
 */
export interface SnapshotQueryOptions {
  /** 审查维度 */
  dimension?: ReviewDimension;
  /** 开始日期 (YYYY-MM-DD 或 ISO 字符串) */
  startDate?: string;
  /** 结束日期 (YYYY-MM-DD 或 ISO 字符串) */
  endDate?: string;
  /** A/B 测试 ID */
  abTestId?: string;
  /** Prompt 版本 */
  promptVersion?: string;
  /** 只返回成功的快照 */
  onlySuccess?: boolean;
  /** 分页: 页码 */
  page?: number;
  /** 分页: 每页数量 */
  pageSize?: number;
  /** 排序字段 */
  sortBy?: 'timestamp' | 'issueCount' | 'durationMs';
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
}

/**
 * 快照查询结果
 */
export interface SnapshotQueryResult {
  /** 匹配的快照列表 */
  snapshots: PromptSnapshot[];
  /** 总数 */
  total: number;
  /** 分页信息 */
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/**
 * 性能聚合统计
 */
export interface PerformanceAggregation {
  /** 统计维度 */
  dimension: ReviewDimension;
  /** Prompt 版本 (如适用) */
  promptVersion?: string;
  /** 样本数 */
  sampleCount: number;
  /** 平均执行耗时 (毫秒) */
  avgDurationMs: number;
  /** 中位数执行耗时 (毫秒) */
  medianDurationMs: number;
  /** 平均 issue 数 */
  avgIssueCount: number;
  /** 平均置信度 */
  avgConfidence: number;
  /** 成功率 */
  successRate: number;
  /** 日期范围 */
  dateRange?: {
    start: string;
    end: string;
  };
  /** 最近更新时间 */
  lastUpdated: string;
}

/**
 * PromptArchive - 快照存储和查询系统
 */
export class PromptArchive {
  private archiveRoot: string;
  private snapshotCache: Map<string, PromptSnapshot> = new Map();
  private cacheTTL: number = 5 * 60 * 1000; // 5 分钟
  private cacheTimestamp: Map<string, number> = new Map();

  constructor(archiveRoot: string = '.inquisitor/prompt-archive') {
    this.archiveRoot = archiveRoot;
    this.ensureArchiveDirectory();
  }

  /**
   * 记录一个 Prompt 快照
   */
  async recordSnapshot(snapshot: Omit<PromptSnapshot, 'id'>): Promise<PromptSnapshot> {
    // 生成快照 ID
    const id = this.generateSnapshotId();

    const fullSnapshot: PromptSnapshot = {
      ...snapshot,
      id,
    };

    // 确定文件路径
    const date = new Date(snapshot.timestamp);
    const dateStr = this.formatDate(date);
    const dimensionDir = path.join(this.archiveRoot, snapshot.dimension, dateStr);

    // 确保目录存在
    this.ensureDirectory(dimensionDir);

    // 保存快照文件
    const filePath = path.join(dimensionDir, `snapshot-${id}.json`);
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(fullSnapshot, null, 2),
      'utf-8',
    );

    // 加入缓存
    this.snapshotCache.set(id, fullSnapshot);
    this.cacheTimestamp.set(id, Date.now());

    return fullSnapshot;
  }

  /**
   * 获取单个快照
   */
  async getSnapshot(snapshotId: string): Promise<PromptSnapshot | null> {
    // 检查缓存
    if (this.snapshotCache.has(snapshotId)) {
      const cached = this.snapshotCache.get(snapshotId)!;
      const timestamp = this.cacheTimestamp.get(snapshotId);
      if (timestamp && Date.now() - timestamp < this.cacheTTL) {
        return cached;
      }
    }

    // 从文件系统查询
    const snapshot = await this.findSnapshotInFilesystem(snapshotId);
    if (snapshot) {
      this.snapshotCache.set(snapshotId, snapshot);
      this.cacheTimestamp.set(snapshotId, Date.now());
    }
    return snapshot || null;
  }

  /**
   * 删除快照
   */
  async deleteSnapshot(snapshotId: string): Promise<boolean> {
    try {
      // 从文件系统删除
      const snapshot = await this.findSnapshotInFilesystem(snapshotId);
      if (!snapshot) {
        return false;
      }

      const date = new Date(snapshot.timestamp);
      const dateStr = this.formatDate(date);
      const filePath = path.join(
        this.archiveRoot,
        snapshot.dimension,
        dateStr,
        `snapshot-${snapshotId}.json`,
      );

      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }

      // 从缓存删除
      this.snapshotCache.delete(snapshotId);
      this.cacheTimestamp.delete(snapshotId);

      return true;
    } catch (error) {
      console.error(`Failed to delete snapshot ${snapshotId}:`, error);
      return false;
    }
  }

  /**
   * 查询快照
   */
  async querySnapshots(options: SnapshotQueryOptions): Promise<SnapshotQueryResult> {
    const snapshots = await this.loadAllSnapshots(options);

    // 应用排序
    const sorted = this.sortSnapshots(snapshots, options.sortBy, options.sortOrder);

    // 应用分页
    const page = options.page || 1;
    const pageSize = options.pageSize || 50;
    const total = sorted.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginated = sorted.slice(start, end);
    const totalPages = Math.ceil(total / pageSize);

    return {
      snapshots: paginated,
      total,
      pagination: {
        page,
        pageSize,
        totalPages,
      },
    };
  }

  /**
   * 计算性能聚合统计
   */
  async calculatePerformanceAggregation(
    dimension: ReviewDimension,
    options?: {
      promptVersion?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<PerformanceAggregation> {
    const snapshots = await this.loadAllSnapshots({
      dimension,
      promptVersion: options?.promptVersion,
      startDate: options?.startDate,
      endDate: options?.endDate,
      onlySuccess: true,
    });

    if (snapshots.length === 0) {
      return {
        dimension,
        promptVersion: options?.promptVersion,
        sampleCount: 0,
        avgDurationMs: 0,
        medianDurationMs: 0,
        avgIssueCount: 0,
        avgConfidence: 0,
        successRate: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    // 计算指标
    const durations = snapshots.map(s => s.metrics.durationMs);
    const issueCounts = snapshots.map(s => s.metrics.issueCount);
    const confidences = snapshots
      .map(s => s.metrics.averageConfidence || 0)
      .filter(c => c > 0);

    const avgDurationMs = durations.reduce((a, b) => a + b, 0) / durations.length;
    const medianDurationMs = this.calculateMedian(durations);
    const avgIssueCount = issueCounts.reduce((a, b) => a + b, 0) / issueCounts.length;
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    // 计算成功率
    const successCount = snapshots.filter(s => s.success).length;
    const successRate = successCount / snapshots.length;

    // 计算日期范围
    const timestamps = snapshots.map(s => new Date(s.timestamp));
    const minDate = new Date(Math.min(...timestamps.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...timestamps.map(d => d.getTime())));

    return {
      dimension,
      promptVersion: options?.promptVersion,
      sampleCount: snapshots.length,
      avgDurationMs,
      medianDurationMs,
      avgIssueCount,
      avgConfidence,
      successRate,
      dateRange: {
        start: minDate.toISOString(),
        end: maxDate.toISOString(),
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * 对比两个版本的性能
   */
  async compareVersionPerformance(
    dimension: ReviewDimension,
    versionA: string,
    versionB: string,
    options?: {
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{
    versionA: PerformanceAggregation;
    versionB: PerformanceAggregation;
    improvement?: {
      durationImprovement: number; // 百分比 (正数表示加速)
      issueCountChange: number; // 正数表示发现更多问题
      confidenceImprovement: number; // 百分比 (正数表示提升)
    };
  }> {
    const aggA = await this.calculatePerformanceAggregation(dimension, {
      promptVersion: versionA,
      startDate: options?.startDate,
      endDate: options?.endDate,
    });

    const aggB = await this.calculatePerformanceAggregation(dimension, {
      promptVersion: versionB,
      startDate: options?.startDate,
      endDate: options?.endDate,
    });

    // 计算改进指标
    const improvement = aggA.sampleCount > 0 && aggB.sampleCount > 0
      ? {
          durationImprovement: ((aggA.avgDurationMs - aggB.avgDurationMs) / aggA.avgDurationMs) * 100,
          issueCountChange: aggB.avgIssueCount - aggA.avgIssueCount,
          confidenceImprovement: ((aggB.avgConfidence - aggA.avgConfidence) / aggA.avgConfidence) * 100,
        }
      : undefined;

    return {
      versionA: aggA,
      versionB: aggB,
      improvement,
    };
  }

  /**
   * 清理过期快照 (按日期)
   */
  async cleanupOldSnapshots(daysToKeep: number): Promise<number> {
    let deletedCount = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    try {
      const dimensionDirs = fs.readdirSync(this.archiveRoot);
      for (const dimensionDir of dimensionDirs) {
        const dimensionPath = path.join(this.archiveRoot, dimensionDir);
        if (!fs.statSync(dimensionPath).isDirectory()) continue;

        const dateDirs = fs.readdirSync(dimensionPath);
        for (const dateDir of dateDirs) {
          const datePath = path.join(dimensionPath, dateDir);
          if (!fs.statSync(datePath).isDirectory()) continue;

          // 解析日期
          const parsedDate = this.parseDate(dateDir);
          if (parsedDate && parsedDate < cutoffDate) {
            // 删除整个目录
            await fs.promises.rm(datePath, { recursive: true, force: true });
            deletedCount++;
          }
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old snapshots:', error);
    }

    return deletedCount;
  }

  /**
   * 私有方法
   */

  private generateSnapshotId(): string {
    return createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 16);
  }

  private formatDate(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseDate(dateStr: string): Date | null {
    const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return new Date(`${dateStr}T00:00:00Z`);
  }

  private ensureDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private ensureArchiveDirectory(): void {
    this.ensureDirectory(this.archiveRoot);
  }

  private async findSnapshotInFilesystem(snapshotId: string): Promise<PromptSnapshot | null> {
    try {
      const dimensionDirs = fs.readdirSync(this.archiveRoot);
      for (const dimensionDir of dimensionDirs) {
        const dimensionPath = path.join(this.archiveRoot, dimensionDir);
        if (!fs.statSync(dimensionPath).isDirectory()) continue;

        const dateDirs = fs.readdirSync(dimensionPath);
        for (const dateDir of dateDirs) {
          const datePath = path.join(dimensionPath, dateDir);
          if (!fs.statSync(datePath).isDirectory()) continue;

          const filePath = path.join(datePath, `snapshot-${snapshotId}.json`);
          if (fs.existsSync(filePath)) {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return JSON.parse(content);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to find snapshot ${snapshotId}:`, error);
    }
    return null;
  }

  private async loadAllSnapshots(options: SnapshotQueryOptions): Promise<PromptSnapshot[]> {
    const snapshots: PromptSnapshot[] = [];

    try {
      const dimensionDirs = fs.readdirSync(this.archiveRoot);
      for (const dimensionDir of dimensionDirs) {
        // 如果指定了维度，则只查询该维度
        if (options.dimension && dimensionDir !== options.dimension) {
          continue;
        }

        const dimensionPath = path.join(this.archiveRoot, dimensionDir);
        if (!fs.statSync(dimensionPath).isDirectory()) continue;

        const dateDirs = fs.readdirSync(dimensionPath);
        for (const dateDir of dateDirs) {
          const datePath = path.join(dimensionPath, dateDir);
          if (!fs.statSync(datePath).isDirectory()) continue;

          // 检查日期范围
          if (!this.isDateInRange(dateDir, options.startDate, options.endDate)) {
            continue;
          }

          // 读取该日期下的所有快照
          const files = fs.readdirSync(datePath).filter(f => f.startsWith('snapshot-'));
          for (const file of files) {
            try {
              const filePath = path.join(datePath, file);
              const content = await fs.promises.readFile(filePath, 'utf-8');
              const snapshot: PromptSnapshot = JSON.parse(content);

              // 应用过滤条件
              if (this.matchesQueryOptions(snapshot, options)) {
                snapshots.push(snapshot);
              }
            } catch (error) {
              console.error(`Failed to read snapshot file ${file}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load snapshots:', error);
    }

    return snapshots;
  }

  private isDateInRange(
    dateStr: string,
    startDate?: string,
    endDate?: string,
  ): boolean {
    const date = this.parseDate(dateStr);
    if (!date) return false;

    if (startDate) {
      const start = new Date(startDate);
      if (date < start) return false;
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);
      if (date > end) return false;
    }

    return true;
  }

  private matchesQueryOptions(snapshot: PromptSnapshot, options: SnapshotQueryOptions): boolean {
    // 检查维度
    if (options.dimension && snapshot.dimension !== options.dimension) {
      return false;
    }

    // 检查 A/B 测试 ID
    if (options.abTestId && snapshot.abTestId !== options.abTestId) {
      return false;
    }

    // 检查 Prompt 版本
    if (options.promptVersion && snapshot.promptVersion !== options.promptVersion) {
      return false;
    }

    // 检查成功标志
    if (options.onlySuccess && !snapshot.success) {
      return false;
    }

    return true;
  }

  private sortSnapshots(
    snapshots: PromptSnapshot[],
    sortBy?: string,
    sortOrder?: string,
  ): PromptSnapshot[] {
    const sorted = [...snapshots];

    sorted.sort((a, b) => {
      let comparison = 0;

      // 当sortBy不指定时，默认按timestamp降序
      if (!sortBy) {
        comparison = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        return comparison;
      }

      // 其他情况下，按sortOrder确定方向
      const order = sortOrder === 'asc' ? 1 : -1;

      switch (sortBy) {
        case 'timestamp':
          comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
        case 'issueCount':
          comparison = a.metrics.issueCount - b.metrics.issueCount;
          break;
        case 'durationMs':
          comparison = a.metrics.durationMs - b.metrics.durationMs;
          break;
        default:
          comparison = 0;
      }

      return comparison * order;
    });

    return sorted;
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
}
