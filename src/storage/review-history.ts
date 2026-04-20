import * as fs from 'fs';
import * as path from 'path';
import { ReviewReport } from '../types/review';
import {
  HistoryRecord,
  HistoryRecordSummary,
  HistoryFilter,
  HistoryMetadata,
  ReviewHistoryOptions,
  QualityGrade,
} from '../types/history';

/**
 * 默认存储目录名
 */
const DEFAULT_STORAGE_DIR = '.inquisitor/history';

/**
 * 生成唯一 ID（时间戳 + 随机后缀）
 */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * ReviewHistory - 审查报告的历史追踪存储
 *
 * 使用本地 JSON 文件作为持久化存储，每条记录一个文件。
 * 支持 CRUD 操作、过滤查询和目录自动创建。
 */
export class ReviewHistory {
  private readonly storagePath: string;

  constructor(options?: ReviewHistoryOptions) {
    this.storagePath = options?.storagePath || path.resolve(process.cwd(), DEFAULT_STORAGE_DIR);
  }

  /**
   * 确保存储目录存在
   */
  private ensureDirectory(): void {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * 获取记录文件路径
   */
  private getRecordPath(id: string): string {
    return path.join(this.storagePath, `${id}.json`);
  }

  /**
   * 保存审查报告到历史记录
   * @param report 审查报告
   * @param metadata 元数据（项目标识等）
   * @returns 生成的记录 ID
   */
  save(report: ReviewReport, metadata: HistoryMetadata): string {
    this.ensureDirectory();

    const id = generateId();
    const record: HistoryRecord = {
      id,
      timestamp: new Date().toISOString(),
      projectId: metadata.projectId,
      commitHash: metadata.commitHash,
      branch: metadata.branch,
      report,
      files: metadata.files,
      tags: metadata.tags,
    };

    const filePath = this.getRecordPath(id);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
    return id;
  }

  /**
   * 加载单条历史记录
   * @param id 记录 ID
   * @returns 历史记录，不存在则返回 null
   */
  load(id: string): HistoryRecord | null {
    const filePath = this.getRecordPath(id);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as HistoryRecord;
    } catch {
      // 损坏数据容错：解析失败返回 null
      return null;
    }
  }

  /**
   * 列出历史记录摘要，支持过滤
   * 返回摘要信息（不含完整 issues 列表）以节省内存
   * @param filter 过滤条件（可选）
   * @returns 按时间倒序排列的摘要列表
   */
  list(filter?: HistoryFilter): HistoryRecordSummary[] {
    this.ensureDirectory();

    const files = this.listRecordFiles();
    const summaries: HistoryRecordSummary[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.storagePath, file), 'utf-8');
        const record = JSON.parse(content) as HistoryRecord;

        // 应用过滤条件
        if (!this.matchesFilter(record, filter)) {
          continue;
        }

        summaries.push(this.toSummary(record));
      } catch {
        // 跳过损坏的文件
        continue;
      }
    }

    // 按时间倒序排列
    summaries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return summaries;
  }

  /**
   * 删除单条历史记录
   * @param id 记录 ID
   * @returns 是否成功删除
   */
  delete(id: string): boolean {
    const filePath = this.getRecordPath(id);
    if (!fs.existsSync(filePath)) {
      return false;
    }

    try {
      fs.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取存储路径
   */
  getStoragePath(): string {
    return this.storagePath;
  }

  /**
   * 列出存储目录中的所有记录文件
   */
  private listRecordFiles(): string[] {
    try {
      return fs.readdirSync(this.storagePath).filter(f => f.endsWith('.json'));
    } catch {
      return [];
    }
  }

  /**
   * 检查记录是否匹配过滤条件
   */
  private matchesFilter(record: HistoryRecord, filter?: HistoryFilter): boolean {
    if (!filter) return true;

    // 按 projectId 过滤
    if (filter.projectId && record.projectId !== filter.projectId) {
      return false;
    }

    // 按时间范围过滤
    if (filter.startDate) {
      const recordTime = new Date(record.timestamp).getTime();
      const startTime = new Date(filter.startDate).getTime();
      if (recordTime < startTime) return false;
    }

    if (filter.endDate) {
      const recordTime = new Date(record.timestamp).getTime();
      const endTime = new Date(filter.endDate).getTime();
      if (recordTime > endTime) return false;
    }

    // 按质量评级过滤
    if (filter.qualityGrade) {
      const grade = record.report.metaReview?.qualityGrade;
      if (grade !== filter.qualityGrade) return false;
    }

    // 按分支过滤
    if (filter.branch && record.branch !== filter.branch) {
      return false;
    }

    // 按标签过滤（任一匹配即可）
    if (filter.tags && filter.tags.length > 0) {
      if (!record.tags || !filter.tags.some(t => record.tags!.includes(t))) {
        return false;
      }
    }

    return true;
  }

  /**
   * 将完整记录转换为摘要
   */
  private toSummary(record: HistoryRecord): HistoryRecordSummary {
    return {
      id: record.id,
      timestamp: record.timestamp,
      projectId: record.projectId,
      commitHash: record.commitHash,
      branch: record.branch,
      totalIssues: record.report.summary.totalIssues,
      severityCounts: { ...record.report.summary.bySeverity },
      qualityGrade: record.report.metaReview?.qualityGrade as QualityGrade | undefined,
      durationMs: record.report.metadata.durationMs,
      tags: record.tags,
    };
  }
}
