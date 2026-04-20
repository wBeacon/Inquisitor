/**
 * config-persistence.test.ts - MCP 配置持久化模块测试
 *
 * 覆盖场景：
 * - 持久化写入和加载
 * - Server 启动时加载配置
 * - export / import 操作
 * - 异步非阻塞写入
 * - 优雅降级（文件不存在、非法 JSON）
 * - 导入时 zod 校验
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  persistConfig,
  loadPersistedConfig,
  validateImportConfig,
  persistConfigSync,
  getConfigFilePath,
  CONFIG_FILE_NAME,
} from '../../src/mcp/tools/config-persistence';
import {
  handleConfigure,
  resetRuntimeConfig,
  getRuntimeConfig,
  initRuntimeConfigFromPersisted,
} from '../../src/mcp/tools/configure';

/**
 * 等待文件出现的工具函数，用轮询替代固定 setTimeout
 */
async function waitForFile(filePath: string, timeoutMs = 2000, intervalMs = 50): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(filePath)) return;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(`等待文件写入超时: ${filePath}`);
}

/**
 * 等待文件内容满足条件的工具函数
 */
async function waitForFileContent(
  filePath: string,
  predicate: (content: any) => boolean,
  timeoutMs = 5000,
  intervalMs = 50,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(filePath)) {
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (predicate(content)) return content;
      } catch { /* 文件正在写入中，继续轮询 */ }
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(`等待文件内容超时: ${filePath}`);
}

describe('config-persistence', () => {
  let tmpDir: string;

  beforeEach(() => {
    // 每个测试使用独立的临时目录
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inquisitor-test-'));
    resetRuntimeConfig();
  });

  afterEach(() => {
    // 清理临时目录
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getConfigFilePath', () => {
    it('应返回包含 CONFIG_FILE_NAME 的路径', () => {
      const filePath = getConfigFilePath(tmpDir);
      expect(filePath).toBe(path.join(tmpDir, CONFIG_FILE_NAME));
    });

    it('CONFIG_FILE_NAME 应为 .inquisitor-mcp.json', () => {
      expect(CONFIG_FILE_NAME).toBe('.inquisitor-mcp.json');
    });
  });

  describe('persistConfig（异步写入）', () => {
    it('set 操作应使用异步 fs.writeFile 而非 writeFileSync', async () => {
      // 验证策略：persistConfig 内部使用 fs.writeFile（异步回调形式），
      // 而非 fs.writeFileSync。通过源代码静态分析 + 行为验证双重确认。

      // 行为验证：persistConfig 返回 void（非 Promise），
      // 但文件在稍后才写入完成，说明是异步非阻塞的
      const filePath = getConfigFilePath(tmpDir);

      persistConfig({ model: 'claude-sonnet' }, tmpDir);

      // 等待异步写入完成且内容可解析
      const content = await waitForFileContent(filePath, (c) => c.model === 'claude-sonnet');

      expect(fs.existsSync(filePath)).toBe(true);
      expect(content.model).toBe('claude-sonnet');

      // 静态验证：确认源代码使用了 fs.writeFile 而非 fs.writeFileSync
      const sourceCode = fs.readFileSync(
        require.resolve('../../src/mcp/tools/config-persistence'),
        'utf-8'
      );
      expect(sourceCode).toContain('writeFile');
      // persistConfig 函数不应包含 writeFileSync
      // 注意：persistConfigSync 可以使用 writeFileSync，但 persistConfig 不应使用
      const persistConfigSource = sourceCode.substring(
        sourceCode.indexOf('function persistConfig'),
        sourceCode.indexOf('function loadPersistedConfig')
      );
      expect(persistConfigSource).not.toContain('writeFileSync');
    });

    it('异步写入完成后应能读回配置', async () => {
      const config = { model: 'claude-sonnet', enableAdversary: false };
      persistConfig(config, tmpDir);

      // 等待异步写入完成且内容可解析
      await waitForFileContent(
        getConfigFilePath(tmpDir),
        (c) => c.model === 'claude-sonnet',
      );

      const loaded = loadPersistedConfig(tmpDir);
      expect(loaded.model).toBe('claude-sonnet');
      expect(loaded.enableAdversary).toBe(false);
    });
  });

  describe('persistConfigSync（同步写入）', () => {
    it('同步写入后应能立即读回配置', () => {
      const config = { model: 'claude-opus', maxParallel: 3 };
      persistConfigSync(config, tmpDir);

      const filePath = getConfigFilePath(tmpDir);
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.model).toBe('claude-opus');
      expect(parsed.maxParallel).toBe(3);
    });
  });

  describe('loadPersistedConfig', () => {
    it('文件不存在时应返回空对象', () => {
      const result = loadPersistedConfig(tmpDir);
      expect(result).toEqual({});
    });

    it('文件内容为非法 JSON 时应返回空对象且不抛异常', () => {
      const filePath = getConfigFilePath(tmpDir);
      fs.writeFileSync(filePath, '{ invalid json !!!', 'utf-8');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = loadPersistedConfig(tmpDir);

      expect(result).toEqual({});
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('文件存在且合法时应返回配置对象', () => {
      const filePath = getConfigFilePath(tmpDir);
      const config = { model: 'claude-haiku', enableMetaReview: true };
      fs.writeFileSync(filePath, JSON.stringify(config), 'utf-8');

      const result = loadPersistedConfig(tmpDir);
      expect(result.model).toBe('claude-haiku');
      expect(result.enableMetaReview).toBe(true);
    });
  });

  describe('validateImportConfig', () => {
    it('合法配置应校验通过', () => {
      const result = validateImportConfig({
        model: 'claude-sonnet',
        maxParallel: 3,
        enableAdversary: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.model).toBe('claude-sonnet');
      }
    });

    it('agentTimeout 为负数应校验失败', () => {
      const result = validateImportConfig({
        agentTimeout: -1,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error.length).toBeGreaterThan(0);
      }
    });

    it('maxParallel 超出范围应校验失败', () => {
      const result = validateImportConfig({
        maxParallel: 100,
      });
      expect(result.success).toBe(false);
    });

    it('空对象应校验通过', () => {
      const result = validateImportConfig({});
      expect(result.success).toBe(true);
    });
  });

  describe('handleConfigure - set 持久化', () => {
    it('set 操作应将配置持久化到文件', async () => {
      // 临时覆盖 process.cwd 让 persistConfig 写入 tmpDir
      const originalCwd = process.cwd;
      process.cwd = () => tmpDir;

      try {
        await handleConfigure({
          action: 'set',
          config: { model: 'claude-sonnet' },
        });

        const filePath = getConfigFilePath(tmpDir);
        const content = await waitForFileContent(filePath, (c) => c.model === 'claude-sonnet');

        expect(content.model).toBe('claude-sonnet');
      } finally {
        process.cwd = originalCwd;
      }
    });

    it('多次 set 应累积合并并持久化', async () => {
      const originalCwd = process.cwd;
      process.cwd = () => tmpDir;

      try {
        await handleConfigure({
          action: 'set',
          config: { enableAdversary: false },
        });
        await handleConfigure({
          action: 'set',
          config: { maxAdversaryRounds: 4 },
        });

        // 轮询等待异步写入完成且内容包含第二次 set 的值
        const filePath = getConfigFilePath(tmpDir);
        const content = await waitForFileContent(
          filePath,
          (c) => c.maxAdversaryRounds === 4,
        );

        expect(content.enableAdversary).toBe(false);
        expect(content.maxAdversaryRounds).toBe(4);
      } finally {
        process.cwd = originalCwd;
      }
    });
  });

  describe('handleConfigure - export 操作', () => {
    it('export 应返回当前完整配置 JSON 字符串', async () => {
      // 先 set 一些配置
      await handleConfigure({
        action: 'set',
        config: { model: 'claude-sonnet', enableAdversary: false },
      });

      const result = await handleConfigure({ action: 'export' });

      expect(result.isError).toBeUndefined();
      const exported = JSON.parse(result.content[0].text);
      expect(exported.model).toBe('claude-sonnet');
      expect(exported.enableAdversary).toBe(false);
      // 应包含默认值
      expect(exported.maxParallel).toBeDefined();
      expect(exported.agentTimeout).toBeDefined();
    });

    it('无自定义配置时 export 应返回全部默认值', async () => {
      const result = await handleConfigure({ action: 'export' });

      expect(result.isError).toBeUndefined();
      const exported = JSON.parse(result.content[0].text);
      // model 默认为空，运行时由 provider.defaultModel 兜底
      expect(exported.model).toBeUndefined();
      expect(exported.enableAdversary).toBe(true);
      expect(exported.maxParallel).toBe(5);
    });
  });

  describe('handleConfigure - import 操作', () => {
    it('import 应覆盖当前配置并持久化', async () => {
      const originalCwd = process.cwd;
      process.cwd = () => tmpDir;

      const importConfig = {
        model: 'claude-opus',
        enableAdversary: true,
        maxParallel: 8,
      };

      const result = await handleConfigure({
        action: 'import',
        config: importConfig,
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('配置已导入');

      // 验证 get 能获取到导入的配置
      const getResult = await handleConfigure({ action: 'get' });
      const config = JSON.parse(getResult.content[0].text);
      expect(config.model).toBe('claude-opus');
      expect(config.maxParallel).toBe(8);

      // 验证文件已持久化
      const filePath = getConfigFilePath(tmpDir);
      const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(fileContent.model).toBe('claude-opus');
      expect(fileContent.maxParallel).toBe(8);

      process.cwd = originalCwd;
    });

    it('import 无 config 参数应返回错误', async () => {
      const result = await handleConfigure({ action: 'import' } as any);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('config');
    });

    it('import 含非法字段(agentTimeout:-1)应返回错误', async () => {
      const result = await handleConfigure({
        action: 'import',
        config: { agentTimeout: -1 } as any,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('校验错误');
    });

    it('import 含非法 maxParallel 应返回错误', async () => {
      const result = await handleConfigure({
        action: 'import',
        config: { maxParallel: 100 } as any,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('校验错误');
    });

    it('import 应覆盖而非合并已有配置', async () => {
      // 先 set 一些配置
      await handleConfigure({
        action: 'set',
        config: { enableAdversary: false, maxAdversaryRounds: 5 },
      });

      // import 全新配置（不包含 maxAdversaryRounds）
      await handleConfigure({
        action: 'import',
        config: { model: 'claude-haiku' },
      });

      // 验证 maxAdversaryRounds 回到默认值（因为 import 是覆盖）
      const getResult = await handleConfigure({ action: 'get' });
      const config = JSON.parse(getResult.content[0].text);
      expect(config.model).toBe('claude-haiku');
      expect(config.maxAdversaryRounds).toBe(1); // 默认值
      expect(config.enableAdversary).toBe(true); // 默认值
    });
  });

  describe('initRuntimeConfigFromPersisted', () => {
    it('有持久化文件时应加载配置', () => {
      const filePath = getConfigFilePath(tmpDir);
      const config = { model: 'claude-sonnet', enableAdversary: false };
      fs.writeFileSync(filePath, JSON.stringify(config), 'utf-8');

      initRuntimeConfigFromPersisted(tmpDir);

      const runtime = getRuntimeConfig();
      expect(runtime.model).toBe('claude-sonnet');
      expect(runtime.enableAdversary).toBe(false);
    });

    it('无持久化文件时应保持空配置', () => {
      initRuntimeConfigFromPersisted(tmpDir);

      const runtime = getRuntimeConfig();
      expect(Object.keys(runtime).length).toBe(0);
    });

    it('持久化文件内容非法时应保持空配置', () => {
      const filePath = getConfigFilePath(tmpDir);
      fs.writeFileSync(filePath, 'not valid json!!!', 'utf-8');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      initRuntimeConfigFromPersisted(tmpDir);
      consoleSpy.mockRestore();

      const runtime = getRuntimeConfig();
      expect(Object.keys(runtime).length).toBe(0);
    });
  });

  describe('优雅降级', () => {
    it('无 .inquisitor-mcp.json 时 handleConfigure get 应返回默认配置', async () => {
      const result = await handleConfigure({ action: 'get' });

      expect(result.isError).toBeUndefined();
      const config = JSON.parse(result.content[0].text);
      // model 默认为空，运行时由 provider.defaultModel 兜底
      expect(config.model).toBeUndefined();
      expect(config.enableAdversary).toBe(true);
      expect(config.maxParallel).toBe(5);
    });

    it('loadPersistedConfig 在无文件时返回空对象', () => {
      const result = loadPersistedConfig(path.join(tmpDir, 'nonexistent'));
      expect(result).toEqual({});
    });
  });

  describe('端到端流程', () => {
    it('set -> export -> 验证导出包含所有字段', async () => {
      await handleConfigure({
        action: 'set',
        config: { model: 'claude-sonnet', maxParallel: 2 },
      });

      const exportResult = await handleConfigure({ action: 'export' });
      const exported = JSON.parse(exportResult.content[0].text);

      expect(exported.model).toBe('claude-sonnet');
      expect(exported.maxParallel).toBe(2);
      expect(exported.enableAdversary).toBe(true); // 默认值
      expect(exported.agentTimeout).toBeDefined();
      expect(exported.maxAdversaryRounds).toBeDefined();
    });

    it('import -> get -> 验证配置已生效', async () => {
      const originalCwd = process.cwd;
      process.cwd = () => tmpDir;

      await handleConfigure({
        action: 'import',
        config: {
          model: 'claude-opus',
          enableMetaReview: true,
          maxAdversaryRounds: 3,
        },
      });

      const getResult = await handleConfigure({ action: 'get' });
      const config = JSON.parse(getResult.content[0].text);

      expect(config.model).toBe('claude-opus');
      expect(config.enableMetaReview).toBe(true);
      expect(config.maxAdversaryRounds).toBe(3);

      // 验证文件也已更新
      const filePath = getConfigFilePath(tmpDir);
      expect(fs.existsSync(filePath)).toBe(true);
      const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(fileContent.model).toBe('claude-opus');

      process.cwd = originalCwd;
    });
  });
});
