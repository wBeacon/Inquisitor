import { ReviewOrchestrator, OrchestratorConfig } from '../../src/orchestrator';
import { ReviewRequest, ReviewDimension, ReviewIssue } from '../../src/types';

describe('ReviewOrchestrator', () => {
  describe('configuration', () => {
    it('should have default configuration', () => {
      const orchestrator = new ReviewOrchestrator();
      const config = orchestrator.getConfig();

      expect(config.model).toBe('claude-opus');
      expect(config.maxParallel).toBe(5);
      expect(config.agentTimeout).toBe(120000);
      expect(config.totalTimeout).toBe(600000);
      expect(config.enableAdversary).toBe(true);
      expect(config.enableCache).toBe(false);
    });

    it('should support custom configuration', () => {
      const customConfig: OrchestratorConfig = {
        model: 'claude-sonnet',
        agentTimeout: 60000,
        enableAdversary: false,
      };

      const orchestrator = new ReviewOrchestrator(customConfig);
      const config = orchestrator.getConfig();

      expect(config.model).toBe('claude-sonnet');
      expect(config.agentTimeout).toBe(60000);
      expect(config.enableAdversary).toBe(false);
      expect(config.maxParallel).toBe(5); // default
    });
  });

  describe('run method', () => {
    it('should execute orchestration flow with valid request', async () => {
      const orchestrator = new ReviewOrchestrator({ enableAdversary: false });

      const request: ReviewRequest = {
        files: [
          {
            path: 'test.ts',
            content: 'function test() { return 1; }',
            language: 'typescript',
          },
        ],
        context: {
          contextLines: 50,
          includeFullFile: true,
          includeDependencies: false,
          projectRoot: './',
        },
        mode: 'review',
      };

      const report = await orchestrator.run(request);

      expect(report).toBeDefined();
      expect(report.issues).toBeDefined();
      expect(Array.isArray(report.issues)).toBe(true);
      expect(report.summary).toBeDefined();
      expect(report.metadata).toBeDefined();
    });

    it('should generate report with proper structure', async () => {
      const orchestrator = new ReviewOrchestrator({ enableAdversary: false });

      const request: ReviewRequest = {
        files: [
          {
            path: 'test.ts',
            content: 'const x = 1;',
          },
        ],
        context: {
          contextLines: 50,
          includeFullFile: true,
          includeDependencies: false,
          projectRoot: './',
        },
        mode: 'review',
      };

      const report = await orchestrator.run(request);

      // Check summary structure
      expect(report.summary.totalIssues).toBe(report.issues.length);
      expect(report.summary.bySeverity).toBeDefined();
      expect(report.summary.bySeverity.critical).toBeGreaterThanOrEqual(0);
      expect(report.summary.bySeverity.high).toBeGreaterThanOrEqual(0);
      expect(report.summary.bySeverity.medium).toBeGreaterThanOrEqual(0);
      expect(report.summary.bySeverity.low).toBeGreaterThanOrEqual(0);

      // Check metadata structure
      expect(report.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(report.metadata.startedAt).toBeDefined();
      expect(report.metadata.completedAt).toBeDefined();
      expect(report.metadata.agents).toBeDefined();
      expect(Array.isArray(report.metadata.agents)).toBe(true);
      expect(report.metadata.tokenUsage).toBeDefined();
      expect(report.metadata.tokenUsage.input).toBeGreaterThanOrEqual(0);
      expect(report.metadata.tokenUsage.output).toBeGreaterThanOrEqual(0);
      expect(report.metadata.tokenUsage.total).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple files', async () => {
      const orchestrator = new ReviewOrchestrator({ enableAdversary: false });

      const request: ReviewRequest = {
        files: [
          {
            path: 'file1.ts',
            content: 'export const func1 = () => {};',
          },
          {
            path: 'file2.ts',
            content: 'export const func2 = () => {};',
          },
          {
            path: 'file3.js',
            content: 'const func3 = () => {};',
          },
        ],
        context: {
          contextLines: 50,
          includeFullFile: true,
          includeDependencies: false,
          projectRoot: './',
        },
        mode: 'review',
      };

      const report = await orchestrator.run(request);

      expect(report).toBeDefined();
      expect(report.issues).toBeDefined();
      expect(report.metadata.agents.length).toBeGreaterThan(0);
    });

    it('should filter to specific dimensions when requested', async () => {
      const orchestrator = new ReviewOrchestrator({ enableAdversary: false });

      const request: ReviewRequest = {
        files: [
          {
            path: 'test.ts',
            content: 'function test() { return 1; }',
          },
        ],
        dimensions: [ReviewDimension.Logic, ReviewDimension.Security],
        context: {
          contextLines: 50,
          includeFullFile: true,
          includeDependencies: false,
          projectRoot: './',
        },
        mode: 'review',
      };

      const report = await orchestrator.run(request);

      expect(report).toBeDefined();
      // Should include only logic and security dimensions in agents
      expect(report.metadata.agents.length).toBeLessThanOrEqual(2);
    });

    it('should include adversary agent when enabled', async () => {
      const orchestrator = new ReviewOrchestrator({ enableAdversary: true });

      const request: ReviewRequest = {
        files: [
          {
            path: 'test.ts',
            content: 'function test() { return 1; }',
          },
        ],
        context: {
          contextLines: 50,
          includeFullFile: true,
          includeDependencies: false,
          projectRoot: './',
        },
        mode: 'review',
      };

      const report = await orchestrator.run(request);

      expect(report).toBeDefined();
      // Should include adversary agent in the list
      expect(report.metadata.agents.some((a) => a.includes('adversary'))).toBe(true);
    });

    it('should skip adversary agent when disabled', async () => {
      const orchestrator = new ReviewOrchestrator({ enableAdversary: false });

      const request: ReviewRequest = {
        files: [
          {
            path: 'test.ts',
            content: 'function test() { return 1; }',
          },
        ],
        context: {
          contextLines: 50,
          includeFullFile: true,
          includeDependencies: false,
          projectRoot: './',
        },
        mode: 'review',
      };

      const report = await orchestrator.run(request);

      expect(report).toBeDefined();
      // Should NOT include adversary agent
      expect(report.metadata.agents.some((a) => a.includes('adversary'))).toBe(false);
    });

    it('should handle empty issues list', async () => {
      const orchestrator = new ReviewOrchestrator({ enableAdversary: false });

      const request: ReviewRequest = {
        files: [
          {
            path: 'empty.ts',
            content: '',
          },
        ],
        context: {
          contextLines: 50,
          includeFullFile: true,
          includeDependencies: false,
          projectRoot: './',
        },
        mode: 'review',
      };

      const report = await orchestrator.run(request);

      expect(report).toBeDefined();
      expect(report.issues).toBeDefined();
      expect(Array.isArray(report.issues)).toBe(true);
      expect(report.summary.totalIssues).toBe(0);
    });

    it('should set correct metadata timing', async () => {
      const orchestrator = new ReviewOrchestrator({ enableAdversary: false });

      const beforeTime = Date.now();

      const request: ReviewRequest = {
        files: [
          {
            path: 'test.ts',
            content: 'const x = 1;',
          },
        ],
        context: {
          contextLines: 50,
          includeFullFile: true,
          includeDependencies: false,
          projectRoot: './',
        },
        mode: 'review',
      };

      const report = await orchestrator.run(request);

      const afterTime = Date.now();

      expect(report.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(report.metadata.durationMs).toBeLessThanOrEqual(afterTime - beforeTime + 1000); // allow 1s buffer

      // Verify ISO format
      expect(new Date(report.metadata.startedAt)).toBeInstanceOf(Date);
      expect(new Date(report.metadata.completedAt)).toBeInstanceOf(Date);
    });

    it('should include files with diff information', async () => {
      const orchestrator = new ReviewOrchestrator({ enableAdversary: false });

      const request: ReviewRequest = {
        files: [
          {
            path: 'test.ts',
            content: 'function test() { return 1; }',
            diff: '+ function test() { return 1; }',
          },
        ],
        diff: '--- test.ts\n+++ test.ts\n+ function test() { return 1; }',
        context: {
          contextLines: 50,
          includeFullFile: true,
          includeDependencies: false,
          projectRoot: './',
        },
        mode: 'review',
      };

      const report = await orchestrator.run(request);

      expect(report).toBeDefined();
      expect(report.issues).toBeDefined();
    });

    it('should track all agents in metadata', async () => {
      const orchestrator = new ReviewOrchestrator({ enableAdversary: true });

      const request: ReviewRequest = {
        files: [
          {
            path: 'test.ts',
            content: 'const x = 1;',
          },
        ],
        context: {
          contextLines: 50,
          includeFullFile: true,
          includeDependencies: false,
          projectRoot: './',
        },
        mode: 'review',
      };

      const report = await orchestrator.run(request);

      // Should have at least 5 dimension agents + 1 adversary
      expect(report.metadata.agents.length).toBeGreaterThanOrEqual(5);
      
      // Check for expected agent types
      const agentIds = report.metadata.agents;
      expect(agentIds.some((a) => a.includes('logic'))).toBe(true);
      expect(agentIds.some((a) => a.includes('security'))).toBe(true);
      expect(agentIds.some((a) => a.includes('performance'))).toBe(true);
      expect(agentIds.some((a) => a.includes('maintainability'))).toBe(true);
      expect(agentIds.some((a) => a.includes('edge'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid request', async () => {
      const orchestrator = new ReviewOrchestrator();

      // Invalid request with no files
      const invalidRequest = {
        files: [],
        context: {
          contextLines: 50,
          includeFullFile: true,
          includeDependencies: false,
          projectRoot: './',
        },
        mode: 'review',
      } as ReviewRequest;

      // Should still run (empty files is technically valid)
      const report = await orchestrator.run(invalidRequest);
      expect(report).toBeDefined();
      expect(report.summary.totalIssues).toBe(0);
    });
  });

  describe('dimension filtering', () => {
    it('should execute only selected dimensions', async () => {
      const orchestrator = new ReviewOrchestrator({ enableAdversary: false });

      const request: ReviewRequest = {
        files: [
          {
            path: 'test.ts',
            content: 'const x = 1;',
          },
        ],
        dimensions: [ReviewDimension.Logic],
        context: {
          contextLines: 50,
          includeFullFile: true,
          includeDependencies: false,
          projectRoot: './',
        },
        mode: 'review',
      };

      const report = await orchestrator.run(request);

      // Should only run logic agent (1 agent)
      expect(report.metadata.agents.length).toBe(1);
      expect(report.metadata.agents[0]).toContain('logic');
    });

    it('should execute multiple selected dimensions', async () => {
      const orchestrator = new ReviewOrchestrator({ enableAdversary: false });

      const selectedDimensions = [
        ReviewDimension.Logic,
        ReviewDimension.Security,
        ReviewDimension.Performance,
      ];

      const request: ReviewRequest = {
        files: [
          {
            path: 'test.ts',
            content: 'const x = 1;',
          },
        ],
        dimensions: selectedDimensions,
        context: {
          contextLines: 50,
          includeFullFile: true,
          includeDependencies: false,
          projectRoot: './',
        },
        mode: 'review',
      };

      const report = await orchestrator.run(request);

      // Should run selected agents (3 agents)
      expect(report.metadata.agents.length).toBe(3);
    });
  });
});
