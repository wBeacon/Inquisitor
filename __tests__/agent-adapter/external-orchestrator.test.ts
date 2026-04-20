import { ExternalOrchestrator } from '../../src/agent-adapter/external-orchestrator';
import { ReviewRequest } from '../../src/types';

// 模拟 fetch
global.fetch = jest.fn();

describe('ExternalOrchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create instance with valid config', () => {
      const config = {
        baseUrl: 'http://localhost:3000',
      };

      const orchestrator = new ExternalOrchestrator(config);

      expect(orchestrator).toBeDefined();
    });

    it('should remove trailing slash from baseUrl', () => {
      const config = {
        baseUrl: 'http://localhost:3000/',
      };

      const orchestrator = new ExternalOrchestrator(config);

      expect(orchestrator).toBeDefined();
    });

    it('should accept API key in config', () => {
      const config = {
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key-123',
      };

      const orchestrator = new ExternalOrchestrator(config);

      expect(orchestrator).toBeDefined();
    });

    it('should accept custom timeout', () => {
      const config = {
        baseUrl: 'http://localhost:3000',
        timeout: 30000,
      };

      const orchestrator = new ExternalOrchestrator(config);

      expect(orchestrator).toBeDefined();
    });
  });

  describe('run method', () => {
    it('should send POST request to /api/review', async () => {
      const config = {
        baseUrl: 'http://localhost:3000',
      };

      const orchestrator = new ExternalOrchestrator(config);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => ({
          issues: [],
          summary: { totalIssues: 0, bySeverity: {}, byDimension: {} },
          metadata: {
            durationMs: 100,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            tokenUsage: { input: 0, output: 0, total: 0 },
            agents: [],
          },
        }),
      });

      const request: ReviewRequest = {
        files: [{ path: 'test.ts', content: 'const x = 1;' }],
        context: { contextLines: 50, projectRoot: '/tmp', includeFullFile: true, includeDependencies: true },
        mode: 'review',
      };

      await orchestrator.run(request);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/review',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should include Authorization header when API key provided', async () => {
      const config = {
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key-123',
      };

      const orchestrator = new ExternalOrchestrator(config);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => ({
          issues: [],
          summary: { totalIssues: 0, bySeverity: {}, byDimension: {} },
          metadata: {
            durationMs: 100,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            tokenUsage: { input: 0, output: 0, total: 0 },
            agents: [],
          },
        }),
      });

      const request: ReviewRequest = {
        files: [{ path: 'test.ts', content: 'const x = 1;' }],
        context: { contextLines: 50, projectRoot: '/tmp', includeFullFile: true, includeDependencies: true },
        mode: 'review',
      };

      await orchestrator.run(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key-123',
          }),
        })
      );
    });

    it('should send request body as JSON', async () => {
      const config = {
        baseUrl: 'http://localhost:3000',
      };

      const orchestrator = new ExternalOrchestrator(config);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => ({
          issues: [],
          summary: { totalIssues: 0, bySeverity: {}, byDimension: {} },
          metadata: {
            durationMs: 100,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            tokenUsage: { input: 0, output: 0, total: 0 },
            agents: [],
          },
        }),
      });

      const request: ReviewRequest = {
        files: [{ path: 'test.ts', content: 'const x = 1;' }],
        context: { contextLines: 50, projectRoot: '/tmp', includeFullFile: true, includeDependencies: true },
        mode: 'review',
      };

      await orchestrator.run(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(request),
        })
      );
    });

    it('should return parsed JSON response on success', async () => {
      const config = {
        baseUrl: 'http://localhost:3000',
      };

      const orchestrator = new ExternalOrchestrator(config);

      const expectedReport = {
        issues: [],
        summary: { totalIssues: 0, bySeverity: {}, byDimension: {} },
        metadata: {
          durationMs: 100,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          tokenUsage: { input: 0, output: 0, total: 0 },
          agents: [],
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => expectedReport,
      });

      const request: ReviewRequest = {
        files: [{ path: 'test.ts', content: 'const x = 1;' }],
        context: { contextLines: 50, projectRoot: '/tmp', includeFullFile: true, includeDependencies: true },
        mode: 'review',
      };

      const result = await orchestrator.run(request);

      expect(result).toEqual(expectedReport);
    });

    it('should throw error on non-ok response', async () => {
      const config = {
        baseUrl: 'http://localhost:3000',
      };

      const orchestrator = new ExternalOrchestrator(config);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const request: ReviewRequest = {
        files: [{ path: 'test.ts', content: 'const x = 1;' }],
        context: { contextLines: 50, projectRoot: '/tmp', includeFullFile: true, includeDependencies: true },
        mode: 'review',
      };

      await expect(orchestrator.run(request)).rejects.toThrow(
        'External orchestrator failed: 500 Internal Server Error'
      );
    });

    it('should throw error on network failure', async () => {
      const config = {
        baseUrl: 'http://localhost:3000',
      };

      const orchestrator = new ExternalOrchestrator(config);

      (global.fetch as jest.Mock).mockRejectedValue(
        new TypeError('fetch failed')
      );

      const request: ReviewRequest = {
        files: [{ path: 'test.ts', content: 'const x = 1;' }],
        context: { contextLines: 50, projectRoot: '/tmp', includeFullFile: true, includeDependencies: true },
        mode: 'review',
      };

      await expect(orchestrator.run(request)).rejects.toThrow(
        /Failed to connect to external orchestrator/
      );
    });
  });

  describe('URL handling', () => {
    it('should handle URLs with and without trailing slash', () => {
      const orchestrator1 = new ExternalOrchestrator({
        baseUrl: 'http://localhost:3000',
      });

      const orchestrator2 = new ExternalOrchestrator({
        baseUrl: 'http://localhost:3000/',
      });

      expect(orchestrator1).toBeDefined();
      expect(orchestrator2).toBeDefined();
    });

    it('should handle URLs with multiple trailing slashes', () => {
      const orchestrator = new ExternalOrchestrator({
        baseUrl: 'http://localhost:3000///',
      });

      expect(orchestrator).toBeDefined();
    });
  });
});
