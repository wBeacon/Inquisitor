/**
 * config-loader.test.ts - 配置加载器测试
 *
 * 覆盖：
 * - 基本配置加载
 * - Prompt 版本控制配置
 * - A/B 测试配置
 * - 配置验证
 * - 配置合并
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, InquisitorConfig, ABTestConfig } from '../../src/skill/config-loader';
import { ReviewDimension } from '../../src/types';

const testDir = '.test-config-loader';

/**
 * 创建临时测试目录
 */
function setupTestDir(): string {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

/**
 * 清理测试目录
 */
function cleanupTestDir(): void {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

describe('config-loader', () => {
  beforeEach(() => {
    setupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  describe('loadConfig - 基本配置', () => {
    it('应返回默认配置当文件不存在', () => {
      const config = loadConfig(testDir);

      expect(config.ignore).toEqual([]);
      expect(config.rules).toEqual({});
      expect(config.severityThreshold).toBeUndefined();
    });

    it('应从文件加载配置', () => {
      const configFile = path.join(testDir, '.inquisitor.json');
      const configData = {
        ignore: ['**/*.test.ts', 'node_modules/**'],
        rules: { custom: true },
        severityThreshold: 'warning',
      };

      fs.writeFileSync(configFile, JSON.stringify(configData), 'utf-8');

      const config = loadConfig(testDir);

      expect(config.ignore).toEqual(['**/*.test.ts', 'node_modules/**']);
      expect(config.rules).toEqual({ custom: true });
      expect(config.severityThreshold).toBe('warning');
    });

    it('应优雅处理无效的 JSON', () => {
      const configFile = path.join(testDir, '.inquisitor.json');
      fs.writeFileSync(configFile, 'invalid json {', 'utf-8');

      const config = loadConfig(testDir);

      expect(config.ignore).toEqual([]);
      expect(config.rules).toEqual({});
    });

    it('应支持 provider 配置', () => {
      const configFile = path.join(testDir, '.inquisitor.json');
      const configData = {
        ignore: [],
        rules: {},
        provider: {
          type: 'openai',
          model: 'gpt-4',
          baseUrl: 'https://api.openai.com',
        },
      };

      fs.writeFileSync(configFile, JSON.stringify(configData), 'utf-8');

      const config = loadConfig(testDir);

      expect(config.provider?.type).toBe('openai');
      expect(config.provider?.model).toBe('gpt-4');
      expect(config.provider?.baseUrl).toBe('https://api.openai.com');
    });
  });

  describe('loadConfig - Prompt 版本控制配置', () => {
    it('应加载 prompt 版本控制配置', () => {
      const configFile = path.join(testDir, '.inquisitor.json');
      const configData = {
        ignore: [],
        rules: {},
        prompts: {
          enabled: true,
          versionMode: 'explicit',
          [ReviewDimension.Logic]: {
            version: '1.0.0',
          },
          [ReviewDimension.Security]: {
            version: '1.1.0-beta',
            enableABTest: true,
            abTestId: 'sec-test-001',
          },
        },
      };

      fs.writeFileSync(configFile, JSON.stringify(configData), 'utf-8');

      const config = loadConfig(testDir);

      expect(config.prompts).toBeDefined();
      expect(config.prompts?.enabled).toBe(true);
      expect(config.prompts?.versionMode).toBe('explicit');
      
      // Cast to proper type for type checking
      const logicConfig = config.prompts?.[ReviewDimension.Logic];
      if (logicConfig && typeof logicConfig === 'object') {
        expect((logicConfig as any).version).toBe('1.0.0');
      }
      
      const secConfig = config.prompts?.[ReviewDimension.Security];
      if (secConfig && typeof secConfig === 'object') {
        expect((secConfig as any).enableABTest).toBe(true);
      }
    });

    it('应支持不同的版本选择模式', () => {
      const modes = ['auto', 'explicit', 'latest', 'stable'];

      for (const mode of modes) {
        const configFile = path.join(testDir, '.inquisitor.json');
        const configData = {
          ignore: [],
          rules: {},
          prompts: {
            versionMode: mode,
          },
        };

        fs.writeFileSync(configFile, JSON.stringify(configData), 'utf-8');

        const config = loadConfig(testDir);
        expect(config.prompts?.versionMode).toBe(mode);
      }
    });
  });

  describe('loadConfig - A/B 测试配置', () => {
    it('应加载 A/B 测试配置', () => {
      const configFile = path.join(testDir, '.inquisitor.json');
      const configData = {
        ignore: [],
        rules: {},
        abTests: [
          {
            testId: 'test-001',
            dimension: ReviewDimension.Logic,
            versionA: '1.0.0',
            versionB: '1.1.0',
            trafficSplitPercentage: 50,
            startedAt: '2026-04-15T00:00:00Z',
            status: 'active' as const,
          },
          {
            testId: 'test-002',
            dimension: ReviewDimension.Security,
            versionA: '1.0.0',
            versionB: '1.1.0-beta',
            trafficSplitPercentage: 30,
            startedAt: '2026-04-16T00:00:00Z',
            endedAt: '2026-04-17T00:00:00Z',
            status: 'completed' as const,
          },
        ],
      };

      fs.writeFileSync(configFile, JSON.stringify(configData), 'utf-8');

      const config = loadConfig(testDir);

      expect(config.abTests).toBeDefined();
      expect(config.abTests?.length).toBe(2);
      expect(config.abTests?.[0].testId).toBe('test-001');
      expect(config.abTests?.[0].trafficSplitPercentage).toBe(50);
      expect(config.abTests?.[0].status).toBe('active');
      expect(config.abTests?.[1].status).toBe('completed');
      expect(config.abTests?.[1].endedAt).toBe('2026-04-17T00:00:00Z');
    });

    it('应验证 A/B 测试配置的必填字段', () => {
      const configFile = path.join(testDir, '.inquisitor.json');
      const configData = {
        ignore: [],
        rules: {},
        abTests: [
          {
            // 缺少 testId
            dimension: ReviewDimension.Logic,
            versionA: '1.0.0',
            versionB: '1.1.0',
            trafficSplitPercentage: 50,
            startedAt: '2026-04-15T00:00:00Z',
            status: 'active',
          },
        ],
      };

      fs.writeFileSync(configFile, JSON.stringify(configData), 'utf-8');

      const config = loadConfig(testDir);

      // 无效的配置应被过滤掉
      expect(config.abTests).toBeUndefined();
    });

    it('应验证流量分配百分比的范围', () => {
      const configFile = path.join(testDir, '.inquisitor.json');

      // 测试无效的百分比
      const invalidConfigs = [
        { trafficSplitPercentage: -1 },
        { trafficSplitPercentage: 101 },
        { trafficSplitPercentage: 'fifty' },
      ];

      for (const invalid of invalidConfigs) {
        const configData = {
          ignore: [],
          rules: {},
          abTests: [
            {
              testId: 'test-001',
              dimension: ReviewDimension.Logic,
              versionA: '1.0.0',
              versionB: '1.1.0',
              startedAt: '2026-04-15T00:00:00Z',
              status: 'active',
              ...invalid,
            },
          ],
        };

        fs.writeFileSync(configFile, JSON.stringify(configData), 'utf-8');

        const config = loadConfig(testDir);

        // 无效的配置应被过滤掉
        expect(config.abTests).toBeUndefined();
      }
    });

    it('应支持 A/B 测试的不同状态', () => {
      const statuses = ['active', 'paused', 'completed'];

      for (const status of statuses) {
        const configFile = path.join(testDir, '.inquisitor.json');
        const configData = {
          ignore: [],
          rules: {},
          abTests: [
            {
              testId: 'test-001',
              dimension: ReviewDimension.Logic,
              versionA: '1.0.0',
              versionB: '1.1.0',
              trafficSplitPercentage: 50,
              startedAt: '2026-04-15T00:00:00Z',
              status,
            },
          ],
        };

        fs.writeFileSync(configFile, JSON.stringify(configData), 'utf-8');

        const config = loadConfig(testDir);

        expect(config.abTests?.[0]?.status).toBe(status);
      }
    });

    it('应过滤无效的 A/B 测试配置但保留有效的', () => {
      const configFile = path.join(testDir, '.inquisitor.json');
      const configData = {
        ignore: [],
        rules: {},
        abTests: [
          {
            testId: 'test-001',
            dimension: ReviewDimension.Logic,
            versionA: '1.0.0',
            versionB: '1.1.0',
            trafficSplitPercentage: 50,
            startedAt: '2026-04-15T00:00:00Z',
            status: 'active',
          },
          {
            // 无效：缺少 dimension
            testId: 'test-002',
            versionA: '1.0.0',
            versionB: '1.1.0',
            trafficSplitPercentage: 50,
            startedAt: '2026-04-15T00:00:00Z',
            status: 'active',
          },
          {
            testId: 'test-003',
            dimension: ReviewDimension.Security,
            versionA: '2.0.0',
            versionB: '2.1.0',
            trafficSplitPercentage: 30,
            startedAt: '2026-04-16T00:00:00Z',
            status: 'paused',
          },
        ],
      };

      fs.writeFileSync(configFile, JSON.stringify(configData), 'utf-8');

      const config = loadConfig(testDir);

      expect(config.abTests?.length).toBe(2);
      expect(config.abTests?.[0].testId).toBe('test-001');
      expect(config.abTests?.[1].testId).toBe('test-003');
    });
  });

  describe('loadConfig - 配置合并', () => {
    it('应保留未指定的默认配置', () => {
      const configFile = path.join(testDir, '.inquisitor.json');
      const configData = {
        ignore: ['**/*.test.ts'],
        rules: { custom: true },
        // 其他字段不指定
      };

      fs.writeFileSync(configFile, JSON.stringify(configData), 'utf-8');

      const config = loadConfig(testDir);

      expect(config.ignore).toEqual(['**/*.test.ts']);
      expect(config.rules).toEqual({ custom: true });
      expect(config.severityThreshold).toBeUndefined();
      expect(config.dimensions).toBeUndefined();
    });

    it('应支持完整的配置文件', () => {
      const configFile = path.join(testDir, '.inquisitor.json');
      const configData = {
        ignore: ['node_modules/**', '**/*.test.ts'],
        rules: { rule1: true },
        severityThreshold: 'warning',
        dimensions: ['logic', 'security'],
        formats: ['json', 'html'],
        provider: {
          type: 'anthropic',
          model: 'claude-3-sonnet-20240229',
          baseUrl: 'https://api.anthropic.com',
        },
        projectContext: {
          enabled: true,
        },
        prompts: {
          enabled: true,
          versionMode: 'explicit',
          [ReviewDimension.Logic]: { version: '1.0.0' },
        },
        abTests: [
          {
            testId: 'test-001',
            dimension: ReviewDimension.Logic,
            versionA: '1.0.0',
            versionB: '1.1.0',
            trafficSplitPercentage: 50,
            startedAt: '2026-04-15T00:00:00Z',
            status: 'active',
          },
        ],
      };

      fs.writeFileSync(configFile, JSON.stringify(configData), 'utf-8');

      const config = loadConfig(testDir);

      expect(config.ignore).toEqual(['node_modules/**', '**/*.test.ts']);
      expect(config.rules).toEqual({ rule1: true });
      expect(config.severityThreshold).toBe('warning');
      expect(config.dimensions).toEqual(['logic', 'security']);
      expect(config.formats).toEqual(['json', 'html']);
      expect(config.provider?.type).toBe('anthropic');
      expect(config.projectContext?.enabled).toBe(true);
      expect(config.prompts?.enabled).toBe(true);
      expect(config.abTests?.length).toBe(1);
    });
  });
});
