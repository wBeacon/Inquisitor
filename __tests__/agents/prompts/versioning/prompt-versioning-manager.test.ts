/**
 * PromptVersioningManager 单元测试
 *
 * 覆盖：
 * - 版本保存和检索
 * - 版本 CRUD 操作
 * - 版本查询和过滤
 * - 版本对比
 * - 版本回滚
 * - 缓存机制
 */

import * as fs from 'fs';
import * as path from 'path';
import { PromptVersioningManager } from '../../../../src/agents/prompts/versioning/prompt-versioning-manager';
import {
  VersionedPrompt,
  PromptVersionMetadata,
  VersionSelectionStrategy,
} from '../../../../src/agents/prompts/versioning/types';
import { ReviewDimension } from '../../../../src/types';

describe('PromptVersioningManager', () => {
  let manager: PromptVersioningManager;
  const testStorageRoot = '.test-prompt-versions';

  beforeEach(() => {
    // 清理测试目录
    if (fs.existsSync(testStorageRoot)) {
      fs.rmSync(testStorageRoot, { recursive: true, force: true });
    }
    manager = new PromptVersioningManager(testStorageRoot);
  });

  afterEach(() => {
    // 清理测试目录
    if (fs.existsSync(testStorageRoot)) {
      fs.rmSync(testStorageRoot, { recursive: true, force: true });
    }
  });

  describe('saveVersion - 保存版本', () => {
    it('应成功保存新版本', async () => {
      const versionedPrompt: VersionedPrompt = {
        dimension: ReviewDimension.Logic,
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: 'Initial logic prompt',
          tags: ['production'],
          isReleased: true,
          deprecated: false,
        },
        content: 'Logic prompt content v1.0.0',
      };

      await manager.saveVersion(versionedPrompt);

      // 验证文件存在
      const filePath = path.join(testStorageRoot, ReviewDimension.Logic, '1.0.0.json');
      expect(fs.existsSync(filePath)).toBe(true);

      // 验证文件内容
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content.metadata.version).toBe('1.0.0');
      expect(content.content).toBe('Logic prompt content v1.0.0');
    });

    it('应拒绝非法 semver 版本号', async () => {
      const versionedPrompt: VersionedPrompt = {
        dimension: ReviewDimension.Logic,
        metadata: {
          version: 'invalid-version',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: 'Invalid version',
          tags: [],
          isReleased: false,
          deprecated: false,
        },
        content: 'Content',
      };

      await expect(manager.saveVersion(versionedPrompt)).rejects.toThrow(
        'Invalid semver version',
      );
    });

    it('应拒绝保存已存在的版本', async () => {
      const prompt1: VersionedPrompt = {
        dimension: ReviewDimension.Logic,
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: 'First version',
          tags: [],
          isReleased: true,
          deprecated: false,
        },
        content: 'Content 1',
      };

      await manager.saveVersion(prompt1);

      // 尝试保存相同版本
      const prompt2: VersionedPrompt = {
        ...prompt1,
        content: 'Content 2',
      };

      await expect(manager.saveVersion(prompt2)).rejects.toThrow('already exists');
    });

    it('应支持 prerelease 和 build 元数据', async () => {
      const versions = ['1.0.0-alpha', '1.0.0-beta.1', '1.0.0-rc.1', '1.0.0+build.123'];

      for (const version of versions) {
        const prompt: VersionedPrompt = {
          dimension: ReviewDimension.Security,
          metadata: {
            version,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            description: `Version ${version}`,
            tags: [],
            isReleased: false,
            deprecated: false,
          },
          content: `Content for ${version}`,
        };

        await manager.saveVersion(prompt);
        const retrieved = await manager.getVersion(ReviewDimension.Security, version);
        expect(retrieved?.metadata.version).toBe(version);
      }
    });
  });

  describe('getVersion - 获取版本', () => {
    it('应返回存在的版本', async () => {
      const prompt: VersionedPrompt = {
        dimension: ReviewDimension.Performance,
        metadata: {
          version: '1.2.3',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: 'Performance prompt',
          tags: ['production'],
          isReleased: true,
          deprecated: false,
          author: 'test-author',
        },
        content: 'Performance rules...',
        metrics: { performanceGrade: 'A', usageCount: 100 },
      };

      await manager.saveVersion(prompt);
      const retrieved = await manager.getVersion(ReviewDimension.Performance, '1.2.3');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.metadata.version).toBe('1.2.3');
      expect(retrieved?.content).toBe('Performance rules...');
      expect(retrieved?.metrics?.performanceGrade).toBe('A');
    });

    it('应对不存在的版本返回 null', async () => {
      const result = await manager.getVersion(ReviewDimension.Logic, '999.0.0');
      expect(result).toBeNull();
    });

    it('应使用缓存减少文件 I/O', async () => {
      const prompt: VersionedPrompt = {
        dimension: ReviewDimension.Maintainability,
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: 'Maintainability prompt',
          tags: [],
          isReleased: true,
          deprecated: false,
        },
        content: 'Maintainability rules...',
      };

      await manager.saveVersion(prompt);

      // 第一次获取（从文件）
      const first = await manager.getVersion(ReviewDimension.Maintainability, '1.0.0');
      expect(first).not.toBeNull();

      // 第二次获取（应从缓存）
      const second = await manager.getVersion(ReviewDimension.Maintainability, '1.0.0');
      expect(second).not.toBeNull();
      expect(first?.content).toEqual(second?.content);
    });
  });

  describe('getLatestVersion - 获取最新版本', () => {
    it('应返回最新版本', async () => {
      const versions = ['1.0.0', '1.1.0', '2.0.0', '1.2.0'];

      for (const version of versions) {
        const prompt: VersionedPrompt = {
          dimension: ReviewDimension.Logic,
          metadata: {
            version,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            description: `Version ${version}`,
            tags: [],
            isReleased: true,
            deprecated: false,
          },
          content: `Content ${version}`,
        };
        await manager.saveVersion(prompt);
      }

      const latest = await manager.getLatestVersion(ReviewDimension.Logic);
      expect(latest?.metadata.version).toBe('2.0.0');
    });

    it('无版本时应返回 null', async () => {
      const result = await manager.getLatestVersion(ReviewDimension.EdgeCases);
      expect(result).toBeNull();
    });
  });

  describe('getStableVersion - 获取生产稳定版本', () => {
    it('应返回标记为 production 且未弃用的最新版本', async () => {
      const prompts: Array<{ version: string; tags: string[]; deprecated: boolean }> = [
        { version: '1.0.0', tags: ['production'], deprecated: false },
        { version: '1.1.0', tags: ['experimental'], deprecated: false },
        { version: '1.2.0', tags: ['production'], deprecated: false },
        { version: '2.0.0', tags: ['production'], deprecated: true },
      ];

      for (const { version, tags, deprecated } of prompts) {
        const prompt: VersionedPrompt = {
          dimension: ReviewDimension.Security,
          metadata: {
            version,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            description: `Version ${version}`,
            tags,
            isReleased: true,
            deprecated,
          },
          content: `Content ${version}`,
        };
        await manager.saveVersion(prompt);
      }

      const stable = await manager.getStableVersion(ReviewDimension.Security);
      expect(stable?.metadata.version).toBe('1.2.0');
      expect(stable?.metadata.tags).toContain('production');
      expect(stable?.metadata.deprecated).toBe(false);
    });

    it('无生产稳定版本时应返回 null', async () => {
      const prompt: VersionedPrompt = {
        dimension: ReviewDimension.Logic,
        metadata: {
          version: '1.0.0-beta',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: 'Beta version',
          tags: ['experimental'],
          isReleased: false,
          deprecated: false,
        },
        content: 'Content',
      };
      await manager.saveVersion(prompt);

      const stable = await manager.getStableVersion(ReviewDimension.Logic);
      expect(stable).toBeNull();
    });
  });

  describe('queryVersions - 查询版本', () => {
    beforeEach(async () => {
      // 创建多个版本用于查询
      const versions = [
        { v: '1.0.0', tags: ['production'], deprecated: false },
        { v: '1.1.0', tags: ['production'], deprecated: false },
        { v: '1.1.1', tags: ['production', 'bugfix'], deprecated: false },
        { v: '2.0.0-beta', tags: ['experimental'], deprecated: false },
        { v: '2.0.0', tags: [], deprecated: true },
      ];

      for (const { v, tags, deprecated } of versions) {
        const prompt: VersionedPrompt = {
          dimension: ReviewDimension.Logic,
          metadata: {
            version: v,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            description: `Version ${v}`,
            tags,
            isReleased: true,
            deprecated,
          },
          content: `Content ${v}`,
        };
        await manager.saveVersion(prompt);
      }
    });

    it('应支持版本号过滤 (通配符)', async () => {
      const result = await manager.queryVersions(ReviewDimension.Logic, {
        version: '1.1.*',
      });

      expect(result.versions.length).toBe(2);
      expect(result.versions.map((v) => v.version)).toEqual(
        expect.arrayContaining(['1.1.0', '1.1.1']),
      );
    });

    it('应支持标签过滤', async () => {
      const result = await manager.queryVersions(ReviewDimension.Logic, {
        tags: ['production'],
      });

      expect(result.versions.length).toBe(3);
      expect(result.versions.every((v) => v.tags.includes('production'))).toBe(true);
    });

    it('应排除已弃用的版本 (默认)', async () => {
      const result = await manager.queryVersions(ReviewDimension.Logic, {
        includeDeprecated: false,
      });

      expect(result.versions.every((v) => !v.deprecated)).toBe(true);
    });

    it('应支持分页', async () => {
      const result = await manager.queryVersions(ReviewDimension.Logic, {
        limit: 2,
        offset: 0,
      });

      expect(result.versions.length).toBe(2);
      expect(result.pagination.page).toBe(1);
      expect(result.total).toBe(4); // 不计已弃用
    });

    it('应支持排序 (按版本号)', async () => {
      const result = await manager.queryVersions(ReviewDimension.Logic, {
        sortBy: 'version',
        sortOrder: 'asc',
      });

      const versions = result.versions.map((v) => v.version);
      expect(versions[0]).toBe('1.0.0');
      expect(versions[versions.length - 1]).toBe('2.0.0-beta');
    });
  });

  describe('compareVersions - 对比版本', () => {
    it('应计算版本间的差异', async () => {
      const prompt1: VersionedPrompt = {
        dimension: ReviewDimension.Logic,
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: 'V1',
          tags: [],
          isReleased: true,
          deprecated: false,
        },
        content: 'Line 1\nLine 2\nLine 3',
      };

      const prompt2: VersionedPrompt = {
        dimension: ReviewDimension.Logic,
        metadata: {
          version: '1.1.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: 'V2',
          tags: [],
          isReleased: true,
          deprecated: false,
        },
        content: 'Line 1\nLine 2 Modified\nLine 3\nLine 4',
      };

      await manager.saveVersion(prompt1);
      await manager.saveVersion(prompt2);

      const comparison = await manager.compareVersions(
        ReviewDimension.Logic,
        '1.0.0',
        '1.1.0',
      );

      expect(comparison.versionA).toBe('1.0.0');
      expect(comparison.versionB).toBe('1.1.0');
      expect(comparison.charDiff).toBeGreaterThan(0);
      expect(comparison.changes.additions).toBeGreaterThan(0);
    });

    it('版本不存在时应抛出错误', async () => {
      await expect(
        manager.compareVersions(ReviewDimension.Logic, '999.0.0', '999.1.0'),
      ).rejects.toThrow('not found');
    });
  });

  describe('updateVersion - 更新版本', () => {
    it('应更新元数据和指标，保留内容', async () => {
      const original: VersionedPrompt = {
        dimension: ReviewDimension.Performance,
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: 'Original',
          tags: [],
          isReleased: true,
          deprecated: false,
        },
        content: 'Original content',
      };

      await manager.saveVersion(original);

      const updated = await manager.updateVersion(ReviewDimension.Performance, '1.0.0', {
        metadata: {
          description: 'Updated',
          tags: ['production'],
        },
        metrics: { performanceGrade: 'A', usageCount: 50 },
      });

      expect(updated.metadata.description).toBe('Updated');
      expect(updated.metadata.tags).toContain('production');
      expect(updated.content).toBe('Original content');
      expect(updated.metrics?.performanceGrade).toBe('A');
    });
  });

  describe('rollbackVersion - 版本回滚', () => {
    it('应成功回滚到指定版本', async () => {
      const v1: VersionedPrompt = {
        dimension: ReviewDimension.Logic,
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: 'V1',
          tags: ['production'],
          isReleased: true,
          deprecated: false,
        },
        content: 'Content v1',
      };

      const v2: VersionedPrompt = {
        dimension: ReviewDimension.Logic,
        metadata: {
          version: '1.1.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: 'V2 with bug',
          tags: ['production'],
          isReleased: true,
          deprecated: false,
        },
        content: 'Content v2 with bug',
      };

      await manager.saveVersion(v1);
      await manager.saveVersion(v2);

      const result = await manager.rollbackVersion({
        dimension: ReviewDimension.Logic,
        targetVersion: '1.0.0',
        reason: 'Bug in v1.1.0',
      });

      expect(result.success).toBe(true);
      expect(result.newVersion).toBe('1.0.0');
    });

    it('目标版本不存在时应抛出错误', async () => {
      await expect(
        manager.rollbackVersion({
          dimension: ReviewDimension.Logic,
          targetVersion: '999.0.0',
          reason: 'Test',
        }),
      ).rejects.toThrow('not found');
    });
  });

  describe('deleteVersion - 删除版本', () => {
    it('应成功删除版本', async () => {
      const prompt: VersionedPrompt = {
        dimension: ReviewDimension.Security,
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: 'To be deleted',
          tags: [],
          isReleased: true,
          deprecated: false,
        },
        content: 'Content',
      };

      await manager.saveVersion(prompt);
      await manager.deleteVersion(ReviewDimension.Security, '1.0.0');

      const retrieved = await manager.getVersion(ReviewDimension.Security, '1.0.0');
      expect(retrieved).toBeNull();
    });

    it('删除不存在的版本应抛出错误', async () => {
      await expect(
        manager.deleteVersion(ReviewDimension.Logic, '999.0.0'),
      ).rejects.toThrow('not found');
    });
  });

  describe('clearCache - 清除缓存', () => {
    it('应清除所有缓存', async () => {
      const prompt: VersionedPrompt = {
        dimension: ReviewDimension.EdgeCases,
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: 'Test',
          tags: [],
          isReleased: true,
          deprecated: false,
        },
        content: 'Content',
      };

      await manager.saveVersion(prompt);
      manager.clearCache();

      // 获取应该从文件读取
      const retrieved = await manager.getVersion(ReviewDimension.EdgeCases, '1.0.0');
      expect(retrieved).not.toBeNull();
    });
  });

  describe('getRegistry - 获取完整注册表', () => {
    it('应返回所有维度的版本注册表', async () => {
      const dimensions = [ReviewDimension.Logic, ReviewDimension.Security];

      for (const dimension of dimensions) {
        const prompt: VersionedPrompt = {
          dimension,
          metadata: {
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            description: 'Test',
            tags: [],
            isReleased: true,
            deprecated: false,
          },
          content: 'Content',
        };
        await manager.saveVersion(prompt);
      }

      const registry = await manager.getRegistry();

      expect(Object.keys(registry).length).toBeGreaterThan(0);
      expect(registry[ReviewDimension.Logic]).toBeDefined();
      expect(registry[ReviewDimension.Security]).toBeDefined();
    });
  });
});
