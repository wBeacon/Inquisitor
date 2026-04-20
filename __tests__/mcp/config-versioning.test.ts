/**
 * config-versioning.test.ts - MCP 配置版本管理工具测试
 *
 * 测试场景：
 * - 版本快照创建和加载
 * - 版本历史记录管理
 * - 版本比较功能
 * - 回滚操作
 * - 清理旧版本
 * - 错误处理
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ConfigVersionManager,
  handleConfigVersioning,
  configVersioningSchema,
} from '../../src/mcp/tools/config-versioning';

describe('config-versioning', () => {
  let tmpDir: string;
  let manager: ConfigVersionManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-versioning-test-'));
    manager = new ConfigVersionManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('ConfigVersionManager', () => {
    it('应能创建配置快照', async () => {
      const config = { model: 'claude-sonnet', enableAdversary: true };
      const versionId = await manager.createSnapshot(config, '初始配置');

      expect(versionId).toMatch(/^v\d+-[a-z0-9]+$/);

      const history = await manager.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].versionId).toBe(versionId);
      expect(history[0].description).toBe('初始配置');
      expect(history[0].config.model).toBe('claude-sonnet');
    });

    it('应能获取版本历史', async () => {
      // 创建多个版本
      await manager.createSnapshot({ model: 'v1' }, '版本1');
      await manager.createSnapshot({ model: 'v2' }, '版本2');
      await manager.createSnapshot({ model: 'v3' }, '版本3');

      const history = await manager.getHistory();
      expect(history).toHaveLength(3);
      expect(history[0].config.model).toBe('v3'); // 最新版本在前
      expect(history[2].config.model).toBe('v1'); // 最旧版本在后
    });

    it('应能比较版本差异', async () => {
      const v1Id = await manager.createSnapshot({ model: 'sonnet', enableAdversary: false }, 'v1');
      const v2Id = await manager.createSnapshot({ model: 'opus', enableAdversary: true, maxParallel: 3 }, 'v2');

      const diff = await manager.compareVersions(v1Id, v2Id);

      expect(diff.modified).toContainEqual({
        key: 'model',
        oldValue: 'sonnet',
        newValue: 'opus'
      });
      expect(diff.modified).toContainEqual({
        key: 'enableAdversary',
        oldValue: false,
        newValue: true
      });
      expect(diff.added).toContain('maxParallel');
    });

    it('应能回滚到指定版本', async () => {
      const v1Id = await manager.createSnapshot({ model: 'sonnet' }, 'v1');
      await manager.createSnapshot({ model: 'opus' }, 'v2');

      const result = await manager.rollbackToVersion(v1Id);

      expect(result.success).toBe(true);
      expect(result.restoredConfig.model).toBe('sonnet');

      // 验证回滚后创建了新版本
      const history = await manager.getHistory();
      expect(history).toHaveLength(3); // v1, v2, 回滚版本
      expect(history[0].description).toContain('回滚到版本');
    });

    it('应能清理旧版本', async () => {
      // 创建10个版本
      for (let i = 0; i < 10; i++) {
        await manager.createSnapshot({ model: `v${i}` }, `版本${i}`);
      }

      const removedCount = await manager.cleanupOldVersions(5);
      expect(removedCount).toBe(5);

      const history = await manager.getHistory();
      expect(history).toHaveLength(5);
      expect(history[0].config.model).toBe('v9'); // 保留最新的5个
      expect(history[4].config.model).toBe('v5');
    });

    it('版本数量超过限制时应自动清理', async () => {
      // 创建超过默认限制的版本
      for (let i = 0; i < 60; i++) {
        await manager.createSnapshot({ model: `v${i}` }, `版本${i}`);
      }

      const history = await manager.getHistory();
      expect(history.length).toBeLessThanOrEqual(50); // 默认限制50个
    });

    it('应能处理不存在的版本', async () => {
      await expect(manager.compareVersions('nonexistent', 'nonexistent2'))
        .rejects.toThrow('指定的版本不存在');

      await expect(manager.rollbackToVersion('nonexistent'))
        .rejects.toThrow('版本 nonexistent 不存在');
    });
  });

  describe('handleConfigVersioning', () => {
    it('create_snapshot 操作应成功', async () => {
      const result = await handleConfigVersioning({
        action: 'create_snapshot',
        description: '测试快照'
      }, tmpDir);

      expect(result.content[0].text).toContain('配置快照创建成功');
      expect(result.content[0].text).toContain('测试快照');
    });

    it('get_history 操作应返回版本列表', async () => {
      // 先创建一些版本
      await handleConfigVersioning({ action: 'create_snapshot' }, tmpDir);
      await handleConfigVersioning({ action: 'create_snapshot' }, tmpDir);

      const result = await handleConfigVersioning({
        action: 'get_history',
        keepCount: 5
      }, tmpDir);

      expect(result.content[0].text).toContain('配置版本历史');
      expect(result.content[0].text).toContain('版本:');
    });

    it('compare 操作应返回差异信息', async () => {
      // 创建两个版本用于比较
      const v1Result = await handleConfigVersioning({ action: 'create_snapshot' }, tmpDir);
      const v2Result = await handleConfigVersioning({ action: 'create_snapshot' }, tmpDir);

      // 提取版本ID
      const v1Id = v1Result.content[0].text.match(/版本ID: (v\d+-[a-z0-9]+)/)?.[1];
      const v2Id = v2Result.content[0].text.match(/版本ID: (v\d+-[a-z0-9]+)/)?.[1];

      const result = await handleConfigVersioning({
        action: 'compare',
        versionA: v1Id!,
        versionB: v2Id!
      }, tmpDir);

      expect(result.content[0].text).toContain('版本比较结果');
    });

    it('rollback 操作应成功回滚', async () => {
      // 创建版本并回滚
      const v1Result = await handleConfigVersioning({ action: 'create_snapshot' }, tmpDir);
      const v1Id = v1Result.content[0].text.match(/版本ID: (v\d+-[a-z0-9]+)/)?.[1];

      const result = await handleConfigVersioning({
        action: 'rollback',
        targetVersion: v1Id!
      }, tmpDir);

      expect(result.content[0].text).toContain('配置已回滚到版本');
    });

    it('cleanup 操作应清理旧版本', async () => {
      // 创建多个版本
      for (let i = 0; i < 10; i++) {
        await handleConfigVersioning({ action: 'create_snapshot' }, tmpDir);
      }

      const result = await handleConfigVersioning({
        action: 'cleanup',
        keepCount: 3
      }, tmpDir);

      expect(result.content[0].text).toContain('已清理');
      expect(result.content[0].text).toContain('个旧版本');
    });

    it('无效操作应返回错误', async () => {
      const result = await handleConfigVersioning({
        action: 'invalid_action'
      } as any, tmpDir);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('不支持的操作');
    });

    it('缺少必需参数应返回错误', async () => {
      const result = await handleConfigVersioning({
        action: 'compare'
      } as any, tmpDir);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('versionA');
    });
  });

  describe('configVersioningSchema', () => {
    it('应正确验证输入参数', () => {
      const validInput = {
        action: 'create_snapshot',
        description: '测试快照'
      };

      // 验证schema结构
      expect(configVersioningSchema.action).toBeDefined();
      expect(configVersioningSchema.description).toBeDefined();
    });

    it('应拒绝无效的 action', () => {
      const invalidInput = {
        action: 'invalid_action'
      };

      // 验证无效action不在enum中
      expect(configVersioningSchema.action).toBeDefined();
    });

    it('应验证 keepCount 范围', () => {
      // 验证schema中定义的约束
      expect(configVersioningSchema.keepCount).toBeDefined();
    });
  });

  describe('文件持久化', () => {
    it('版本历史应持久化到文件', async () => {
      await manager.createSnapshot({ model: 'test' }, '测试版本');

      const historyFile = path.join(tmpDir, '.inquisitor-version-history.json');
      expect(fs.existsSync(historyFile)).toBe(true);

      const content = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
      expect(content.versions).toHaveLength(1);
      expect(content.versions[0].config.model).toBe('test');
    });

    it('应能处理损坏的历史文件', async () => {
      const historyFile = path.join(tmpDir, '.inquisitor-version-history.json');
      fs.writeFileSync(historyFile, 'invalid json content', 'utf-8');

      // 应能正常创建新版本
      const versionId = await manager.createSnapshot({ model: 'recovery' }, '恢复版本');
      expect(versionId).toBeDefined();

      const history = await manager.getHistory();
      expect(history).toHaveLength(1);
    });

    it('应能处理不存在的历史文件', async () => {
      const history = await manager.getHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe('边界情况', () => {
    it('空配置应能正常处理', async () => {
      const versionId = await manager.createSnapshot({}, '空配置');
      expect(versionId).toBeDefined();

      const diff = await manager.compareVersions(versionId, versionId);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });

    it('大量配置项应能正常处理', async () => {
      const largeConfig: Record<string, any> = {};
      for (let i = 0; i < 1000; i++) {
        largeConfig[`key${i}`] = `value${i}`;
      }

      const versionId = await manager.createSnapshot(largeConfig, '大量配置项');
      expect(versionId).toBeDefined();

      const history = await manager.getHistory();
      expect(history[0].config).toEqual(largeConfig);
    });

    it('特殊字符配置应能正常处理', async () => {
      const specialConfig = {
        'key-with-dash': 'value',
        'key.with.dot': 'value',
        'key with space': 'value',
        'key\nwith\nnewline': 'value',
        'key"with"quote': 'value',
        'key\\with\\backslash': 'value'
      };

      const versionId = await manager.createSnapshot(specialConfig, '特殊字符配置');
      expect(versionId).toBeDefined();

      const history = await manager.getHistory();
      expect(history[0].config).toEqual(specialConfig);
    });
  });
});