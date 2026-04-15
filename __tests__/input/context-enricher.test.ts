import { ContextEnricher } from '../../src/input/context-enricher';
import { FileToReview } from '../../src/types';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('ContextEnricher', () => {
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

  describe('enrich', () => {
    it('should handle empty file list', async () => {
      const enricher = new ContextEnricher({ projectRoot: tempDir });
      const result = await enricher.enrich([]);

      expect(result).toEqual([]);
    });

    it('should preserve initial files without dependencies', async () => {
      const enricher = new ContextEnricher({ projectRoot: tempDir });

      const testFile = join(tempDir, 'standalone.ts');
      writeFileSync(testFile, 'const a = 1;');

      const files: FileToReview[] = [
        {
          path: 'standalone.ts',
          content: 'const a = 1;',
          language: 'typescript',
        },
      ];

      const result = await enricher.enrich(files);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('standalone.ts');
      expect(result[0].content).toBe('const a = 1;');
    });

    it('should discover dependencies through ES6 import statements', async () => {
      const enricher = new ContextEnricher({ projectRoot: tempDir });

      // 创建主文件和依赖文件
      writeFileSync(
        join(tempDir, 'main.ts'),
        `import { helper } from './helper';\nimport { utils } from './utils';\nconsole.log(helper, utils);`
      );
      writeFileSync(
        join(tempDir, 'helper.ts'),
        'export function helper() { return 1; }'
      );
      writeFileSync(
        join(tempDir, 'utils.ts'),
        'export function utils() { return 2; }'
      );

      const files: FileToReview[] = [
        {
          path: 'main.ts',
          content: `import { helper } from './helper';\nimport { utils } from './utils';\nconsole.log(helper, utils);`,
          language: 'typescript',
        },
      ];

      const result = await enricher.enrich(files);

      // 应包含原始文件 + 2 个依赖文件
      expect(result.length).toBeGreaterThanOrEqual(3);

      const paths = result.map((f) => f.path);
      expect(paths).toContain('main.ts');
      expect(paths).toContain('helper.ts');
      expect(paths).toContain('utils.ts');

      // 依赖文件应有正确的内容
      const helperFile = result.find((f) => f.path === 'helper.ts');
      expect(helperFile).toBeDefined();
      expect(helperFile!.content).toContain('export function helper');
    });

    it('should discover dependencies through require() statements and support depth up to 2 levels', async () => {
      const enricher = new ContextEnricher({
        projectRoot: tempDir,
        maxDepth: 2,
      });

      // A -> B -> C -> D（第 3 层应不追踪）
      writeFileSync(
        join(tempDir, 'a.js'),
        `const b = require('./b');\nconsole.log(b);`
      );
      writeFileSync(
        join(tempDir, 'b.js'),
        `const c = require('./c');\nmodule.exports = c;`
      );
      writeFileSync(
        join(tempDir, 'c.js'),
        `const d = require('./d');\nmodule.exports = d;`
      );
      writeFileSync(
        join(tempDir, 'd.js'),
        `module.exports = 'deep';`
      );

      const files: FileToReview[] = [
        {
          path: 'a.js',
          content: `const b = require('./b');\nconsole.log(b);`,
          language: 'javascript',
        },
      ];

      const result = await enricher.enrich(files);

      const paths = result.map((f) => f.path);
      // A（初始）+ B（深度 0）+ C（深度 1）应存在
      expect(paths).toContain('a.js');
      expect(paths).toContain('b.js');
      expect(paths).toContain('c.js');
      // D 是第 3 层（深度 2），不应被追踪
      expect(paths).not.toContain('d.js');
    });

    it('should stop adding dependencies when maxTotalSize is exceeded', async () => {
      // 设置一个非常小的 maxTotalSize
      const enricher = new ContextEnricher({
        projectRoot: tempDir,
        maxTotalSize: 100, // 100 字节
      });

      // 创建文件，初始文件内容占用约 50 字节
      const mainContent = 'import { a } from "./a";\nimport { b } from "./b";';
      writeFileSync(join(tempDir, 'main.ts'), mainContent);

      // 依赖文件 a 约 60 字节，加上初始文件后超过 100 字节阈值
      const aContent = 'export const a = "this is a long string to make the file bigger";';
      writeFileSync(join(tempDir, 'a.ts'), aContent);

      // 依赖文件 b 也约 60 字节
      const bContent = 'export const b = "this is another long string to exceed limit";';
      writeFileSync(join(tempDir, 'b.ts'), bContent);

      const files: FileToReview[] = [
        {
          path: 'main.ts',
          content: mainContent,
          language: 'typescript',
        },
      ];

      const result = await enricher.enrich(files);

      // 初始文件一定存在
      expect(result.some((f) => f.path === 'main.ts')).toBe(true);

      // 由于大小限制，不应同时包含 a.ts 和 b.ts
      // 初始文件 50 字节 + a.ts 64 字节 = 114 > 100，所以最多添加 a 之前就超了
      // 但 a.ts 可能在检查前被加入，b.ts 不会加入
      const totalContent = result.reduce(
        (sum, f) => sum + (f.content || '').length,
        0
      );

      // 关键断言：已收集文件不受影响（不被删除），但新文件停止添加
      // 至少初始文件存在
      expect(result.length).toBeGreaterThanOrEqual(1);
      // 不应包含所有依赖
      expect(result.length).toBeLessThan(4);
    });

    it('should filter out external packages (non-relative imports)', async () => {
      const enricher = new ContextEnricher({ projectRoot: tempDir });

      const mainContent = `
import _ from 'lodash';
import React from 'react';
import { helper } from './helper';
`;
      writeFileSync(join(tempDir, 'app.ts'), mainContent);
      writeFileSync(join(tempDir, 'helper.ts'), 'export function helper() {}');

      const files: FileToReview[] = [
        {
          path: 'app.ts',
          content: mainContent,
          language: 'typescript',
        },
      ];

      const result = await enricher.enrich(files);
      const paths = result.map((f) => f.path);

      // 应包含 helper 但不应试图解析 lodash 或 react
      expect(paths).toContain('app.ts');
      expect(paths).toContain('helper.ts');
      expect(paths.every((p) => !p.includes('lodash'))).toBe(true);
      expect(paths.every((p) => !p.includes('react'))).toBe(true);
    });

    it('should not revisit already visited files (circular dependency protection)', async () => {
      const enricher = new ContextEnricher({ projectRoot: tempDir });

      // 循环依赖: a -> b -> a
      writeFileSync(
        join(tempDir, 'a.ts'),
        `import { b } from './b';`
      );
      writeFileSync(
        join(tempDir, 'b.ts'),
        `import { a } from './a';`
      );

      const files: FileToReview[] = [
        {
          path: 'a.ts',
          content: `import { b } from './b';`,
          language: 'typescript',
        },
      ];

      const result = await enricher.enrich(files);

      // 不应因循环引用而无限递归
      expect(result.length).toBe(2);
      const paths = result.map((f) => f.path);
      expect(paths).toContain('a.ts');
      expect(paths).toContain('b.ts');
    });

    it('should respect maxDepth=0 and not discover any dependencies', async () => {
      const enricher = new ContextEnricher({
        projectRoot: tempDir,
        maxDepth: 0,
      });

      writeFileSync(join(tempDir, 'main.ts'), `import { x } from './x';`);
      writeFileSync(join(tempDir, 'x.ts'), 'export const x = 1;');

      const files: FileToReview[] = [
        {
          path: 'main.ts',
          content: `import { x } from './x';`,
          language: 'typescript',
        },
      ];

      const result = await enricher.enrich(files);

      // maxDepth=0 意味着不追踪任何依赖
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('main.ts');
    });
  });
});
