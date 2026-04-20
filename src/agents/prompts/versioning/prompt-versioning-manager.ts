/**
 * PromptVersioningManager - Prompt 版本管理核心类
 *
 * 功能：
 * 1. 版本存储和检索 (基于文件系统)
 * 2. 版本 CRUD 操作
 * 3. 版本对比和回滚
 * 4. 版本查询和搜索
 * 5. 性能指标追踪
 */

import * as fs from 'fs';
import * as path from 'path';
import { ReviewDimension } from '../../../types';
import {
  VersionedPrompt,
  PromptVersionMetadata,
  VersionSelectionStrategy,
  VersionSelectionResult,
  VersionComparison,
  VersionRollbackRequest,
  VersionRollbackResult,
  VersionQueryOptions,
  VersionQueryResult,
  PromptVersionListItem,
  VersionedPromptRegistry,
} from './types';

/**
 * PromptVersioningManager - 管理 Prompt 版本生命周期
 */
export class PromptVersioningManager {
  /** 版本存储根目录 */
  private readonly storageRoot: string;
  /** 内存缓存 (减少文件 I/O) */
  private cache: Map<string, VersionedPrompt> = new Map();
  /** 缓存有效期 (毫秒) */
  private readonly cacheTTL = 5 * 60 * 1000; // 5 分钟
  /** 缓存时间戳 */
  private cacheTimestamp = 0;

  constructor(storageRoot: string = '.inquisitor/prompt-versions') {
    this.storageRoot = storageRoot;
    this.ensureStorageDirectory();
  }

  /**
   * 确保存储目录存在
   */
  private ensureStorageDirectory(): void {
    if (!fs.existsSync(this.storageRoot)) {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    }

    // 为每个维度创建子目录
    const dimensions = Object.values(ReviewDimension);
    for (const dimension of dimensions) {
      const dimPath = this.getDimensionPath(dimension);
      if (!fs.existsSync(dimPath)) {
        fs.mkdirSync(dimPath, { recursive: true });
      }
    }
  }

  /**
   * 获取维度的存储路径
   */
  private getDimensionPath(dimension: ReviewDimension): string {
    return path.join(this.storageRoot, dimension);
  }

  /**
   * 获取版本文件路径
   */
  private getVersionFilePath(dimension: ReviewDimension, version: string): string {
    // 使用版本号作为文件名，替换特殊字符
    const safeVersion = version.replace(/[^a-zA-Z0-9.-]/g, '_');
    return path.join(this.getDimensionPath(dimension), `${safeVersion}.json`);
  }

  /**
   * 保存新版本
   */
  async saveVersion(versionedPrompt: VersionedPrompt): Promise<void> {
    const { dimension, metadata, content, metrics } = versionedPrompt;

    // 验证版本号格式
    this.validateSemver(metadata.version);

    // 检查版本是否已存在
    if (await this.versionExists(dimension, metadata.version)) {
      throw new Error(`Version ${metadata.version} already exists for dimension ${dimension}`);
    }

    // 准备完整对象
    const versionData: VersionedPrompt = {
      dimension,
      metadata: {
        ...metadata,
        updatedAt: new Date().toISOString(),
      },
      content,
      metrics,
    };

    const filePath = this.getVersionFilePath(dimension, metadata.version);
    fs.writeFileSync(filePath, JSON.stringify(versionData, null, 2), 'utf-8');

    // 更新缓存
    this.cache.set(this.getCacheKey(dimension, metadata.version), versionData);
  }

  /**
   * 更新版本元数据和指标 (不改变 content)
   */
  async updateVersion(
    dimension: ReviewDimension,
    version: string,
    updates: Partial<{
      metadata: Partial<PromptVersionMetadata>;
      metrics: any;
    }>,
  ): Promise<VersionedPrompt> {
    const existing = await this.getVersion(dimension, version);
    if (!existing) {
      throw new Error(`Version ${version} not found for dimension ${dimension}`);
    }

    const updated: VersionedPrompt = {
      ...existing,
      metadata: {
        ...existing.metadata,
        ...updates.metadata,
        updatedAt: new Date().toISOString(),
      },
      metrics: updates.metrics || existing.metrics,
    };

    const filePath = this.getVersionFilePath(dimension, version);
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');

    // 更新缓存
    const cacheKey = this.getCacheKey(dimension, version);
    this.cache.set(cacheKey, updated);

    return updated;
  }

  /**
   * 获取特定版本
   */
  async getVersion(dimension: ReviewDimension, version: string): Promise<VersionedPrompt | null> {
    const cacheKey = this.getCacheKey(dimension, version);
    const cached = this.cache.get(cacheKey);

    if (cached && !this.isCacheExpired()) {
      return cached;
    }

    const filePath = this.getVersionFilePath(dimension, version);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const versionData = JSON.parse(content) as VersionedPrompt;
    this.cache.set(cacheKey, versionData);

    return versionData;
  }

  /**
   * 获取最新版本
   */
  async getLatestVersion(dimension: ReviewDimension): Promise<VersionedPrompt | null> {
    const versions = await this.getAllVersions(dimension);
    if (versions.length === 0) {
      return null;
    }

    // 按版本号排序 (semver)
    versions.sort((a, b) => this.compareSemver(b.metadata.version, a.metadata.version));
    return versions[0];
  }

  /**
   * 获取生产稳定版本 (tagged with 'production' 且未弃用)
   */
  async getStableVersion(dimension: ReviewDimension): Promise<VersionedPrompt | null> {
    const versions = await this.getAllVersions(dimension);
    const candidates = versions.filter(
      (v) => v.metadata.tags.includes('production') && !v.metadata.deprecated,
    );

    if (candidates.length === 0) {
      return null;
    }

    // 返回最新的生产稳定版本
    candidates.sort((a, b) => this.compareSemver(b.metadata.version, a.metadata.version));
    return candidates[0];
  }

  /**
   * 获取某维度的所有版本
   */
  async getAllVersions(dimension: ReviewDimension): Promise<VersionedPrompt[]> {
    const dimPath = this.getDimensionPath(dimension);
    if (!fs.existsSync(dimPath)) {
      return [];
    }

    const files = fs.readdirSync(dimPath);
    const versions: VersionedPrompt[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(dimPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const versionData = JSON.parse(content) as VersionedPrompt;
        versions.push(versionData);
      }
    }

    return versions;
  }

  /**
   * 查询版本 (支持过滤和分页)
   */
  async queryVersions(
    dimension: ReviewDimension,
    options: VersionQueryOptions = {},
  ): Promise<VersionQueryResult> {
    let versions = await this.getAllVersions(dimension);

    // 过滤已弃用
    if (!options.includeDeprecated) {
      versions = versions.filter((v) => !v.metadata.deprecated);
    }

    // 过滤标签
    if (options.tags && options.tags.length > 0) {
      versions = versions.filter((v) =>
        options.tags!.every((tag) => v.metadata.tags.includes(tag)),
      );
    }

    // 过滤版本号 (支持通配符)
    if (options.version) {
      versions = versions.filter((v) => this.matchVersion(v.metadata.version, options.version!));
    }

    // 排序
    const sortBy = options.sortBy || 'createdAt';
    versions.sort((a, b) => {
      let compareA: any, compareB: any;

      switch (sortBy) {
        case 'version':
          compareA = a.metadata.version;
          compareB = b.metadata.version;
          break;
        case 'performance':
          compareA = a.metrics?.performanceGrade || 'F';
          compareB = b.metrics?.performanceGrade || 'F';
          break;
        case 'createdAt':
        default:
          compareA = a.metadata.createdAt;
          compareB = b.metadata.createdAt;
      }

      const cmp = compareA < compareB ? -1 : compareA > compareB ? 1 : 0;
      return options.sortOrder === 'asc' ? cmp : -cmp;
    });

    // 分页
    const limit = options.limit || 20;
    const offset = options.offset || 0;
    const page = Math.floor(offset / limit) + 1;

    const paginated = versions.slice(offset, offset + limit);

    const items: PromptVersionListItem[] = paginated.map((v) => ({
      dimension: v.dimension,
      version: v.metadata.version,
      description: v.metadata.description,
      createdAt: v.metadata.createdAt,
      author: v.metadata.author,
      tags: v.metadata.tags,
      isReleased: v.metadata.isReleased,
      deprecated: v.metadata.deprecated,
      metrics: v.metrics,
    }));

    return {
      versions: items,
      total: versions.length,
      pagination: {
        limit,
        offset,
        page,
        pageSize: paginated.length,
      },
    };
  }

  /**
   * 删除版本
   */
  async deleteVersion(dimension: ReviewDimension, version: string): Promise<void> {
    const filePath = this.getVersionFilePath(dimension, version);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Version ${version} not found for dimension ${dimension}`);
    }

    fs.unlinkSync(filePath);
    const cacheKey = this.getCacheKey(dimension, version);
    this.cache.delete(cacheKey);
  }

  /**
   * 检查版本是否存在
   */
  async versionExists(dimension: ReviewDimension, version: string): Promise<boolean> {
    const filePath = this.getVersionFilePath(dimension, version);
    return fs.existsSync(filePath);
  }

  /**
   * 对比两个版本
   */
  async compareVersions(
    dimension: ReviewDimension,
    versionA: string,
    versionB: string,
  ): Promise<VersionComparison> {
    const promptA = await this.getVersion(dimension, versionA);
    const promptB = await this.getVersion(dimension, versionB);

    if (!promptA || !promptB) {
      throw new Error(`One or both versions not found`);
    }

    const contentA = promptA.content;
    const contentB = promptB.content;

    const charDiff = Math.abs(contentA.length - contentB.length);
    const linesA = contentA.split('\n').length;
    const linesB = contentB.split('\n').length;
    const lineDiff = Math.abs(linesA - linesB);

    // 简单的差异统计
    const changes = this.calculateChanges(contentA, contentB);

    let improvement: number | undefined;
    if (promptA.metrics && promptB.metrics) {
      const gradeA = this.gradeToNumber(promptA.metrics.performanceGrade);
      const gradeB = this.gradeToNumber(promptB.metrics.performanceGrade);
      if (gradeA > 0 && gradeB > 0) {
        improvement = ((gradeB - gradeA) / gradeA) * 100;
      }
    }

    return {
      versionA,
      versionB,
      charDiff,
      lineDiff,
      changes,
      performanceComparison: {
        versionAMetrics: promptA.metrics,
        versionBMetrics: promptB.metrics,
        improvement,
      },
    };
  }

  /**
   * 回滚到指定版本
   */
  async rollbackVersion(request: VersionRollbackRequest): Promise<VersionRollbackResult> {
    const { dimension, targetVersion, reason, rolledBackBy, backupCurrent } = request;

    const targetPrompt = await this.getVersion(dimension, targetVersion);
    if (!targetPrompt) {
      throw new Error(`Target version ${targetVersion} not found`);
    }

    let backupVersion: string | undefined;

    // 备份当前版本
    if (backupCurrent) {
      const currentPrompt = await this.getLatestVersion(dimension);
      if (currentPrompt) {
        const backupVersionNum = `${currentPrompt.metadata.version}-backup-${Date.now()}`;
        const backupData: VersionedPrompt = {
          ...currentPrompt,
          metadata: {
            ...currentPrompt.metadata,
            version: backupVersionNum,
            tags: [...currentPrompt.metadata.tags, 'backup'],
            description: `Backup before rollback to ${targetVersion}. Reason: ${reason}`,
          },
        };
        await this.saveVersion(backupData);
        backupVersion = backupVersionNum;
      }
    }

    // 标记目标版本为当前活跃版本
    const newVersion = await this.updateVersion(dimension, targetVersion, {
      metadata: {
        tags: [...new Set([...targetPrompt.metadata.tags, 'current', 'production'])],
        description: `${targetPrompt.metadata.description}\n\nRolled back: ${reason}`,
      },
    });

    return {
      success: true,
      previousVersion: targetVersion,
      newVersion: newVersion.metadata.version,
      backupVersion,
      completedAt: new Date().toISOString(),
      message: `Rollback to ${targetVersion} completed successfully`,
    };
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheTimestamp = 0;
  }

  /**
   * 获取所有维度的版本注册表
   */
  async getRegistry(): Promise<VersionedPromptRegistry> {
    const registry: VersionedPromptRegistry = {};
    const dimensions = Object.values(ReviewDimension);

    for (const dimension of dimensions) {
      const versions = await this.getAllVersions(dimension);
      registry[dimension] = versions;
    }

    return registry;
  }

  // ========== 辅助方法 ==========

  private getCacheKey(dimension: ReviewDimension, version: string): string {
    return `${dimension}:${version}`;
  }

  private isCacheExpired(): boolean {
    return Date.now() - this.cacheTimestamp > this.cacheTTL;
  }

  /**
   * 验证 semver 格式
   */
  private validateSemver(version: string): void {
    const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

    if (!semverRegex.test(version)) {
      throw new Error(`Invalid semver version: ${version}`);
    }
  }

  /**
   * 比较两个 semver 版本号 (返回 -1, 0, 1)
   */
  private compareSemver(a: string, b: string): number {
    const parseVersion = (v: string) => {
      const match = v.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (!match) return { major: 0, minor: 0, patch: 0 };
      return { major: parseInt(match[1]), minor: parseInt(match[2]), patch: parseInt(match[3]) };
    };

    const vA = parseVersion(a);
    const vB = parseVersion(b);

    if (vA.major !== vB.major) return vA.major - vB.major;
    if (vA.minor !== vB.minor) return vA.minor - vB.minor;
    if (vA.patch !== vB.patch) return vA.patch - vB.patch;

    return 0;
  }

  /**
   * 匹配版本号 (支持通配符)
   */
  private matchVersion(version: string, pattern: string): boolean {
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
    return regex.test(version);
  }

  /**
   * 计算内容差异
   */
  private calculateChanges(
    contentA: string,
    contentB: string,
  ): { additions: number; deletions: number; modifications: number } {
    const linesA = contentA.split('\n');
    const linesB = contentB.split('\n');

    let additions = 0;
    let deletions = 0;
    let modifications = 0;

    // 简化的差异计算
    const maxLen = Math.max(linesA.length, linesB.length);
    for (let i = 0; i < maxLen; i++) {
      const lineA = linesA[i] || '';
      const lineB = linesB[i] || '';

      if (lineA !== lineB) {
        if (!lineA) additions++;
        else if (!lineB) deletions++;
        else modifications++;
      }
    }

    return { additions, deletions, modifications };
  }

  /**
   * 等级转数字
   */
  private gradeToNumber(grade?: string): number {
    const gradeMap: { [key: string]: number } = { A: 5, B: 4, C: 3, D: 2, F: 1 };
    return gradeMap[grade || 'F'] || 1;
  }
}
