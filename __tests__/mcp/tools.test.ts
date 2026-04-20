/**
 * tools.test.ts - MCP 工具处理函数测试
 *
 * 测试三个工具的参数校验、正常返回、错误处理场景。
 */

import { handleReviewDiff, reviewDiffSchema } from '../../src/mcp/tools/review-diff';
import { handleReviewFiles, reviewFilesSchema } from '../../src/mcp/tools/review-files';
import {
  handleConfigure,
  configureSchema,
  getRuntimeConfig,
  resetRuntimeConfig,
} from '../../src/mcp/tools/configure';

// mock ReviewOrchestrator 避免真实 API 调用
jest.mock('../../src/orchestrator', () => {
  const original = jest.requireActual('../../src/orchestrator');
  return {
    ...original,
    ReviewOrchestrator: jest.fn().mockImplementation(() => ({
      run: jest.fn().mockResolvedValue({
        issues: [
          {
            id: 'issue-1',
            file: 'test.ts',
            line: 10,
            severity: 'high',
            dimension: 'logic',
            description: '测试问题描述',
            suggestion: '修复建议',
            confidence: 0.9,
          },
        ],
        summary: {
          totalIssues: 1,
          bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
          byDimension: {
            logic: 1,
            security: 0,
            performance: 0,
            maintainability: 0,
            edge_cases: 0,
            'adversary-found': 0,
          },
        },
        metadata: {
          durationMs: 1000,
          tokenUsage: { input: 100, output: 50, total: 150 },
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          agents: ['logic-agent'],
        },
      }),
      getConfig: jest.fn().mockReturnValue({}),
    })),
  };
});

// mock FileCollector
jest.mock('../../src/input', () => {
  const original = jest.requireActual('../../src/input');
  return {
    ...original,
    FileCollector: jest.fn().mockImplementation(() => ({
      collect: jest.fn().mockResolvedValue([
        {
          path: 'test.ts',
          content: 'console.log("hello");',
          language: 'typescript',
        },
      ]),
    })),
    GitDiffCollector: jest.fn().mockImplementation(() => ({
      parseDiff: jest.fn().mockReturnValue([
        {
          file: 'test.ts',
          oldStart: 1,
          oldCount: 1,
          newStart: 1,
          newCount: 2,
          lines: [
            { type: 'remove', content: 'old line' },
            { type: 'add', content: 'new line 1' },
            { type: 'add', content: 'new line 2' },
          ],
        },
      ]),
      hunksToFileToReview: jest.fn().mockReturnValue([
        {
          path: 'test.ts',
          diff: '@@ -1,1 +1,2 @@\n-old line\n+new line 1\n+new line 2\n',
          language: 'typescript',
        },
      ]),
    })),
  };
});

describe('MCP Tools', () => {
  describe('review_diff', () => {
    describe('schema', () => {
      it('review_diff schema 应包含 diff 必填字段', () => {
        expect(reviewDiffSchema.diff).toBeDefined();
      });

      it('review_diff schema 应包含可选的 severity_threshold', () => {
        expect(reviewDiffSchema.severity_threshold).toBeDefined();
      });

      it('review_diff schema 应包含可选的 dimensions', () => {
        expect(reviewDiffSchema.dimensions).toBeDefined();
      });

      it('review_diff schema 应包含 enable_adversary 默认 true', () => {
        expect(reviewDiffSchema.enable_adversary).toBeDefined();
      });

      it('review_diff schema 应包含 enable_meta_review 默认 false', () => {
        expect(reviewDiffSchema.enable_meta_review).toBeDefined();
      });

      it('review_diff schema 应包含 max_adversary_rounds', () => {
        expect(reviewDiffSchema.max_adversary_rounds).toBeDefined();
      });
    });

    describe('正常返回', () => {
      it('应该返回包含 markdown 报告的 content', async () => {
        const result = await handleReviewDiff({
          diff: 'diff --git a/test.ts b/test.ts\n--- a/test.ts\n+++ b/test.ts\n@@ -1 +1,2 @@\n-old\n+new1\n+new2',
        });

        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('审查报告');
        expect(result.isError).toBeUndefined();
      });

      it('报告应该包含 issue 列表', async () => {
        const result = await handleReviewDiff({
          diff: 'diff content',
        });

        expect(result.content[0].text).toContain('问题');
      });
    });

    describe('错误处理', () => {
      it('编排器异常时应返回 isError: true', async () => {
        // 让 orchestrator.run 抛出异常
        const { ReviewOrchestrator } = require('../../src/orchestrator');
        ReviewOrchestrator.mockImplementationOnce(() => ({
          run: jest.fn().mockRejectedValue(new Error('API 调用失败')),
          getConfig: jest.fn().mockReturnValue({}),
        }));

        const result = await handleReviewDiff({ diff: 'bad diff' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('审查执行失败');
      });
    });
  });

  describe('review_files', () => {
    describe('schema', () => {
      it('review_files schema 应包含 paths 必填字段', () => {
        expect(reviewFilesSchema.paths).toBeDefined();
      });

      it('review_files schema 应包含可选的 severity_threshold', () => {
        expect(reviewFilesSchema.severity_threshold).toBeDefined();
      });

      it('review_files schema 应包含可选的 dimensions', () => {
        expect(reviewFilesSchema.dimensions).toBeDefined();
      });

      it('review_files schema 应包含 enable_adversary', () => {
        expect(reviewFilesSchema.enable_adversary).toBeDefined();
      });

      it('review_files schema 应包含 enable_meta_review', () => {
        expect(reviewFilesSchema.enable_meta_review).toBeDefined();
      });

      it('review_files schema 应包含 max_adversary_rounds', () => {
        expect(reviewFilesSchema.max_adversary_rounds).toBeDefined();
      });
    });

    describe('正常返回', () => {
      it('应该返回包含 markdown 报告的 content', async () => {
        const result = await handleReviewFiles({
          paths: ['src/test.ts'],
        });

        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('审查报告');
        expect(result.isError).toBeUndefined();
      });

      it('报告应该包含 summary', async () => {
        const result = await handleReviewFiles({
          paths: ['src/test.ts'],
        });

        expect(result.content[0].text).toContain('摘要');
      });
    });

    describe('参数校验', () => {
      it('空 paths 应返回 isError: true', async () => {
        const result = await handleReviewFiles({ paths: [] });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('paths');
      });
    });

    describe('错误处理', () => {
      it('编排器异常时应返回 isError: true', async () => {
        const { ReviewOrchestrator } = require('../../src/orchestrator');
        ReviewOrchestrator.mockImplementationOnce(() => ({
          run: jest.fn().mockRejectedValue(new Error('文件不存在')),
          getConfig: jest.fn().mockReturnValue({}),
        }));

        const result = await handleReviewFiles({ paths: ['/nonexistent/file.ts'] });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('审查执行失败');
      });
    });

    describe('isError on agent failures', () => {
      /**
       * 构造带 incompleteAgents 的 mock report
       */
      function makeReport(agents: string[], failedAgentIds: string[]) {
        return {
          issues: [],
          summary: {
            totalIssues: 0,
            bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
            byDimension: {
              logic: 0,
              security: 0,
              performance: 0,
              maintainability: 0,
              edge_cases: 0,
              'adversary-found': 0,
            },
          },
          metadata: {
            durationMs: 1000,
            tokenUsage: { input: 0, output: 0, total: 0 },
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            agents,
            incompleteAgents: failedAgentIds.map((id) => ({
              agentId: id,
              error: `${id} timeout after 300000ms`,
              durationMs: 300000,
            })),
          },
        };
      }

      it('100% agent 失败时应标 isError: true', async () => {
        const { ReviewOrchestrator } = require('../../src/orchestrator');
        const agents = ['logic-agent', 'security-agent', 'performance-agent'];
        ReviewOrchestrator.mockImplementationOnce(() => ({
          run: jest.fn().mockResolvedValue(makeReport(agents, agents)),
          getConfig: jest.fn().mockReturnValue({}),
        }));

        const result = await handleReviewFiles({ paths: ['src/test.ts'] });

        expect(result.isError).toBe(true);
        // Markdown 顶部应含警告
        expect(result.content[0].text).toContain('审查未完整执行');
      });

      it('部分 agent 失败时 isError 应缺省（不标红）', async () => {
        const { ReviewOrchestrator } = require('../../src/orchestrator');
        const agents = ['logic-agent', 'security-agent', 'performance-agent'];
        ReviewOrchestrator.mockImplementationOnce(() => ({
          run: jest.fn().mockResolvedValue(makeReport(agents, ['logic-agent'])),
          getConfig: jest.fn().mockReturnValue({}),
        }));

        const result = await handleReviewFiles({ paths: ['src/test.ts'] });

        // 部分失败：让 markdown 警告提醒用户，但工具调用语义仍成功
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('审查未完整执行');
      });

      it('无失败时 isError 应缺省', async () => {
        // 默认 mock 没有 incompleteAgents，走此分支
        const result = await handleReviewFiles({ paths: ['src/test.ts'] });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).not.toContain('审查未完整执行');
      });
    });
  });

  describe('configure', () => {
    beforeEach(() => {
      resetRuntimeConfig();
    });

    describe('schema', () => {
      it('configure schema 应包含 action 必填字段', () => {
        expect(configureSchema.action).toBeDefined();
      });

      it('configure schema 应包含可选的 config 字段', () => {
        expect(configureSchema.config).toBeDefined();
      });
    });

    describe('get 操作', () => {
      it('应该返回当前完整配置 JSON', async () => {
        const result = await handleConfigure({ action: 'get' });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].type).toBe('text');

        // 应该是合法 JSON
        const config = JSON.parse(result.content[0].text);
        expect(config).toBeDefined();
        // model 默认为空，运行时由 provider.defaultModel 兜底
        expect(config.model).toBeUndefined();
        expect(config.enableAdversary).toBeDefined();
      });

      it('get 返回的配置应该包含默认值', async () => {
        const result = await handleConfigure({ action: 'get' });
        const config = JSON.parse(result.content[0].text);

        expect(config.maxParallel).toBe(5);
        expect(config.enableAdversary).toBe(true);
        expect(config.maxAdversaryRounds).toBe(1);
      });
    });

    describe('set 操作', () => {
      it('应该成功修改配置', async () => {
        const result = await handleConfigure({
          action: 'set',
          config: { enableAdversary: false, maxAdversaryRounds: 3 },
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('配置已更新');

        // 验证配置已更新
        const getResult = await handleConfigure({ action: 'get' });
        const config = JSON.parse(getResult.content[0].text);
        expect(config.enableAdversary).toBe(false);
        expect(config.maxAdversaryRounds).toBe(3);
      });

      it('set 无 config 参数应返回 isError', async () => {
        const result = await handleConfigure({ action: 'set' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('config');
      });

      it('set 空 config 对象应返回 isError', async () => {
        const result = await handleConfigure({ action: 'set', config: {} });

        expect(result.isError).toBe(true);
      });

      it('多次 set 应该累积合并配置', async () => {
        await handleConfigure({
          action: 'set',
          config: { enableAdversary: false },
        });
        await handleConfigure({
          action: 'set',
          config: { maxAdversaryRounds: 4 },
        });

        const result = await handleConfigure({ action: 'get' });
        const config = JSON.parse(result.content[0].text);
        expect(config.enableAdversary).toBe(false);
        expect(config.maxAdversaryRounds).toBe(4);
      });
    });

    describe('getRuntimeConfig / resetRuntimeConfig', () => {
      it('getRuntimeConfig 应返回当前运行时配置', () => {
        const config = getRuntimeConfig();
        expect(config).toBeDefined();
        expect(typeof config).toBe('object');
      });

      it('resetRuntimeConfig 应重置为空配置', async () => {
        await handleConfigure({
          action: 'set',
          config: { enableAdversary: false },
        });
        resetRuntimeConfig();

        const result = await handleConfigure({ action: 'get' });
        const config = JSON.parse(result.content[0].text);
        expect(config.enableAdversary).toBe(true); // 回到默认值
      });
    });
  });
});
