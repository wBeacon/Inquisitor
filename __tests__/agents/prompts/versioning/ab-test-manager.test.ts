/**
 * ABTestManager 单元测试
 *
 * 覆盖：
 * - 测试创建和管理
 * - 确定性版本分配
 * - 观察记录和统计
 * - 性能报告生成
 * - 版本提升
 */

import * as fs from 'fs';
import * as path from 'path';
import { ABTestManager } from '../../../../src/agents/prompts/versioning/ab-test-manager';
import { PromptVersioningManager } from '../../../../src/agents/prompts/versioning/prompt-versioning-manager';
import { VersionedPrompt } from '../../../../src/agents/prompts/versioning/types';
import { ReviewDimension } from '../../../../src/types';

describe('ABTestManager', () => {
  let versioningManager: PromptVersioningManager;
  let abTestManager: ABTestManager;
  const testStorageRoot = '.test-ab-versions';
  const testConfigFile = '.test-ab-config.json';

  beforeEach(async () => {
    // 清理测试目录
    if (fs.existsSync(testStorageRoot)) {
      fs.rmSync(testStorageRoot, { recursive: true, force: true });
    }
    if (fs.existsSync(testConfigFile)) {
      fs.unlinkSync(testConfigFile);
    }

    versioningManager = new PromptVersioningManager(testStorageRoot);
    abTestManager = new ABTestManager(versioningManager, testConfigFile);

    // 创建两个版本用于 A/B 测试
    const promptA: VersionedPrompt = {
      dimension: ReviewDimension.Logic,
      metadata: {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        description: 'Version A',
        tags: [],
        isReleased: true,
        deprecated: false,
      },
      content: 'Logic rules version 1.0.0',
    };

    const promptB: VersionedPrompt = {
      dimension: ReviewDimension.Logic,
      metadata: {
        version: '1.1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        description: 'Version B with improvements',
        tags: [],
        isReleased: true,
        deprecated: false,
      },
      content: 'Logic rules version 1.1.0 with improvements',
    };

    await versioningManager.saveVersion(promptA);
    await versioningManager.saveVersion(promptB);
  });

  afterEach(() => {
    if (fs.existsSync(testStorageRoot)) {
      fs.rmSync(testStorageRoot, { recursive: true, force: true });
    }
    if (fs.existsSync(testConfigFile)) {
      fs.unlinkSync(testConfigFile);
    }
  });

  describe('createTest - 创建 A/B 测试', () => {
    it('应成功创建 A/B 测试', async () => {
      await abTestManager.createTest({
        testId: 'test-001',
        dimension: ReviewDimension.Logic,
        versionA: '1.0.0',
        versionB: '1.1.0',
        trafficSplitPercentage: 50,
        startedAt: new Date().toISOString(),
        status: 'active',
        description: 'Test between v1.0.0 and v1.1.0',
      });

      const config = abTestManager.getTestConfig('test-001');
      expect(config).not.toBeNull();
      expect(config?.versionA).toBe('1.0.0');
      expect(config?.versionB).toBe('1.1.0');
      expect(config?.trafficSplitPercentage).toBe(50);
    });

    it('应拒绝重复的测试 ID', async () => {
      await abTestManager.createTest({
        testId: 'test-001',
        dimension: ReviewDimension.Logic,
        versionA: '1.0.0',
        versionB: '1.1.0',
        trafficSplitPercentage: 50,
        startedAt: new Date().toISOString(),
        status: 'active',
      });

      await expect(
        abTestManager.createTest({
          testId: 'test-001',
          dimension: ReviewDimension.Logic,
          versionA: '1.0.0',
          versionB: '1.1.0',
          trafficSplitPercentage: 50,
          startedAt: new Date().toISOString(),
          status: 'active',
        }),
      ).rejects.toThrow('already exists');
    });

    it('应拒绝无效的流量分配百分比', async () => {
      await expect(
        abTestManager.createTest({
          testId: 'test-001',
          dimension: ReviewDimension.Logic,
          versionA: '1.0.0',
          versionB: '1.1.0',
          trafficSplitPercentage: 150,
          startedAt: new Date().toISOString(),
          status: 'active',
        }),
      ).rejects.toThrow('between 0 and 100');
    });

    it('应拒绝不存在的版本', async () => {
      await expect(
        abTestManager.createTest({
          testId: 'test-001',
          dimension: ReviewDimension.Logic,
          versionA: '1.0.0',
          versionB: '999.0.0',
          trafficSplitPercentage: 50,
          startedAt: new Date().toISOString(),
          status: 'active',
        }),
      ).rejects.toThrow('not found');
    });
  });

  describe('assignVersion - 确定性版本分配', () => {
    beforeEach(async () => {
      await abTestManager.createTest({
        testId: 'test-001',
        dimension: ReviewDimension.Logic,
        versionA: '1.0.0',
        versionB: '1.1.0',
        trafficSplitPercentage: 50,
        startedAt: new Date().toISOString(),
        status: 'active',
      });
    });

    it('应为用户确定性分配版本', () => {
      const assignment1 = abTestManager.assignVersion('test-001', 'user-123');
      const assignment2 = abTestManager.assignVersion('test-001', 'user-123');

      expect(assignment1.version).toBe(assignment2.version);
      expect(assignment1.group).toBe(assignment2.group);
    });

    it('应根据流量分配百分比分配用户', () => {
      const assignments = [];
      for (let i = 0; i < 100; i++) {
        const assignment = abTestManager.assignVersion('test-001', `user-${i}`);
        assignments.push(assignment);
      }

      const groupACount = assignments.filter((a) => a.group === 'A').length;
      const groupBCount = assignments.filter((a) => a.group === 'B').length;

      // 50/50 分割，允许一些偏差
      expect(Math.abs(groupACount - 50)).toBeLessThan(10);
      expect(Math.abs(groupBCount - 50)).toBeLessThan(10);
    });

    it('应支持非均匀流量分配', async () => {
      await abTestManager.createTest({
        testId: 'test-002',
        dimension: ReviewDimension.Logic,
        versionA: '1.0.0',
        versionB: '1.1.0',
        trafficSplitPercentage: 80,
        startedAt: new Date().toISOString(),
        status: 'active',
      });

      const assignments = [];
      for (let i = 0; i < 100; i++) {
        const assignment = abTestManager.assignVersion('test-002', `user-${i}`);
        assignments.push(assignment);
      }

      const groupACount = assignments.filter((a) => a.group === 'A').length;
      // 80% 分配到 A，允许偏差
      expect(Math.abs(groupACount - 80)).toBeLessThan(10);
    });
  });

  describe('recordObservation - 记录观察', () => {
    beforeEach(async () => {
      await abTestManager.createTest({
        testId: 'test-001',
        dimension: ReviewDimension.Logic,
        versionA: '1.0.0',
        versionB: '1.1.0',
        trafficSplitPercentage: 50,
        startedAt: new Date().toISOString(),
        status: 'active',
      });
    });

    it('应成功记录观察', () => {
      abTestManager.recordObservation({
        testId: 'test-001',
        group: 'A',
        version: '1.0.0',
        agentId: 'logic-agent',
        userId: 'user-001',
        timestamp: new Date().toISOString(),
        issueCount: 5,
        averageConfidence: 0.85,
        executionTimeMs: 1500,
        tokenUsage: { input: 2000, output: 1000, total: 3000 },
      });

      // 应不抛出错误
    });

    it('应拒绝不存在的测试的观察', () => {
      expect(() => {
        abTestManager.recordObservation({
          testId: 'nonexistent',
          group: 'A',
          version: '1.0.0',
          agentId: 'logic-agent',
          userId: 'user-001',
          timestamp: new Date().toISOString(),
          issueCount: 5,
          averageConfidence: 0.85,
          executionTimeMs: 1500,
          tokenUsage: { input: 2000, output: 1000, total: 3000 },
        });
      }).toThrow('not found');
    });

    it('应拒绝非活跃测试的观察', async () => {
      await abTestManager.updateTestStatus('test-001', 'paused');

      expect(() => {
        abTestManager.recordObservation({
          testId: 'test-001',
          group: 'A',
          version: '1.0.0',
          agentId: 'logic-agent',
          userId: 'user-001',
          timestamp: new Date().toISOString(),
          issueCount: 5,
          averageConfidence: 0.85,
          executionTimeMs: 1500,
          tokenUsage: { input: 2000, output: 1000, total: 3000 },
        });
      }).toThrow('not active');
    });
  });

  describe('getStatistics - 获取测试统计', () => {
    beforeEach(async () => {
      await abTestManager.createTest({
        testId: 'test-001',
        dimension: ReviewDimension.Logic,
        versionA: '1.0.0',
        versionB: '1.1.0',
        trafficSplitPercentage: 50,
        startedAt: new Date().toISOString(),
        status: 'active',
      });

      // 添加观察数据
      for (let i = 0; i < 10; i++) {
        abTestManager.recordObservation({
          testId: 'test-001',
          group: 'A',
          version: '1.0.0',
          agentId: 'logic-agent',
          userId: `user-a-${i}`,
          timestamp: new Date().toISOString(),
          issueCount: 5,
          averageConfidence: 0.80,
          executionTimeMs: 1500,
          tokenUsage: { input: 2000, output: 1000, total: 3000 },
        });

        abTestManager.recordObservation({
          testId: 'test-001',
          group: 'B',
          version: '1.1.0',
          agentId: 'logic-agent',
          userId: `user-b-${i}`,
          timestamp: new Date().toISOString(),
          issueCount: 4,
          averageConfidence: 0.85,
          executionTimeMs: 1200,
          tokenUsage: { input: 1800, output: 900, total: 2700 },
        });
      }
    });

    it('应计算正确的统计数据', () => {
      const stats = abTestManager.getStatistics('test-001');

      expect(stats.testId).toBe('test-001');
      expect(stats.groupA.observationCount).toBe(10);
      expect(stats.groupB.observationCount).toBe(10);
      expect(stats.groupA.averageIssueCount).toBe(5);
      expect(stats.groupB.averageIssueCount).toBe(4);
      expect(stats.groupA.averageConfidence).toBeCloseTo(0.8, 1);
      expect(stats.groupB.averageConfidence).toBeCloseTo(0.85, 1);
    });

    it('应确定获胜者', () => {
      const stats = abTestManager.getStatistics('test-001');
      // B 版本更好 (问题更少，置信度更高，更快)
      expect(stats.comparison.winner).toBe('B');
    });

    it('应计算显著性', () => {
      const stats = abTestManager.getStatistics('test-001');
      expect(stats.comparison.significance).toBeGreaterThan(0);
      expect(stats.comparison.significance).toBeLessThanOrEqual(1);
    });
  });

  describe('generatePerformanceReport - 生成性能报告', () => {
    beforeEach(async () => {
      await abTestManager.createTest({
        testId: 'test-001',
        dimension: ReviewDimension.Logic,
        versionA: '1.0.0',
        versionB: '1.1.0',
        trafficSplitPercentage: 50,
        startedAt: new Date().toISOString(),
        status: 'active',
      });

      // 添加观察数据
      for (let i = 0; i < 20; i++) {
        abTestManager.recordObservation({
          testId: 'test-001',
          group: i < 10 ? 'A' : 'B',
          version: i < 10 ? '1.0.0' : '1.1.0',
          agentId: 'logic-agent',
          userId: `user-${i}`,
          timestamp: new Date().toISOString(),
          issueCount: i < 10 ? 5 : 3,
          averageConfidence: i < 10 ? 0.75 : 0.88,
          executionTimeMs: i < 10 ? 1600 : 1100,
          tokenUsage: { input: 2000, output: 1000, total: 3000 },
        });
      }
    });

    it('应生成完整的性能报告', async () => {
      const report = await abTestManager.generatePerformanceReport('test-001');

      expect(report.versionA).toBe('1.0.0');
      expect(report.versionB).toBe('1.1.0');
      expect(report.improvements).toBeDefined();
      expect(report.recommendation).toBeDefined();
      expect(report.reasoning).toBeDefined();
    });

    it('报告应包含改进指标', async () => {
      const report = await abTestManager.generatePerformanceReport('test-001');

      expect(report.improvements.accuracyImprovement).toBeDefined();
      expect(report.improvements.confidenceImprovement).toBeGreaterThan(0);
      expect(report.improvements.speedImprovement).toBeGreaterThan(0);
    });
  });

  describe('updateTestStatus - 更新测试状态', () => {
    beforeEach(async () => {
      await abTestManager.createTest({
        testId: 'test-001',
        dimension: ReviewDimension.Logic,
        versionA: '1.0.0',
        versionB: '1.1.0',
        trafficSplitPercentage: 50,
        startedAt: new Date().toISOString(),
        status: 'active',
      });
    });

    it('应更新测试状态', async () => {
      await abTestManager.updateTestStatus('test-001', 'paused');
      const config = abTestManager.getTestConfig('test-001');
      expect(config?.status).toBe('paused');
    });

    it('完成测试时应设置 endedAt', async () => {
      await abTestManager.updateTestStatus('test-001', 'completed');
      const config = abTestManager.getTestConfig('test-001');
      expect(config?.status).toBe('completed');
      expect(config?.endedAt).toBeDefined();
    });
  });

  describe('getActiveTests - 获取活跃测试', () => {
    beforeEach(async () => {
      await abTestManager.createTest({
        testId: 'test-001',
        dimension: ReviewDimension.Logic,
        versionA: '1.0.0',
        versionB: '1.1.0',
        trafficSplitPercentage: 50,
        startedAt: new Date().toISOString(),
        status: 'active',
      });

      await abTestManager.createTest({
        testId: 'test-002',
        dimension: ReviewDimension.Logic,
        versionA: '1.0.0',
        versionB: '1.1.0',
        trafficSplitPercentage: 50,
        startedAt: new Date().toISOString(),
        status: 'completed',
      });
    });

    it('应只返回活跃的测试', () => {
      const activeTests = abTestManager.getActiveTests();
      expect(activeTests.length).toBe(1);
      expect(activeTests[0].testId).toBe('test-001');
    });

    it('应支持按维度过滤', () => {
      const activeTests = abTestManager.getActiveTests(ReviewDimension.Logic);
      expect(activeTests.length).toBe(1);
    });
  });
});
