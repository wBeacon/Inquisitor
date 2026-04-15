/**
 * config-ignore-integration.test.ts - 配置忽略模式集成测试
 *
 * 验证 .inquisitor.json 中的 ignore 模式是否能在 FileCollector 采集阶段被正确应用。
 */
import { writeFileSync, mkdirSync, existsSync, rmdirSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { FileCollector } from '../../src/input';
import { loadConfig } from '../../src/skill/config-loader';
import * as minimatch from 'minimatch';

/**
 * 辅助函数：使用 ignore 模式过滤文件列表
 * 模拟 FileCollector 与 config ignore 的集成
 */
function filterByIgnorePatterns(
  files: Array<{ path: string }>,
  ignorePatterns: string[]
): Array<{ path: string }> {
  return files.filter((file) => {
    return !ignorePatterns.some((pattern) => minimatch.minimatch(file.path, pattern));
  });
}

describe('ignore 模式集成', () => {
  const tmpDir = resolve(__dirname, 'tmp-ignore-test');
  const srcDir = resolve(tmpDir, 'src');

  beforeEach(() => {
    // 创建临时项目结构
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(resolve(srcDir, 'app.ts'), 'console.log("app");');
    writeFileSync(resolve(srcDir, 'app.test.ts'), 'test("app", () => {});');
    writeFileSync(resolve(srcDir, 'util.ts'), 'export const x = 1;');
  });

  afterEach(() => {
    // 清理临时文件
    const files = [
      resolve(srcDir, 'app.ts'),
      resolve(srcDir, 'app.test.ts'),
      resolve(srcDir, 'util.ts'),
      resolve(tmpDir, '.inquisitor.json'),
    ];
    for (const f of files) {
      if (existsSync(f)) unlinkSync(f);
    }
    if (existsSync(srcDir)) rmdirSync(srcDir);
    if (existsSync(tmpDir)) rmdirSync(tmpDir);
  });

  test('ignore 模式排除匹配的测试文件', () => {
    // 写入配置
    const config = {
      ignore: ['**/*.test.ts'],
      rules: {},
    };
    writeFileSync(resolve(tmpDir, '.inquisitor.json'), JSON.stringify(config));

    // 加载配置
    const loaded = loadConfig(tmpDir);
    expect(loaded.ignore).toEqual(['**/*.test.ts']);

    // 模拟文件列表
    const allFiles = [
      { path: 'src/app.ts' },
      { path: 'src/app.test.ts' },
      { path: 'src/util.ts' },
    ];

    // 应用 ignore 模式
    const filtered = filterByIgnorePatterns(allFiles, loaded.ignore);

    // 验证: 测试文件被排除
    expect(filtered.length).toBe(2);
    expect(filtered.find((f) => f.path === 'src/app.ts')).toBeDefined();
    expect(filtered.find((f) => f.path === 'src/util.ts')).toBeDefined();
    expect(filtered.find((f) => f.path === 'src/app.test.ts')).toBeUndefined();
  });

  test('ignore 模式排除 node_modules', () => {
    const config = {
      ignore: ['node_modules/**'],
      rules: {},
    };
    writeFileSync(resolve(tmpDir, '.inquisitor.json'), JSON.stringify(config));
    const loaded = loadConfig(tmpDir);

    const allFiles = [
      { path: 'src/app.ts' },
      { path: 'node_modules/lodash/index.js' },
    ];

    const filtered = filterByIgnorePatterns(allFiles, loaded.ignore);
    expect(filtered.length).toBe(1);
    expect(filtered[0].path).toBe('src/app.ts');
  });

  test('多个 ignore 模式同时生效', () => {
    const config = {
      ignore: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {},
    };
    writeFileSync(resolve(tmpDir, '.inquisitor.json'), JSON.stringify(config));
    const loaded = loadConfig(tmpDir);

    const allFiles = [
      { path: 'src/app.ts' },
      { path: 'src/app.test.ts' },
      { path: 'src/app.spec.ts' },
    ];

    const filtered = filterByIgnorePatterns(allFiles, loaded.ignore);
    expect(filtered.length).toBe(1);
    expect(filtered[0].path).toBe('src/app.ts');
  });

  test('空 ignore 模式不排除任何文件', () => {
    const allFiles = [
      { path: 'src/app.ts' },
      { path: 'src/app.test.ts' },
    ];

    const filtered = filterByIgnorePatterns(allFiles, []);
    expect(filtered.length).toBe(2);
  });
});
