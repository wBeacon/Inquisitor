/**
 * VersionSelector - 版本选择器测试
 *
 * 覆盖 5 种策略: latest / stable / ab-test / weighted / explicit
 */

import * as fs from 'fs';
import { VersionSelector } from '../../../../src/agents/prompts/versioning/version-selector';
import { PromptVersioningManager } from '../../../../src/agents/prompts/versioning/prompt-versioning-manager';
import { ABTestManager } from '../../../../src/agents/prompts/versioning/ab-test-manager';
import {
  VersionSelectionStrategy,
  VersionedPrompt,
  PromptVersioningConfig,
} from '../../../../src/agents/prompts/versioning/types';
import { ReviewDimension } from '../../../../src/types';

const testStorageRoot = '.test-version-selector';
const testConfigFile = '.test-version-selector-config.json';

describe('VersionSelector - 版本选择器', () => {
  let versioningManager: PromptVersioningManager;
  let abTestManager: ABTestManager;
  let selector: VersionSelector;

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
    selector = new VersionSelector(versioningManager, abTestManager);

    // 创建测试版本 v1.0.0（稳定版）
    const promptV1: VersionedPrompt = {
      dimension: ReviewDimension.Logic,
      metadata: {
        version: '1.0.0',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        description: 'V1 - 初始稳定版',
        tags: ['stable', 'production'],
        isReleased: true,
        deprecated: false,
      },
      content: '逻辑审查规则 v1.0.0',
    };

    // 创建测试版本 v2.0.0（最新版）
    const promptV2: VersionedPrompt = {
      dimension: ReviewDimension.Logic,
      metadata: {
        version: '2.0.0',
        createdAt: '2024-06-01T00:00:00Z',
        updatedAt: '2024-06-01T00:00:00Z',
        description: 'V2 - 改进版',
        tags: ['production'],
        isReleased: true,
        deprecated: false,
      },
      content: '逻辑审查规则 v2.0.0 改进版本',
    };

    await versioningManager.saveVersion(promptV1);
    await versioningManager.saveVersion(promptV2);
  });

  afterEach(() => {
    if (fs.existsSync(testStorageRoot)) {
      fs.rmSync(testStorageRoot, { recursive: true, force: true });
    }
    if (fs.existsSync(testConfigFile)) {
      fs.unlinkSync(testConfigFile);
    }
  });

  describe('latest 策略', () => {
    it('应返回最新版本', async () => {
      const config: PromptVersioningConfig = {
        enabled: true,
        strategy: VersionSelectionStrategy.LATEST,
      };

      const result = await selector.selectVersion(ReviewDimension.Logic, config);

      expect(result.selectedVersion).toBe('2.0.0');
      expect(result.strategy).toBe(VersionSelectionStrategy.LATEST);
    });

    it('无版本时应返回 default', async () => {
      const config: PromptVersioningConfig = {
        enabled: true,
        strategy: VersionSelectionStrategy.LATEST,
      };

      const result = await selector.selectVersion(ReviewDimension.Security, config);

      expect(result.selectedVersion).toBe('default');
    });
  });

  describe('stable 策略', () => {
    it('应返回带 stable 标签的版本', async () => {
      const config: PromptVersioningConfig = {
        enabled: true,
        strategy: VersionSelectionStrategy.STABLE,
      };

      const result = await selector.selectVersion(ReviewDimension.Logic, config);

      // 应返回有 stable 标签的版本，或者如果没有就返回最新的
      expect(result.strategy).toBe(VersionSelectionStrategy.STABLE);
      expect(result.selectedVersion).toBeDefined();
      expect(result.selectedVersion).not.toBe('default');
    });
  });

  describe('ab-test 策略', () => {
    beforeEach(async () => {
      // 创建 A/B 测试
      await abTestManager.createTest({
        testId: 'selector-ab-test',
        dimension: ReviewDimension.Logic,
        versionA: '1.0.0',
        versionB: '2.0.0',
        trafficSplitPercentage: 50,
        startedAt: new Date().toISOString(),
        status: 'active',
      });
    });

    it('应根据用户 ID 确定性分配版本', async () => {
      const config: PromptVersioningConfig = {
        enabled: true,
        strategy: VersionSelectionStrategy.AB_TEST,
        abTestConfig: {
          versionA: '1.0.0',
          versionB: '2.0.0',
          trafficSplitPercentage: 50,
        },
      };

      const result = await selector.selectVersion(ReviewDimension.Logic, config, 'user-abc');

      expect(result.strategy).toBe(VersionSelectionStrategy.AB_TEST);
      expect(result.isABTestVariant).toBe(true);
      expect(['1.0.0', '2.0.0']).toContain(result.selectedVersion);
      expect(['A', 'B']).toContain(result.abTestGroup);
    });

    it('同一用户多次调用应返回相同分组', async () => {
      const config: PromptVersioningConfig = {
        enabled: true,
        strategy: VersionSelectionStrategy.AB_TEST,
        abTestConfig: {
          versionA: '1.0.0',
          versionB: '2.0.0',
          trafficSplitPercentage: 50,
        },
      };

      const result1 = await selector.selectVersion(ReviewDimension.Logic, config, 'user-same');
      const result2 = await selector.selectVersion(ReviewDimension.Logic, config, 'user-same');

      expect(result1.selectedVersion).toBe(result2.selectedVersion);
      expect(result1.abTestGroup).toBe(result2.abTestGroup);
    });

    it('无 abTestConfig 时应返回 default', async () => {
      const config: PromptVersioningConfig = {
        enabled: true,
        strategy: VersionSelectionStrategy.AB_TEST,
      };

      const result = await selector.selectVersion(ReviewDimension.Logic, config, 'user-abc');

      expect(result.selectedVersion).toBe('default');
    });
  });

  describe('weighted 策略', () => {
    it('应根据权重选择版本', async () => {
      const config: PromptVersioningConfig = {
        enabled: true,
        strategy: VersionSelectionStrategy.WEIGHTED,
        weights: {
          '1.0.0': 0.3,
          '2.0.0': 0.7,
        },
      };

      const result = await selector.selectVersion(ReviewDimension.Logic, config, 'user-weighted');

      expect(result.strategy).toBe(VersionSelectionStrategy.WEIGHTED);
      expect(['1.0.0', '2.0.0']).toContain(result.selectedVersion);
      expect(result.reason).toContain('weight');
    });

    it('同一用户应获得确定性结果', async () => {
      const config: PromptVersioningConfig = {
        enabled: true,
        strategy: VersionSelectionStrategy.WEIGHTED,
        weights: {
          '1.0.0': 0.5,
          '2.0.0': 0.5,
        },
      };

      const result1 = await selector.selectVersion(ReviewDimension.Logic, config, 'user-deterministic');
      const result2 = await selector.selectVersion(ReviewDimension.Logic, config, 'user-deterministic');

      expect(result1.selectedVersion).toBe(result2.selectedVersion);
    });

    it('无权重配置时应返回 default', async () => {
      const config: PromptVersioningConfig = {
        enabled: true,
        strategy: VersionSelectionStrategy.WEIGHTED,
      };

      const result = await selector.selectVersion(ReviewDimension.Logic, config);

      expect(result.selectedVersion).toBe('default');
    });
  });

  describe('explicit 策略', () => {
    it('应返回显式指定的版本', async () => {
      const config: PromptVersioningConfig = {
        enabled: true,
        strategy: VersionSelectionStrategy.EXPLICIT,
        explicitVersion: '1.0.0',
      };

      const result = await selector.selectVersion(ReviewDimension.Logic, config);

      expect(result.selectedVersion).toBe('1.0.0');
      expect(result.strategy).toBe(VersionSelectionStrategy.EXPLICIT);
    });

    it('无 explicitVersion 时应返回 default', async () => {
      const config: PromptVersioningConfig = {
        enabled: true,
        strategy: VersionSelectionStrategy.EXPLICIT,
      };

      const result = await selector.selectVersion(ReviewDimension.Logic, config);

      expect(result.selectedVersion).toBe('default');
    });

    it('指定不存在的版本时应抛出错误', async () => {
      const config: PromptVersioningConfig = {
        enabled: true,
        strategy: VersionSelectionStrategy.EXPLICIT,
        explicitVersion: '99.0.0',
      };

      await expect(
        selector.selectVersion(ReviewDimension.Logic, config),
      ).rejects.toThrow('not found');
    });
  });

  describe('versioning 禁用', () => {
    it('enabled=false 时应返回 default', async () => {
      const config: PromptVersioningConfig = {
        enabled: false,
        strategy: VersionSelectionStrategy.LATEST,
      };

      const result = await selector.selectVersion(ReviewDimension.Logic, config);

      expect(result.selectedVersion).toBe('default');
    });
  });

  describe('getVersionContent - 获取版本内容', () => {
    it('应返回指定版本的内容', async () => {
      const content = await selector.getVersionContent(ReviewDimension.Logic, '1.0.0');

      expect(content).toBe('逻辑审查规则 v1.0.0');
    });

    it('default 版本应返回 null', async () => {
      const content = await selector.getVersionContent(ReviewDimension.Logic, 'default');

      expect(content).toBeNull();
    });
  });
});
