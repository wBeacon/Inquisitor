/**
 * PromptArchive 测试
 *
 * 覆盖：
 * - 快照存储和检索
 * - 查询和过滤功能
 * - 性能聚合统计
 * - 版本对比分析
 * - 过期数据清理
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  PromptArchive,
  PromptSnapshot,
  SnapshotQueryOptions,
  PerformanceAggregation,
} from '../../../../src/agents/prompts/versioning/prompt-archive';
import { ReviewDimension } from '../../../../src/types';

const testArchiveRoot = '.test-prompt-archive';

describe('PromptArchive', () => {
  let archive: PromptArchive;

  beforeEach(async () => {
    // 清理测试目录
    if (fs.existsSync(testArchiveRoot)) {
      fs.rmSync(testArchiveRoot, { recursive: true, force: true });
    }

    archive = new PromptArchive(testArchiveRoot);
  });

  afterEach(() => {
    if (fs.existsSync(testArchiveRoot)) {
      fs.rmSync(testArchiveRoot, { recursive: true, force: true });
    }
  });

  describe('recordSnapshot - 快照存储', () => {
    it('应成功存储快照', async () => {
      const snapshot = await archive.recordSnapshot({
        timestamp: new Date().toISOString(),
        dimension: ReviewDimension.Logic,
        promptVersion: '1.0.0',
        systemPromptHash: 'hash1',
        userMessageHash: 'hash2',
        metrics: {
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 1000,
          issueCount: 3,
          averageConfidence: 0.85,
          maxSeverity: 'warning',
        },
        success: true,
      });

      expect(snapshot.id).toBeDefined();
      expect(snapshot.dimension).toBe(ReviewDimension.Logic);
      expect(snapshot.promptVersion).toBe('1.0.0');
      expect(snapshot.metrics.issueCount).toBe(3);
    });

    it('应在文件系统中创建目录结构', async () => {
      const timestamp = '2026-04-17T10:30:00.000Z';
      await archive.recordSnapshot({
        timestamp,
        dimension: ReviewDimension.Logic,
        promptVersion: '1.0.0',
        systemPromptHash: 'hash1',
        userMessageHash: 'hash2',
        metrics: {
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 1000,
          issueCount: 1,
        },
        success: true,
      });

      // 验证目录结构
      const expectedDir = path.join(testArchiveRoot, ReviewDimension.Logic, '2026-04-17');
      expect(fs.existsSync(expectedDir)).toBe(true);

      // 验证文件存在
      const files = fs.readdirSync(expectedDir);
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^snapshot-.*\.json$/);
    });

    it('应支持 A/B 测试元数据', async () => {
      const snapshot = await archive.recordSnapshot({
        timestamp: new Date().toISOString(),
        dimension: ReviewDimension.Logic,
        promptVersion: '1.1.0',
        systemPromptHash: 'hash1',
        userMessageHash: 'hash2',
        abTestId: 'ab-test-001',
        abTestGroup: 'B',
        metrics: {
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 1000,
          issueCount: 2,
        },
        success: true,
      });

      expect(snapshot.abTestId).toBe('ab-test-001');
      expect(snapshot.abTestGroup).toBe('B');
    });
  });

  describe('getSnapshot - 快照检索', () => {
    it('应检索已存储的快照', async () => {
      const recorded = await archive.recordSnapshot({
        timestamp: new Date().toISOString(),
        dimension: ReviewDimension.Logic,
        promptVersion: '1.0.0',
        systemPromptHash: 'hash1',
        userMessageHash: 'hash2',
        metrics: {
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 1000,
          issueCount: 1,
        },
        success: true,
      });

      const retrieved = await archive.getSnapshot(recorded.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(recorded.id);
      expect(retrieved!.promptVersion).toBe('1.0.0');
    });

    it('快照不存在时应返回 null', async () => {
      const retrieved = await archive.getSnapshot('nonexistent-id');
      expect(retrieved).toBeNull();
    });

    it('应使用缓存以提高性能', async () => {
      const recorded = await archive.recordSnapshot({
        timestamp: new Date().toISOString(),
        dimension: ReviewDimension.Logic,
        promptVersion: '1.0.0',
        systemPromptHash: 'hash1',
        userMessageHash: 'hash2',
        metrics: {
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 1000,
          issueCount: 1,
        },
        success: true,
      });

      // 第一次检索
      const first = await archive.getSnapshot(recorded.id);
      expect(first).not.toBeNull();

      // 第二次检索应从缓存获取
      const second = await archive.getSnapshot(recorded.id);
      expect(second).not.toBeNull();
      expect(second!.id).toBe(first!.id);
    });
  });

  describe('querySnapshots - 快照查询', () => {
    beforeEach(async () => {
      // 创建多个快照用于查询测试
      const baseDate = new Date('2026-04-17T00:00:00Z');

      for (let i = 0; i < 5; i++) {
        const timestamp = new Date(baseDate.getTime() + i * 3600000).toISOString();
        await archive.recordSnapshot({
          timestamp,
          dimension: ReviewDimension.Logic,
          promptVersion: i < 3 ? '1.0.0' : '1.1.0',
          systemPromptHash: `hash-${i}`,
          userMessageHash: `user-${i}`,
          abTestId: i >= 3 ? 'ab-test-001' : undefined,
          abTestGroup: i >= 3 ? 'A' : undefined,
          metrics: {
            inputTokens: 100 + i * 10,
            outputTokens: 50 + i * 5,
            durationMs: 1000 + i * 100,
            issueCount: i + 1,
            averageConfidence: 0.8 + i * 0.02,
          },
          success: true,
        });
      }
    });

    it('应按维度查询', async () => {
      const result = await archive.querySnapshots({
        dimension: ReviewDimension.Logic,
      });

      expect(result.snapshots.length).toBe(5);
      expect(result.total).toBe(5);
    });

    it('应按日期范围查询', async () => {
      const result = await archive.querySnapshots({
        dimension: ReviewDimension.Logic,
        startDate: '2026-04-17',
        endDate: '2026-04-17',
      });

      expect(result.total).toBe(5);
    });

    it('应按 Prompt 版本查询', async () => {
      const result = await archive.querySnapshots({
        dimension: ReviewDimension.Logic,
        promptVersion: '1.0.0',
      });

      expect(result.snapshots.length).toBe(3);
      result.snapshots.forEach(s => {
        expect(s.promptVersion).toBe('1.0.0');
      });
    });

    it('应按 A/B 测试 ID 查询', async () => {
      const result = await archive.querySnapshots({
        dimension: ReviewDimension.Logic,
        abTestId: 'ab-test-001',
      });

      expect(result.snapshots.length).toBe(2);
      result.snapshots.forEach(s => {
        expect(s.abTestId).toBe('ab-test-001');
      });
    });

    it('应支持分页', async () => {
      const page1 = await archive.querySnapshots({
        dimension: ReviewDimension.Logic,
        pageSize: 2,
        page: 1,
      });

      expect(page1.snapshots.length).toBe(2);
      expect(page1.pagination.page).toBe(1);
      expect(page1.pagination.totalPages).toBe(3);

      const page2 = await archive.querySnapshots({
        dimension: ReviewDimension.Logic,
        pageSize: 2,
        page: 2,
      });

      expect(page2.snapshots.length).toBe(2);
      expect(page2.pagination.page).toBe(2);
    });

    it('应按 issueCount 排序', async () => {
      const result = await archive.querySnapshots({
        dimension: ReviewDimension.Logic,
        sortBy: 'issueCount',
        sortOrder: 'asc',
      });

      for (let i = 1; i < result.snapshots.length; i++) {
        expect(result.snapshots[i].metrics.issueCount).toBeGreaterThanOrEqual(
          result.snapshots[i - 1].metrics.issueCount,
        );
      }
    });

    it('应默认按时间戳降序排序', async () => {
      const result = await archive.querySnapshots({
        dimension: ReviewDimension.Logic,
      });

      // 验证结果按时间戳排序 (最新在前)
      expect(result.snapshots.length).toBe(5);
      
      // 获取时间戳并检查排序
      const timestamps = result.snapshots.map(s => new Date(s.timestamp).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        // 允许相等 (timestamp可能相同)
        expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
      }
    });
  });

  describe('calculatePerformanceAggregation - 性能统计', () => {
    beforeEach(async () => {
      // 创建多个快照用于聚合测试
      const baseDate = new Date('2026-04-17T00:00:00Z');

      const versions = ['1.0.0', '1.0.0', '1.0.0', '1.1.0', '1.1.0'];
      const issueCounts = [1, 2, 3, 2, 4];
      const durations = [1000, 1200, 1100, 900, 1300];
      const confidences = [0.85, 0.80, 0.90, 0.88, 0.92];

      for (let i = 0; i < 5; i++) {
        const timestamp = new Date(baseDate.getTime() + i * 3600000).toISOString();
        await archive.recordSnapshot({
          timestamp,
          dimension: ReviewDimension.Logic,
          promptVersion: versions[i],
          systemPromptHash: `hash-${i}`,
          userMessageHash: `user-${i}`,
          metrics: {
            inputTokens: 100,
            outputTokens: 50,
            durationMs: durations[i],
            issueCount: issueCounts[i],
            averageConfidence: confidences[i],
          },
          success: true,
        });
      }
    });

    it('应计算所有快照的聚合统计', async () => {
      const agg = await archive.calculatePerformanceAggregation(ReviewDimension.Logic);

      expect(agg.sampleCount).toBe(5);
      expect(agg.avgIssueCount).toBe(2.4); // (1+2+3+2+4)/5
      expect(agg.avgDurationMs).toBeCloseTo(1100, 0); // (1000+1200+1100+900+1300)/5
      expect(agg.successRate).toBe(1.0);
    });

    it('应计算特定版本的聚合统计', async () => {
      const agg = await archive.calculatePerformanceAggregation(ReviewDimension.Logic, {
        promptVersion: '1.0.0',
      });

      expect(agg.sampleCount).toBe(3);
      expect(agg.avgIssueCount).toBe(2); // (1+2+3)/3
      expect(agg.promptVersion).toBe('1.0.0');
    });

    it('应计算中位数执行耗时', async () => {
      const agg = await archive.calculatePerformanceAggregation(ReviewDimension.Logic);

      // 排序: [900, 1000, 1100, 1200, 1300] -> 中位数 = 1100
      expect(agg.medianDurationMs).toBe(1100);
    });

    it('应计算平均置信度', async () => {
      const agg = await archive.calculatePerformanceAggregation(ReviewDimension.Logic);

      const expectedAvg = (0.85 + 0.80 + 0.90 + 0.88 + 0.92) / 5; // 0.87
      expect(agg.avgConfidence).toBeCloseTo(expectedAvg, 2);
    });
  });

  describe('compareVersionPerformance - 版本对比', () => {
    beforeEach(async () => {
      const baseDate = new Date('2026-04-17T00:00:00Z');

      // 版本 1.0.0 的数据
      for (let i = 0; i < 3; i++) {
        await archive.recordSnapshot({
          timestamp: new Date(baseDate.getTime() + i * 3600000).toISOString(),
          dimension: ReviewDimension.Logic,
          promptVersion: '1.0.0',
          systemPromptHash: `hash-v1-${i}`,
          userMessageHash: `user-v1-${i}`,
          metrics: {
            inputTokens: 100,
            outputTokens: 50,
            durationMs: 1000,
            issueCount: 3,
            averageConfidence: 0.80,
          },
          success: true,
        });
      }

      // 版本 1.1.0 的数据
      for (let i = 0; i < 3; i++) {
        await archive.recordSnapshot({
          timestamp: new Date(baseDate.getTime() + (i + 3) * 3600000).toISOString(),
          dimension: ReviewDimension.Logic,
          promptVersion: '1.1.0',
          systemPromptHash: `hash-v2-${i}`,
          userMessageHash: `user-v2-${i}`,
          metrics: {
            inputTokens: 100,
            outputTokens: 50,
            durationMs: 900, // 更快
            issueCount: 4, // 发现更多问题
            averageConfidence: 0.85, // 更高的置信度
          },
          success: true,
        });
      }
    });

    it('应对比两个版本的性能', async () => {
      const comparison = await archive.compareVersionPerformance(
        ReviewDimension.Logic,
        '1.0.0',
        '1.1.0',
      );

      expect(comparison.versionA.sampleCount).toBe(3);
      expect(comparison.versionB.sampleCount).toBe(3);
      expect(comparison.improvement).toBeDefined();
    });

    it('应计算性能改进百分比', async () => {
      const comparison = await archive.compareVersionPerformance(
        ReviewDimension.Logic,
        '1.0.0',
        '1.1.0',
      );

      const imp = comparison.improvement!;
      // 1.0.0 平均 1000ms，1.1.0 平均 900ms
      // 改进 = (1000 - 900) / 1000 * 100 = 10%
      expect(imp.durationImprovement).toBeCloseTo(10, 0);

      // 问题数从 3 增加到 4
      expect(imp.issueCountChange).toBe(1);

      // 置信度从 0.80 增加到 0.85
      expect(imp.confidenceImprovement).toBeCloseTo(6.25, 1);
    });
  });

  describe('deleteSnapshot - 快照删除', () => {
    it('应成功删除快照', async () => {
      const recorded = await archive.recordSnapshot({
        timestamp: new Date().toISOString(),
        dimension: ReviewDimension.Logic,
        promptVersion: '1.0.0',
        systemPromptHash: 'hash1',
        userMessageHash: 'hash2',
        metrics: {
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 1000,
          issueCount: 1,
        },
        success: true,
      });

      const deleted = await archive.deleteSnapshot(recorded.id);
      expect(deleted).toBe(true);

      const retrieved = await archive.getSnapshot(recorded.id);
      expect(retrieved).toBeNull();
    });

    it('删除不存在的快照应返回 false', async () => {
      const deleted = await archive.deleteSnapshot('nonexistent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('cleanupOldSnapshots - 过期数据清理', () => {
    it('应删除超过指定天数的快照', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 2);

      // 创建旧快照
      await archive.recordSnapshot({
        timestamp: oldDate.toISOString(),
        dimension: ReviewDimension.Logic,
        promptVersion: '1.0.0',
        systemPromptHash: 'hash-old',
        userMessageHash: 'user-old',
        metrics: {
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 1000,
          issueCount: 1,
        },
        success: true,
      });

      // 创建最近的快照
      await archive.recordSnapshot({
        timestamp: recentDate.toISOString(),
        dimension: ReviewDimension.Logic,
        promptVersion: '1.0.0',
        systemPromptHash: 'hash-recent',
        userMessageHash: 'user-recent',
        metrics: {
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 1000,
          issueCount: 1,
        },
        success: true,
      });

      // 清理超过 5 天的数据
      const deleted = await archive.cleanupOldSnapshots(5);
      expect(deleted).toBeGreaterThan(0);

      // 验证旧快照所在目录被删除
      const oldDateStr = `${oldDate.getUTCFullYear()}-${String(oldDate.getUTCMonth() + 1).padStart(2, '0')}-${String(oldDate.getUTCDate()).padStart(2, '0')}`;
      const oldDirPath = path.join(testArchiveRoot, ReviewDimension.Logic, oldDateStr);
      expect(fs.existsSync(oldDirPath)).toBe(false);
    });
  });
});
