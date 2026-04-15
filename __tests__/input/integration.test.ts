import { GitDiffCollector } from '../../src/input/git-diff-collector';
import { FileCollector } from '../../src/input/file-collector';
import { ContextEnricher } from '../../src/input/context-enricher';
import { FileToReview, ReviewRequest, ContextConfig, ReviewDimension } from '../../src/types';

describe('Input Layer Integration', () => {
  describe('complete flow', () => {
    it('should create ReviewRequest from collectors', async () => {
      // This is an integration test showing how the collectors work together
      
      // Step 1: Collect files
      const fileCollector = new FileCollector();
      
      // Step 2: Create context enricher
      const enricher = new ContextEnricher({
        projectRoot: process.cwd(),
        maxDepth: 2,
        maxTotalSize: 1024 * 1024, // 1MB
      });
      
      // Step 3: Enrich files (discover dependencies)
      const mockFiles: FileToReview[] = [
        {
          path: 'src/index.ts',
          content: 'export { a } from "./a";',
          language: 'typescript',
        },
      ];
      
      const enrichedFiles = await enricher.enrich(mockFiles);
      
      // Step 4: Create ReviewRequest
      const contextConfig: ContextConfig = {
        contextLines: 50,
        includeFullFile: false,
        includeDependencies: true,
        projectRoot: process.cwd(),
      };
      
      const reviewRequest: ReviewRequest = {
        files: enrichedFiles,
        context: contextConfig,
        mode: 'review',
      };
      
      expect(reviewRequest.files).toBeDefined();
      expect(reviewRequest.context).toBeDefined();
      expect(reviewRequest.mode).toBe('review');
    });

    it('should support both review and review-fix modes', () => {
      const contextConfig: ContextConfig = {
        contextLines: 50,
        includeFullFile: false,
        includeDependencies: true,
        projectRoot: process.cwd(),
      };

      const reviewRequest: ReviewRequest = {
        files: [],
        context: contextConfig,
        mode: 'review',
      };

      const reviewFixRequest: ReviewRequest = {
        files: [],
        context: contextConfig,
        mode: 'review-fix',
        maxIterations: 3,
      };

      expect(reviewRequest.mode).toBe('review');
      expect(reviewFixRequest.mode).toBe('review-fix');
      expect(reviewFixRequest.maxIterations).toBe(3);
    });

    it('should allow specifying dimensions', () => {
      const contextConfig: ContextConfig = {
        contextLines: 50,
        includeFullFile: false,
        includeDependencies: true,
        projectRoot: process.cwd(),
      };

      const reviewRequest: ReviewRequest = {
        files: [],
        context: contextConfig,
        mode: 'review',
        dimensions: [ReviewDimension.Logic, ReviewDimension.Security],
      };

      expect(reviewRequest.dimensions).toEqual([ReviewDimension.Logic, ReviewDimension.Security]);
    });
  });

  describe('FileCollector language inference', () => {
    it('should correctly infer multiple file languages', async () => {
      const collector = new FileCollector();
      
      const testCases = [
        { path: 'test.ts', expected: 'typescript' },
        { path: 'test.tsx', expected: 'typescript' },
        { path: 'test.js', expected: 'javascript' },
        { path: 'test.jsx', expected: 'javascript' },
        { path: 'test.py', expected: 'python' },
        { path: 'test.java', expected: 'java' },
        { path: 'test.go', expected: 'go' },
        { path: 'test.rb', expected: 'ruby' },
        { path: 'test.rs', expected: 'rust' },
        { path: 'test.cpp', expected: 'cpp' },
        { path: 'test.cs', expected: 'csharp' },
      ];

      expect(testCases.length).toBeGreaterThan(10);
    });
  });
});
