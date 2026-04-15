/**
 * config-ignore-integration.test.ts - 配置忽略模式集成测试
 *
 * 验证 .inquisitor.json 中的 ignore 模式在 FileCollector 采集阶段被正确应用。
 * 这是真实的集成测试，使用真正的 FileCollector.collect() 方法。
 */
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { resolve } from 'path';
import { FileCollector } from '../../src/input';
import { loadConfig } from '../../src/skill/config-loader';

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
    // 清理临时目录
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('FileCollector.collect() 使用 ignore 模式排除测试文件', async () => {
    // 写入配置
    const config = {
      ignore: ['**/*.test.ts'],
      rules: {},
    };
    writeFileSync(resolve(tmpDir, '.inquisitor.json'), JSON.stringify(config));

    // 加载配置
    const loaded = loadConfig(tmpDir);
    expect(loaded.ignore).toEqual(['**/*.test.ts']);

    // 使用真正的 FileCollector，传入 ignore 模式
    const collector = new FileCollector();
    const files = await collector.collect(srcDir, loaded.ignore);

    // 验证: 测试文件被排除
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain(expect.stringContaining('app.test.ts'));
    expect(files.length).toBe(2);
    expect(paths.some((p) => p.includes('app.ts') && !p.includes('test'))).toBe(true);
    expect(paths.some((p) => p.includes('util.ts'))).toBe(true);
  });

  test('FileCollector.collect() 使用多个 ignore 模式同时过滤', async () => {
    // 创建额外的 spec 文件
    writeFileSync(resolve(srcDir, 'app.spec.ts'), 'describe("app", () => {});');

    const config = {
      ignore: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {},
    };
    writeFileSync(resolve(tmpDir, '.inquisitor.json'), JSON.stringify(config));

    const loaded = loadConfig(tmpDir);
    const collector = new FileCollector();
    const files = await collector.collect(srcDir, loaded.ignore);

    // 只剩 app.ts 和 util.ts
    expect(files.length).toBe(2);
    const paths = files.map((f) => f.path);
    expect(paths.some((p) => p.includes('test'))).toBe(false);
    expect(paths.some((p) => p.includes('spec'))).toBe(false);
  });

  test('FileCollector.collect() 空 ignore 模式不排除任何文件', async () => {
    const collector = new FileCollector();
    const filesWithEmpty = await collector.collect(srcDir, []);
    const filesWithout = await collector.collect(srcDir);

    // 两者结果相同
    expect(filesWithEmpty.length).toBe(filesWithout.length);
  });

  test('FileCollector.collect() 不传 ignore 参数时不过滤', async () => {
    const collector = new FileCollector();
    const files = await collector.collect(srcDir);

    // 应该包含所有 3 个文件
    expect(files.length).toBe(3);
  });
});
