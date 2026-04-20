/**
 * VersioningAgentRunner 集成测试
 *
 * 覆盖：
 * - 版本选择集成
 * - 系统 prompt 动态替换
 * - AgentResult 中的版本信息追踪
 * - A/B 测试观察记录
 * - 错误处理和降级
 */

import * as fs from 'fs';
import { VersioningAgentRunner } from '../../src/agents/versioning-agent-runner';
import { PromptVersioningManager } from '../../src/agents/prompts/versioning/prompt-versioning-manager';
import { ABTestManager } from '../../src/agents/prompts/versioning/ab-test-manager';
import { VersionedPrompt } from '../../src/agents/prompts/versioning/types';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../../src/types';
import { PromptVersioningConfig, VersionSelectionStrategy } from '../../src/agents/prompts/versioning/types';

const testStorageRoot = '.test-versioning-runner';
const testConfigFile = '.test-versioning-config.json';

/**
 * 测试用的 VersioningAgentRunner 实现
 */
class TestVersioningAgentRunner extends VersioningAgentRunner {
  protected async performReview(files: string[], context: string): Promise<ReviewIssue[]> {
    // 简单的测试实现
    const selectedPrompt = await this.selectSystemPrompt('test-user-123');
    return [
      {
        file: files[0],
        line: 1,
        severity: 'medium',
        dimension: ReviewDimension.Logic,
        description: 'Test issue',
        suggestion: 'Fix this',
        confidence: 0.8,
      },
    ];
  }
}

describe('VersioningAgentRunner', () => {
  let versioningManager: PromptVersioningManager;
  let abTestManager: ABTestManager;
  let runner: TestVersioningAgentRunner;

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

    // 创建测试版本
    const promptV1: VersionedPrompt = {
      dimension: ReviewDimension.Logic,
      metadata: {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        description: 'V1 - Initial',
        tags: ['production'],
        isReleased: true,
        deprecated: false,
      },
      content: 'Logic rules v1.0.0',
    };

    const promptV2: VersionedPrompt = {
      dimension: ReviewDimension.Logic,
      metadata: {
        version: '1.1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        description: 'V2 - Improved',
        tags: ['production'],
        isReleased: true,
        deprecated: false,
      },
      content: 'Logic rules v1.1.0 with improvements',
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

  describe('selectSystemPrompt - 选择系统 prompt', () => {
    it('无版本控制时应返回默认 prompt', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test',
        dimension: ReviewDimension.Logic,
        systemPrompt: 'Default logic prompt',
      };

      runner = new TestVersioningAgentRunner(config, 300000, undefined, versioningManager, abTestManager);
      const prompt = await runner['selectSystemPrompt']();

      expect(prompt).toBe('Default logic prompt');
      expect(runner.getSelectedVersion()).toBe('default');
    });

    it('启用最新版本策略时应返回最新版本内容', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test',
        dimension: ReviewDimension.Logic,
        systemPrompt: 'Default logic prompt',
        promptVersioning: {
          enabled: true,
          strategy: VersionSelectionStrategy.LATEST,
        },
      };

      runner = new TestVersioningAgentRunner(config, 300000, undefined, versioningManager, abTestManager);
      const prompt = await runner['selectSystemPrompt']();

      expect(prompt).toBe('Logic rules v1.1.0 with improvements');
      expect(runner.getSelectedVersion()).toBe('1.1.0');
    });

    it('启用稳定版本策略时应返回生产稳定版本', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test',
        dimension: ReviewDimension.Logic,
        systemPrompt: 'Default logic prompt',
        promptVersioning: {
          enabled: true,
          strategy: VersionSelectionStrategy.STABLE,
        },
      };

      runner = new TestVersioningAgentRunner(config, 300000, undefined, versioningManager, abTestManager);
      const prompt = await runner['selectSystemPrompt']();

      // 应返回最新的生产版本（都标记为 production，所以选最新的）
      expect(prompt).toMatch(/Logic rules v1\./);
      expect(runner.getSelectedVersion()).toBe('1.1.0');
    });

    it('启用显式版本策略时应返回指定版本', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test',
        dimension: ReviewDimension.Logic,
        systemPrompt: 'Default logic prompt',
        promptVersioning: {
          enabled: true,
          strategy: VersionSelectionStrategy.EXPLICIT,
          explicitVersion: '1.0.0',
        },
      };

      runner = new TestVersioningAgentRunner(config, 300000, undefined, versioningManager, abTestManager);
      const prompt = await runner['selectSystemPrompt']();

      expect(prompt).toBe('Logic rules v1.0.0');
      expect(runner.getSelectedVersion()).toBe('1.0.0');
    });
  });

  describe('selectSystemPrompt with A/B testing', () => {
    beforeEach(async () => {
      // 创建 A/B 测试
      await abTestManager.createTest({
        testId: 'ab-test-001',
        dimension: ReviewDimension.Logic,
        versionA: '1.0.0',
        versionB: '1.1.0',
        trafficSplitPercentage: 50,
        startedAt: new Date().toISOString(),
        status: 'active',
      });
    });

    it('A/B 测试时应根据用户 ID 分配版本', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test',
        dimension: ReviewDimension.Logic,
        systemPrompt: 'Default logic prompt',
        promptVersioning: {
          enabled: true,
          strategy: VersionSelectionStrategy.AB_TEST,
          abTestConfig: {
            versionA: '1.0.0',
            versionB: '1.1.0',
            trafficSplitPercentage: 50,
          },
        },
      };

      runner = new TestVersioningAgentRunner(config, 300000, undefined, versioningManager, abTestManager);
      const prompt = await runner['selectSystemPrompt']('test-user-a');

      expect(prompt).toMatch(/Logic rules v1\./);
      expect(runner.getSelectedVersionInfo()?.isABTestVariant).toBe(true);
      expect(runner.getSelectedVersionInfo()?.abTestGroup).toBeDefined();
    });

    it('A/B 测试中同一用户应获得一致的分配', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test',
        dimension: ReviewDimension.Logic,
        systemPrompt: 'Default logic prompt',
        promptVersioning: {
          enabled: true,
          strategy: VersionSelectionStrategy.AB_TEST,
          abTestConfig: {
            versionA: '1.0.0',
            versionB: '1.1.0',
            trafficSplitPercentage: 50,
          },
        },
      };

      runner = new TestVersioningAgentRunner(config, 300000, undefined, versioningManager, abTestManager);

      const prompt1 = await runner['selectSystemPrompt']('consistent-user');
      runner = new TestVersioningAgentRunner(config, 300000, undefined, versioningManager, abTestManager);
      const prompt2 = await runner['selectSystemPrompt']('consistent-user');

      expect(prompt1).toBe(prompt2);
    });
  });

  describe('review 方法版本追踪', () => {
    it('review 结果应包含版本信息', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test',
        dimension: ReviewDimension.Logic,
        systemPrompt: 'Default logic prompt',
        promptVersioning: {
          enabled: true,
          strategy: VersionSelectionStrategy.LATEST,
        },
      };

      runner = new TestVersioningAgentRunner(config, 300000, undefined, versioningManager, abTestManager);
      const result = await runner.review(['test.ts'], 'console.log("test");', 'user-123');

      expect(result.promptVersionInfo).toBeDefined();
      expect(result.promptVersionInfo?.version).toBe('1.1.0');
      expect(result.promptVersionInfo?.strategy).toBe(VersionSelectionStrategy.LATEST);
    });

    it('无版本控制时 review 结果应不包含版本信息', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test',
        dimension: ReviewDimension.Logic,
        systemPrompt: 'Default logic prompt',
      };

      runner = new TestVersioningAgentRunner(config, 300000, undefined, versioningManager, abTestManager);
      const result = await runner.review(['test.ts'], 'console.log("test");');

      expect(result.promptVersionInfo).toBeUndefined();
    });
  });

  describe('错误处理和降级', () => {
    it('无效的显式版本应降级到默认 prompt', async () => {
      // 抑制预期的 console.error 输出
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test',
        dimension: ReviewDimension.Logic,
        systemPrompt: 'Default logic prompt',
        promptVersioning: {
          enabled: true,
          strategy: VersionSelectionStrategy.EXPLICIT,
          explicitVersion: '999.0.0',
        },
      };

      runner = new TestVersioningAgentRunner(config, 300000, undefined, versioningManager, abTestManager);

      // 应抛出错误，但被捕获后返回默认 prompt
      const prompt = await runner['selectSystemPrompt']();
      expect(prompt).toBe('Default logic prompt');
      consoleSpy.mockRestore();
    });

    it('缺少维度信息时应使用默认 prompt', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test',
        systemPrompt: 'Default logic prompt',
        promptVersioning: {
          enabled: true,
          strategy: VersionSelectionStrategy.LATEST,
        },
      };

      runner = new TestVersioningAgentRunner(config, 300000, undefined, versioningManager, abTestManager);
      const prompt = await runner['selectSystemPrompt']();

      expect(prompt).toBe('Default logic prompt');
    });
  });

  describe('recordABTestObservation', () => {
    beforeEach(async () => {
      await abTestManager.createTest({
        testId: 'ab-test-001',
        dimension: ReviewDimension.Logic,
        versionA: '1.0.0',
        versionB: '1.1.0',
        trafficSplitPercentage: 50,
        startedAt: new Date().toISOString(),
        status: 'active',
      });
    });

    it('应成功记录 A/B 测试观察', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test',
        dimension: ReviewDimension.Logic,
        systemPrompt: 'Default logic prompt',
      };

      runner = new TestVersioningAgentRunner(config, 300000, undefined, versioningManager, abTestManager);

      // 应不抛出错误
      expect(() => {
        runner['recordABTestObservation']('ab-test-001', 'A', '1.0.0', 5, 'user-123');
      }).not.toThrow();
    });

    it('应处理无效的测试 ID', async () => {
      // 抑制预期的 console.error 输出
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test',
        dimension: ReviewDimension.Logic,
        systemPrompt: 'Default logic prompt',
      };

      runner = new TestVersioningAgentRunner(config, 300000, undefined, versioningManager, abTestManager);

      // 应不抛出错误，只是警告日志
      expect(() => {
        runner['recordABTestObservation']('nonexistent', 'A', '1.0.0', 5, 'user-123');
      }).not.toThrow();
      consoleSpy.mockRestore();
    });
  });
});
