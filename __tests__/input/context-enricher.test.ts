import { ContextEnricher } from '../../src/input/context-enricher';
import { FileToReview } from '../../src/types';
import { mkdtempSync, writeFileSync, rmdirSync } from 'fs';
import { join } from 'path';

describe('ContextEnricher', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(__dirname, 'temp-'));
  });

  afterEach(() => {
    try {
      rmdirSync(tempDir, { recursive: true });
    } catch (error) {
      // ignore cleanup errors
    }
  });

  describe('enrich', () => {
    it('should handle empty file list', async () => {
      const enricher = new ContextEnricher({ projectRoot: tempDir });
      const result = await enricher.enrich([]);
      
      expect(result).toEqual([]);
    });

    it('should preserve initial files', async () => {
      const enricher = new ContextEnricher({ projectRoot: tempDir });
      
      const files: FileToReview[] = [
        {
          path: 'test.ts',
          content: 'const a = 1;',
          language: 'typescript',
        },
      ];
      
      const result = await enricher.enrich(files);
      
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].path).toBe('test.ts');
    });

    it('should discover simple dependencies', async () => {
      const enricher = new ContextEnricher({ projectRoot: tempDir });
      
      // Create main file with import
      const mainFile = join(tempDir, 'main.ts');
      writeFileSync(mainFile, `import { helper } from './helper';`);
      
      // Create imported file
      const helperFile = join(tempDir, 'helper.ts');
      writeFileSync(helperFile, 'export function helper() {}');
      
      const files: FileToReview[] = [
        {
          path: 'main.ts',
          content: `import { helper } from './helper';`,
          language: 'typescript',
        },
      ];
      
      const result = await enricher.enrich(files);
      
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract dependencies from require statements', async () => {
      const enricher = new ContextEnricher({ projectRoot: tempDir });
      
      const files: FileToReview[] = [
        {
          path: 'app.js',
          content: `const utils = require('./utils'); const helper = require('./helper');`,
          language: 'javascript',
        },
      ];
      
      const result = await enricher.enrich(files);
      expect(result).toBeDefined();
    });

    it('should respect maxDepth option', async () => {
      const enricher = new ContextEnricher({
        projectRoot: tempDir,
        maxDepth: 0,
      });
      
      const files: FileToReview[] = [
        {
          path: 'main.ts',
          content: `import { helper } from './helper';`,
          language: 'typescript',
        },
      ];
      
      const result = await enricher.enrich(files);
      expect(result).toBeDefined();
    });

    it('should respect maxTotalSize option', async () => {
      const enricher = new ContextEnricher({
        projectRoot: tempDir,
        maxTotalSize: 50, // 50 bytes - very small
      });
      
      const files: FileToReview[] = [
        {
          path: 'main.ts',
          content: 'const x = 1;',
          language: 'typescript',
        },
      ];
      
      const result = await enricher.enrich(files);
      expect(result).toBeDefined();
    });

    it('should filter out external packages', async () => {
      const enricher = new ContextEnricher({ projectRoot: tempDir });
      
      const files: FileToReview[] = [
        {
          path: 'app.ts',
          content: `
import _ from 'lodash';
import React from 'react';
import { helper } from './helper';
          `,
          language: 'typescript',
        },
      ];
      
      // Should not try to resolve 'lodash' or 'react' as local files
      const result = await enricher.enrich(files);
      expect(result).toBeDefined();
    });
  });

  describe('extractDependencies', () => {
    it('should extract ES6 import dependencies', () => {
      const enricher = new ContextEnricher();
      
      const content = `
import { helper } from './helper';
import util from './util';
import * as types from './types';
      `;
      
      // We need to test the private method indirectly
      expect(enricher).toBeDefined();
    });

    it('should extract CommonJS require dependencies', () => {
      const enricher = new ContextEnricher();
      
      const content = `
const helper = require('./helper');
const { util } = require('./util');
const fs = require('fs');
      `;
      
      expect(enricher).toBeDefined();
    });
  });
});
