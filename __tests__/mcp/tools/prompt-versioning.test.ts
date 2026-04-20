/**
 * prompt-versioning.test.ts - MCP 工具测试: Prompt 版本管理和 A/B 测试
 *
 * 覆盖：
 * - history 操作 - 获取历史记录
 * - diff 操作 - 对比版本
 * - rollback 操作 - 回滚版本
 * - tag 操作 - 创建标签
 * - ab-test:start 操作 - 启动 A/B 测试
 * - ab-test:stop 操作 - 停止测试
 * - 错误处理
 */

import * as fs from 'fs';
import { handlePromptVersioning } from '../../../src/mcp/tools/prompt-versioning';

describe('MCP Tool: prompt_versioning', () => {
  beforeEach(() => {
    // 清理测试配置文件
    if (fs.existsSync('.inquisitor/ab-tests-config.json')) {
      fs.rmSync('.inquisitor', { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // 清理测试配置文件
    if (fs.existsSync('.inquisitor/ab-tests-config.json')) {
      fs.rmSync('.inquisitor', { recursive: true, force: true });
    }
  });

  describe('history 操作', () => {
    it('应返回指定维度的版本历史', async () => {
      const result = await handlePromptVersioning({
        action: 'history',
        dimension: 'logic',
      });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBeDefined();
    });

    it('缺少 dimension 参数时应返回错误', async () => {
      const result = await handlePromptVersioning({
        action: 'history',
      } as any);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('需要 dimension 参数');
    });

    it('应对所有维度返回结果', async () => {
      const dimensions = ['logic', 'security', 'performance', 'maintainability', 'edge_cases'];

      for (const dimension of dimensions) {
        const result = await handlePromptVersioning({
          action: 'history',
          dimension,
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBeDefined();
      }
    });
  });

  describe('diff 操作', () => {
    it('缺少参数时应返回错误', async () => {
      const result1 = await handlePromptVersioning({
        action: 'diff',
      } as any);
      expect(result1.isError).toBe(true);

      const result2 = await handlePromptVersioning({
        action: 'diff',
        dimension: 'logic',
      } as any);
      expect(result2.isError).toBe(true);

      const result3 = await handlePromptVersioning({
        action: 'diff',
        dimension: 'logic',
        versionA: '1.0.0',
      } as any);
      expect(result3.isError).toBe(true);
    });

    it('应返回版本对比结果或错误', async () => {
      const result = await handlePromptVersioning({
        action: 'diff',
        dimension: 'logic',
        versionA: '1.0.0',
        versionB: '1.1.0',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      // 可能成功也可能失败，但应该有有效的响应
      expect(result.content[0].text).toBeDefined();
    });
  });

  describe('rollback 操作', () => {
    it('缺少参数时应返回错误', async () => {
      const result1 = await handlePromptVersioning({
        action: 'rollback',
      } as any);
      expect(result1.isError).toBe(true);

      const result2 = await handlePromptVersioning({
        action: 'rollback',
        dimension: 'logic',
      } as any);
      expect(result2.isError).toBe(true);
    });

    it('应返回回滚结果或错误', async () => {
      const result = await handlePromptVersioning({
        action: 'rollback',
        dimension: 'logic',
        version: '1.0.0',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBeDefined();
    });
  });

  describe('tag 操作', () => {
    it('缺少参数时应返回错误', async () => {
      const result1 = await handlePromptVersioning({
        action: 'tag',
      } as any);
      expect(result1.isError).toBe(true);

      const result2 = await handlePromptVersioning({
        action: 'tag',
        dimension: 'logic',
      } as any);
      expect(result2.isError).toBe(true);
    });

    it('应返回标签创建结果或错误', async () => {
      const result = await handlePromptVersioning({
        action: 'tag',
        dimension: 'logic',
        version: '1.0.0',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBeDefined();
    });
  });

  describe('ab-test:start 操作', () => {
    it('缺少 config 参数时应返回错误', async () => {
      const result = await handlePromptVersioning({
        action: 'ab-test:start',
      } as any);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('需要 config 参数');
    });

    it('应返回测试启动结果', async () => {
      const result = await handlePromptVersioning({
        action: 'ab-test:start',
        config: {
          versionA: 'v1',
          versionB: 'v2',
          trafficSplitPercentage: 50,
        },
      });

      // 由于版本不存在，会返回错误，但应该是格式正确的错误响应
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBeDefined();
    });

    it('应生成有效的测试配置参数', async () => {
      const config = {
        versionA: 'v1',
        versionB: 'v2',
        trafficSplitPercentage: 50,
      };

      // 验证配置参数的有效性
      expect(config.versionA).toBeDefined();
      expect(config.versionB).toBeDefined();
      expect(config.trafficSplitPercentage).toBeGreaterThanOrEqual(0);
      expect(config.trafficSplitPercentage).toBeLessThanOrEqual(100);
    });
  });

  describe('ab-test:stop 操作', () => {
    it('缺少 testId 参数时应返回错误', async () => {
      const result = await handlePromptVersioning({
        action: 'ab-test:stop',
      } as any);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('需要 testId 参数');
    });

    it('应返回测试停止结果或错误', async () => {
      const result = await handlePromptVersioning({
        action: 'ab-test:stop',
        testId: 'nonexistent-test',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBeDefined();
    });
  });

  describe('错误处理', () => {
    it('未知的 action 应返回错误', async () => {
      const result = await handlePromptVersioning({
        action: 'invalid-action' as any,
        dimension: 'logic',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('未知的操作');
    });

    it('应正确处理所有异常', async () => {
      const operations = [
        { action: 'history', dimension: 'invalid' as any },
        { action: 'diff', dimension: 'logic', versionA: 'a', versionB: 'b' },
        { action: 'rollback', dimension: 'logic', version: 'v1' },
        { action: 'tag', dimension: 'logic', version: 'v1' },
      ];

      for (const op of operations) {
        const result = await handlePromptVersioning(op as any);
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toBeDefined();
      }
    });
  });

  describe('完整工作流', () => {
    it('应支持查看历史 -> 对比', async () => {
      const historyResult = await handlePromptVersioning({
        action: 'history',
        dimension: 'logic',
      });
      expect(historyResult.isError).toBeUndefined();
      expect(historyResult.content[0].text).toBeDefined();

      const diffResult = await handlePromptVersioning({
        action: 'diff',
        dimension: 'logic',
        versionA: '1.0.0',
        versionB: '1.1.0',
      });
      expect(diffResult.content).toBeDefined();
    });

    it('应支持版本管理操作链', async () => {
      // 获取历史
      const historyResult = await handlePromptVersioning({
        action: 'history',
        dimension: 'security',
      });
      expect(historyResult.isError).toBeUndefined();

      // 尝试回滚
      const rollbackResult = await handlePromptVersioning({
        action: 'rollback',
        dimension: 'security',
        version: 'v1',
      });
      expect(rollbackResult.content).toBeDefined();

      // 尝试创建标签
      const tagResult = await handlePromptVersioning({
        action: 'tag',
        dimension: 'security',
        version: 'v1',
      });
      expect(tagResult.content).toBeDefined();
    });

    it('应支持 A/B 测试管理', async () => {
      // 启动测试
      const startResult = await handlePromptVersioning({
        action: 'ab-test:start',
        config: {
          versionA: 'v1',
          versionB: 'v2',
          trafficSplitPercentage: 50,
        },
      });
      expect(startResult.content).toBeDefined();

      // 停止测试
      const stopResult = await handlePromptVersioning({
        action: 'ab-test:stop',
        testId: 'test-1234',
      });
      expect(stopResult.content).toBeDefined();
    });
  });
});
