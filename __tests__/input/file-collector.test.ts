import { FileCollector } from '../../src/input/file-collector';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { rmSync } from 'fs';

describe('FileCollector', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(__dirname, 'temp-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });

  describe('collect', () => {
    it('should collect a single file with correct content and language', async () => {
      const collector = new FileCollector();
      const testFile = join(tempDir, 'example.ts');
      const content = 'export function greet(): string {\n  return "hello";\n}';

      writeFileSync(testFile, content);

      const files = await collector.collect(testFile);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe(testFile);
      expect(files[0].content).toBe(content);
      expect(files[0].language).toBe('typescript');
    });

    it('should collect single file with correct language for various extensions', async () => {
      const collector = new FileCollector();
      const testCases = [
        { ext: '.ts', expected: 'typescript' },
        { ext: '.js', expected: 'javascript' },
        { ext: '.py', expected: 'python' },
        { ext: '.go', expected: 'go' },
        { ext: '.json', expected: 'json' },
        { ext: '.css', expected: 'css' },
      ];

      for (const tc of testCases) {
        const testFile = join(tempDir, `test${tc.ext}`);
        writeFileSync(testFile, 'test content');

        const files = await collector.collect(testFile);
        expect(files[0].language).toBe(tc.expected);
      }
    });

    it('should collect all code files from a directory recursively, excluding node_modules/.git/dist', async () => {
      const collector = new FileCollector();

      // 创建正常的代码文件
      const srcDir = join(tempDir, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, 'app.ts'), 'const app = true;');
      writeFileSync(join(srcDir, 'utils.js'), 'module.exports = {};');

      // 创建嵌套子目录
      const subDir = join(srcDir, 'lib');
      mkdirSync(subDir, { recursive: true });
      writeFileSync(join(subDir, 'helper.ts'), 'export const h = 1;');

      // 创建应被排除的目录
      const nodeModulesDir = join(tempDir, 'node_modules');
      mkdirSync(nodeModulesDir, { recursive: true });
      writeFileSync(join(nodeModulesDir, 'pkg.js'), 'should not be included');

      const gitDir = join(tempDir, '.git');
      mkdirSync(gitDir, { recursive: true });
      writeFileSync(join(gitDir, 'config'), 'should not be included');

      const distDir = join(tempDir, 'dist');
      mkdirSync(distDir, { recursive: true });
      writeFileSync(join(distDir, 'bundle.js'), 'should not be included');

      // 创建二进制文件（非代码扩展名）
      writeFileSync(join(tempDir, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      const files = await collector.collect(tempDir);

      // 只应包含 src 目录下的代码文件
      const paths = files.map(f => f.path);
      expect(files.length).toBe(3);

      // 不应包含 node_modules、.git、dist 中的文件
      expect(paths.every(p => !p.includes('node_modules'))).toBe(true);
      expect(paths.every(p => !p.includes('.git'))).toBe(true);
      expect(paths.every(p => !p.includes('dist'))).toBe(true);

      // 不应包含二进制文件
      expect(paths.every(p => !p.includes('.png'))).toBe(true);
    });

    it('should match files using glob pattern (e.g. src/**/*.ts)', async () => {
      const collector = new FileCollector();

      // 创建多种文件
      const srcDir = join(tempDir, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, 'app.ts'), 'const a = 1;');
      writeFileSync(join(srcDir, 'utils.ts'), 'const b = 2;');
      writeFileSync(join(srcDir, 'style.css'), 'body {}');
      writeFileSync(join(srcDir, 'readme.md'), '# README');

      const nested = join(srcDir, 'lib');
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(nested, 'deep.ts'), 'const c = 3;');

      // 使用 glob 模式只匹配 .ts 文件
      const files = await collector.collect(join(tempDir, 'src/**/*.ts'));

      // 只包含匹配的 .ts 文件
      expect(files).toHaveLength(3);
      expect(files.every(f => f.path.endsWith('.ts'))).toBe(true);
      expect(files.every(f => f.language === 'typescript')).toBe(true);

      // 不包含 .css 和 .md 文件
      expect(files.some(f => f.path.endsWith('.css'))).toBe(false);
      expect(files.some(f => f.path.endsWith('.md'))).toBe(false);
    });

    it('should throw error for non-existent file', async () => {
      const collector = new FileCollector();

      await expect(
        collector.collect(join(tempDir, 'nonexistent.ts'))
      ).rejects.toThrow();
    });
  });
});
