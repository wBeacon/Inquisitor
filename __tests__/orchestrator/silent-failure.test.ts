import { ReviewOrchestrator } from '../../src/orchestrator/orchestrator';
import { ReviewRequest } from '../../src/types';

// Mock Anthropic SDK：orchestrator 不显式指定 provider 时，createProvider 会 fallback 到 anthropic
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  }));
});

const MockAnthropic = jest.requireMock('@anthropic-ai/sdk') as jest.Mock;

function createTestRequest(): ReviewRequest {
  return {
    files: [{ path: 'test.ts', content: 'const x = 1;' }],
    context: {
      contextLines: 3,
      includeFullFile: false,
      includeDependencies: false,
      projectRoot: '/tmp/test',
    },
    mode: 'review',
  };
}

/**
 * 直接/间接守护"审查结果包含失败信息"的数据链路：
 *   ParallelScheduler / AgentRunner 产生 success:false
 *   -> orchestrator.executeDimensionAgents & executeAdversaryReview 同步写入 context.agentFailures
 *   -> generateMetadata 导出到 report.metadata.incompleteAgents
 * 没这一链，调用方会把超时/异常误读为 "代码无问题"。
 */
describe('Silent failure surfacing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records all dimension agents as incompleteAgents when every LLM call fails', async () => {
    const mockCreate = jest.fn().mockRejectedValue(new Error('Mock LLM API error'));
    MockAnthropic.mockImplementation(() => ({
      messages: { create: mockCreate },
    }));

    const orchestrator = new ReviewOrchestrator({
      enableAdversary: false,
      enableMetaReview: false,
    });

    const report = await orchestrator.run(createTestRequest());

    expect(report.metadata.incompleteAgents).toBeDefined();
    // 五个维度 Agent 全部失败
    expect(report.metadata.incompleteAgents!.length).toBe(5);

    const failedIds = report.metadata.incompleteAgents!.map((f) => f.agentId).sort();
    expect(failedIds).toEqual([
      'edge-case-agent',
      'logic-agent',
      'maintainability-agent',
      'performance-agent',
      'security-agent',
    ]);

    for (const f of report.metadata.incompleteAgents!) {
      expect(f.error).toContain('Mock LLM API error');
      expect(typeof f.durationMs).toBe('number');
      expect(f.durationMs).toBeGreaterThanOrEqual(0);
    }

    expect(report.summary.totalIssues).toBe(0);
  });

  it('records adversary agent failure in incompleteAgents (dimension agents succeeded)', async () => {
    let callCount = 0;
    const mockCreate = jest.fn().mockImplementation(() => {
      callCount++;
      // 五个维度 Agent 正常返回空 issues
      if (callCount <= 5) {
        return Promise.resolve({
          content: [{ type: 'text', text: '[]' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });
      }
      // 对抗 Agent API 失败
      return Promise.reject(new Error('Adversary API blew up'));
    });
    MockAnthropic.mockImplementation(() => ({
      messages: { create: mockCreate },
    }));

    const orchestrator = new ReviewOrchestrator({
      enableAdversary: true,
      enableMetaReview: false,
      maxAdversaryRounds: 1,
    });

    const report = await orchestrator.run(createTestRequest());

    expect(report.metadata.incompleteAgents).toBeDefined();
    const failedIds = report.metadata.incompleteAgents!.map((f) => f.agentId);
    expect(failedIds).toContain('adversary-agent');

    const adv = report.metadata.incompleteAgents!.find((f) => f.agentId === 'adversary-agent');
    expect(adv).toBeDefined();
    expect(adv!.error).toContain('Adversary API blew up');
  });

  it('does not set incompleteAgents when everything succeeds (regression guard)', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: '[]' }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });
    MockAnthropic.mockImplementation(() => ({
      messages: { create: mockCreate },
    }));

    const orchestrator = new ReviewOrchestrator({
      enableAdversary: false,
      enableMetaReview: false,
    });

    const report = await orchestrator.run(createTestRequest());

    // 全部成功时不应写入 incompleteAgents（undefined 允许 ?.length 短路）
    expect(report.metadata.incompleteAgents).toBeUndefined();
  });

  it('records only the failing agents when some succeed and some fail', async () => {
    let callCount = 0;
    const mockCreate = jest.fn().mockImplementation(() => {
      callCount++;
      // 前两次调用失败（对应并行执行的前两个 Agent），其余成功
      // ParallelScheduler 使用 Promise.all，所以调用顺序对应 dimensionAgents 的顺序
      if (callCount <= 2) {
        return Promise.reject(new Error(`Agent ${callCount} failure`));
      }
      return Promise.resolve({
        content: [{ type: 'text', text: '[]' }],
        usage: { input_tokens: 10, output_tokens: 10 },
      });
    });
    MockAnthropic.mockImplementation(() => ({
      messages: { create: mockCreate },
    }));

    const orchestrator = new ReviewOrchestrator({
      enableAdversary: false,
      enableMetaReview: false,
    });

    const report = await orchestrator.run(createTestRequest());

    // 确保部分失败被准确反映：至少有 1 个失败、少于 agents 总数
    expect(report.metadata.incompleteAgents).toBeDefined();
    expect(report.metadata.incompleteAgents!.length).toBeGreaterThanOrEqual(1);
    expect(report.metadata.incompleteAgents!.length).toBeLessThan(report.metadata.agents.length);
    for (const f of report.metadata.incompleteAgents!) {
      expect(f.error).toMatch(/Agent \d failure/);
    }
  });
});
