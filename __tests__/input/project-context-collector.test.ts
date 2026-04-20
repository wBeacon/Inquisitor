/**
 * project-context-collector.test.ts - 项目级上下文采集器测试
 */
import { ProjectContextCollector, ProjectContext } from '../../src/input/project-context-collector';
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('ProjectContextCollector', () => {
  const tmpDir = resolve(__dirname, 'tmp-project-context-test');

  beforeEach(() => {
    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ---- 各种配置文件正确读取 ----

  test('正确读取 .eslintrc.json 配置文件', () => {
    const content = '{"rules":{"no-console":"error"}}';
    writeFileSync(resolve(tmpDir, '.eslintrc.json'), content);

    const collector = new ProjectContextCollector();
    const result = collector.collect(tmpDir);

    expect(result.eslint).toBeDefined();
    expect(result.eslint!.filePath).toBe('.eslintrc.json');
    expect(result.eslint!.content).toBe(content);
    expect(result.eslint!.truncated).toBe(false);
  });

  test('正确读取 .eslintrc.js 配置文件', () => {
    const content = 'module.exports = { rules: {} };';
    writeFileSync(resolve(tmpDir, '.eslintrc.js'), content);

    const collector = new ProjectContextCollector();
    const result = collector.collect(tmpDir);

    expect(result.eslint).toBeDefined();
    expect(result.eslint!.filePath).toBe('.eslintrc.js');
    expect(result.eslint!.content).toBe(content);
  });

  test('正确读取 eslint.config.js（flat config）', () => {
    const content = 'export default [{ rules: {} }];';
    writeFileSync(resolve(tmpDir, 'eslint.config.js'), content);

    const collector = new ProjectContextCollector();
    const result = collector.collect(tmpDir);

    expect(result.eslint).toBeDefined();
    expect(result.eslint!.filePath).toBe('eslint.config.js');
  });

  test('.eslintrc.json 优先级高于 .eslintrc.js', () => {
    writeFileSync(resolve(tmpDir, '.eslintrc.json'), '{"a":1}');
    writeFileSync(resolve(tmpDir, '.eslintrc.js'), 'module.exports = {}');

    const collector = new ProjectContextCollector();
    const result = collector.collect(tmpDir);

    expect(result.eslint!.filePath).toBe('.eslintrc.json');
  });

  test('正确读取 .editorconfig', () => {
    const content = 'root = true\n[*]\nindent_style = space';
    writeFileSync(resolve(tmpDir, '.editorconfig'), content);

    const collector = new ProjectContextCollector();
    const result = collector.collect(tmpDir);

    expect(result.editorconfig).toBeDefined();
    expect(result.editorconfig!.filePath).toBe('.editorconfig');
    expect(result.editorconfig!.content).toBe(content);
  });

  test('正确读取 tsconfig.json', () => {
    const content = '{"compilerOptions":{"strict":true}}';
    writeFileSync(resolve(tmpDir, 'tsconfig.json'), content);

    const collector = new ProjectContextCollector();
    const result = collector.collect(tmpDir);

    expect(result.tsconfig).toBeDefined();
    expect(result.tsconfig!.filePath).toBe('tsconfig.json');
    expect(result.tsconfig!.content).toBe(content);
  });

  test('正确读取 README.md', () => {
    const content = '# My Project\nDescription here';
    writeFileSync(resolve(tmpDir, 'README.md'), content);

    const collector = new ProjectContextCollector();
    const result = collector.collect(tmpDir);

    expect(result.readme).toBeDefined();
    expect(result.readme!.filePath).toBe('README.md');
    expect(result.readme!.content).toBe(content);
  });

  // ---- 缺失文件场景 ----

  test('全部文件缺失时正常返回', () => {
    const collector = new ProjectContextCollector();
    const result = collector.collect(tmpDir);

    expect(result.eslint).toBeUndefined();
    expect(result.editorconfig).toBeUndefined();
    expect(result.tsconfig).toBeUndefined();
    expect(result.readme).toBeUndefined();
    expect(result.metadata.collectedCount).toBe(0);
    expect(result.metadata.projectRoot).toBe(tmpDir);
  });

  test('部分文件缺失时正常返回已有的', () => {
    writeFileSync(resolve(tmpDir, 'tsconfig.json'), '{"strict":true}');
    // 其他文件不存在

    const collector = new ProjectContextCollector();
    const result = collector.collect(tmpDir);

    expect(result.tsconfig).toBeDefined();
    expect(result.eslint).toBeUndefined();
    expect(result.editorconfig).toBeUndefined();
    expect(result.readme).toBeUndefined();
    expect(result.metadata.collectedCount).toBe(1);
  });

  test('项目根目录不存在时正常返回空结果', () => {
    const collector = new ProjectContextCollector();
    const result = collector.collect('/tmp/nonexistent-dir-project-context-test-12345');

    expect(result.eslint).toBeUndefined();
    expect(result.metadata.collectedCount).toBe(0);
  });

  // ---- enabled=false 跳过采集 ----

  test('enabled=false 跳过采集', () => {
    // 即使配置文件存在也不读取
    writeFileSync(resolve(tmpDir, 'tsconfig.json'), '{}');
    writeFileSync(resolve(tmpDir, '.editorconfig'), 'root=true');

    const collector = new ProjectContextCollector({ enabled: false });
    const result = collector.collect(tmpDir);

    expect(result.eslint).toBeUndefined();
    expect(result.editorconfig).toBeUndefined();
    expect(result.tsconfig).toBeUndefined();
    expect(result.readme).toBeUndefined();
    expect(result.metadata.collectedCount).toBe(0);
  });

  // ---- 超大配置文件截断 ----

  test('超大配置文件截断', () => {
    // 创建一个超大的 tsconfig 文件（远超 4096 字节）
    const largeContent = 'x'.repeat(8000);
    writeFileSync(resolve(tmpDir, 'tsconfig.json'), largeContent);

    const collector = new ProjectContextCollector();
    const result = collector.collect(tmpDir);

    // 序列化后总大小不超过 4096 字节
    const serialized = JSON.stringify(result);
    const totalBytes = Buffer.byteLength(serialized, 'utf-8');
    expect(totalBytes).toBeLessThanOrEqual(4096);
    expect(result.metadata.truncatedByLimit).toBe(true);
  });

  test('多个大文件截断后总大小不超过限制', () => {
    // 每个文件约 1500 字节，4 个文件超过 4096
    writeFileSync(resolve(tmpDir, '.eslintrc.json'), 'e'.repeat(1500));
    writeFileSync(resolve(tmpDir, '.editorconfig'), 'd'.repeat(1500));
    writeFileSync(resolve(tmpDir, 'tsconfig.json'), 't'.repeat(1500));
    writeFileSync(resolve(tmpDir, 'README.md'), 'r'.repeat(1500));

    const collector = new ProjectContextCollector();
    const result = collector.collect(tmpDir);

    const serialized = JSON.stringify(result);
    const totalBytes = Buffer.byteLength(serialized, 'utf-8');
    expect(totalBytes).toBeLessThanOrEqual(4096);
  });

  // ---- 读取权限异常 ----

  test('读取权限异常时 graceful 处理', () => {
    // 使用 mock 模拟 readFileSync 抛错
    const fs = require('fs');
    const originalReadFileSync = fs.readFileSync;
    const originalExistsSync = fs.existsSync;

    // mock: existsSync 返回 true 但 readFileSync 抛权限错误
    fs.existsSync = (p: string) => {
      if (p.includes('tsconfig.json')) return true;
      return originalExistsSync(p);
    };
    fs.readFileSync = (p: string, enc: string) => {
      if (typeof p === 'string' && p.includes('tsconfig.json')) {
        const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      }
      return originalReadFileSync(p, enc);
    };

    try {
      const collector = new ProjectContextCollector();
      // 不抛异常
      const result = collector.collect(tmpDir);
      expect(result.tsconfig).toBeUndefined();
    } finally {
      // 恢复原始函数
      fs.readFileSync = originalReadFileSync;
      fs.existsSync = originalExistsSync;
    }
  });

  test('符号链接断裂时 graceful 处理', () => {
    const fs = require('fs');
    const originalReadFileSync = fs.readFileSync;
    const originalExistsSync = fs.existsSync;

    fs.existsSync = (p: string) => {
      if (p.includes('.editorconfig')) return true;
      return originalExistsSync(p);
    };
    fs.readFileSync = (p: string, enc: string) => {
      if (typeof p === 'string' && p.includes('.editorconfig')) {
        const err = new Error('ENOENT: broken symlink') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }
      return originalReadFileSync(p, enc);
    };

    try {
      const collector = new ProjectContextCollector();
      const result = collector.collect(tmpDir);
      expect(result.editorconfig).toBeUndefined();
    } finally {
      fs.readFileSync = originalReadFileSync;
      fs.existsSync = originalExistsSync;
    }
  });

  // ---- 返回结构化对象验证 ----

  test('返回结构化 ProjectContext 对象', () => {
    writeFileSync(resolve(tmpDir, 'tsconfig.json'), '{"strict":true}');
    writeFileSync(resolve(tmpDir, '.editorconfig'), 'root=true');

    const collector = new ProjectContextCollector();
    const result: ProjectContext = collector.collect(tmpDir);

    // 验证返回的是结构化对象（非纯字符串）
    expect(typeof result).toBe('object');
    expect(result.metadata).toBeDefined();
    expect(typeof result.metadata.projectRoot).toBe('string');
    expect(typeof result.metadata.collectedCount).toBe('number');
    expect(typeof result.metadata.totalBytes).toBe('number');
    expect(typeof result.metadata.truncatedByLimit).toBe('boolean');

    // 各字段是 ConfigFileEntry 或 undefined
    if (result.tsconfig) {
      expect(typeof result.tsconfig.filePath).toBe('string');
      expect(typeof result.tsconfig.content).toBe('string');
      expect(typeof result.tsconfig.truncated).toBe('boolean');
    }
  });

  // ---- serialize 方法测试 ----

  test('serialize 生成可读的上下文字符串', () => {
    writeFileSync(resolve(tmpDir, 'tsconfig.json'), '{"strict":true}');

    const collector = new ProjectContextCollector();
    const result = collector.collect(tmpDir);
    const serialized = ProjectContextCollector.serialize(result);

    expect(serialized).toContain('Project Configuration Context');
    expect(serialized).toContain('TypeScript Config');
    expect(serialized).toContain('{"strict":true}');
  });

  test('serialize 空结果返回空字符串', () => {
    const collector = new ProjectContextCollector();
    const result = collector.collect(tmpDir);
    const serialized = ProjectContextCollector.serialize(result);
    expect(serialized).toBe('');
  });
});
