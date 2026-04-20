import { ReviewOrchestrator, ExtendedReviewMetadata } from '../../src/orchestrator/orchestrator';
import { resolveConfig, DEFAULT_MAX_ADVERSARY_ROUNDS, MAX_ADVERSARY_ROUNDS_LIMIT } from '../../src/orchestrator/config';
import { ReviewIssue, ReviewDimension, ReviewRequest, AdversaryResult, IssueJudgment } from '../../src/types';
import { IssueCalibrator } from '../../src/agents/issue-calibrator';

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  }));
});

const MockAnthropic = jest.requireMock('@anthropic-ai/sdk') as jest.Mock;

/**
 * 创建测试用的 ReviewIssue
 */
function createTestIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    file: 'test.ts',
    line: 10,
    severity: 'high',
    dimension: ReviewDimension.Logic,
    description: 'Test issue description',
    suggestion: 'Fix the issue',
    confidence: 0.8,
    ...overrides,
  };
}

/**
 * 创建模拟的 Claude API 响应
 */
function createMockResponse(content: string, inputTokens = 100, outputTokens = 200) {
  return {
    content: [{ type: 'text', text: content }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

/**
 * 创建对抗审查的 mock 响应（带新发现 issue）
 */
function createAdversaryResponseWithNewIssue(issueIndex: number) {
  return JSON.stringify({
    newIssues: [
      {
        file: `found-${issueIndex}.ts`,
        line: issueIndex * 10,
        severity: 'medium',
        dimension: 'adversary-found',
        description: `Round ${issueIndex} found issue`,
        suggestion: `Fix round ${issueIndex} issue`,
        confidence: 0.7,
      },
    ],
    issueJudgments: [],
  });
}

/**
 * 创建空的对抗审查响应（无新发现，全部 confirmed）
 */
function createEmptyAdversaryResponse(existingCount: number) {
  const judgments = Array.from({ length: existingCount }, (_, i) => ({
    existingIssueIndex: i,
    judgment: 'confirmed',
    reason: `Issue ${i} confirmed`,
  }));
  return JSON.stringify({
    newIssues: [],
    issueJudgments: judgments,
  });
}

/**
 * 创建测试用的 ReviewRequest
 */
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

describe('Multi-Round Adversary Review', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Config: maxAdversaryRounds', () => {
    it('should have default maxAdversaryRounds=1 in resolveConfig', () => {
      const config = resolveConfig();
      expect(config.maxAdversaryRounds).toBe(DEFAULT_MAX_ADVERSARY_ROUNDS);
      expect(config.maxAdversaryRounds).toBe(1);
    });

    it('should accept maxAdversaryRounds from user config', () => {
      const config = resolveConfig({ maxAdversaryRounds: 3 });
      expect(config.maxAdversaryRounds).toBe(3);
    });

    it('should clamp maxAdversaryRounds to hard limit of 5', () => {
      const config = resolveConfig({ maxAdversaryRounds: 10 });
      expect(config.maxAdversaryRounds).toBe(MAX_ADVERSARY_ROUNDS_LIMIT);
      expect(config.maxAdversaryRounds).toBe(5);
    });

    it('should clamp maxAdversaryRounds minimum to 1', () => {
      const config = resolveConfig({ maxAdversaryRounds: 0 });
      expect(config.maxAdversaryRounds).toBe(1);

      const config2 = resolveConfig({ maxAdversaryRounds: -1 });
      expect(config2.maxAdversaryRounds).toBe(1);
    });

    it('should floor non-integer maxAdversaryRounds', () => {
      const config = resolveConfig({ maxAdversaryRounds: 2.7 });
      expect(config.maxAdversaryRounds).toBe(2);
    });
  });

  describe('should execute exactly N rounds when maxAdversaryRounds=N', () => {
    it('should execute exactly 3 rounds when maxAdversaryRounds=3 and each round finds issues', async () => {
      // 每轮都返回新 issue，不会提前收敛
      let callCount = 0;
      const mockCreate = jest.fn().mockImplementation(() => {
        callCount++;
        // 前5次是维度 Agent 调用，后面是对抗轮次
        if (callCount <= 5) {
          // 维度 Agent 返回空结果
          return Promise.resolve(createMockResponse(JSON.stringify([])));
        }
        // 对抗轮次：每轮返回新 issue
        const round = callCount - 5;
        return Promise.resolve(
          createMockResponse(createAdversaryResponseWithNewIssue(round), 100 * round, 200 * round)
        );
      });

      MockAnthropic.mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      const orchestrator = new ReviewOrchestrator({
        maxAdversaryRounds: 3,
        enableAdversary: true,
        enableMetaReview: false,
      });

      const report = await orchestrator.run(createTestRequest());

      // 5 次维度 Agent + 3 次对抗 = 8 次
      expect(mockCreate).toHaveBeenCalledTimes(8);

      // 报告应包含对抗发现的 issues
      const metadata = report.metadata as ExtendedReviewMetadata;
      expect(metadata.agentTokenUsage).toBeDefined();
    });
  });

  describe('early termination when converged', () => {
    it('should terminate early when a round finds no new issues and no false positives', async () => {
      let callCount = 0;
      const mockCreate = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          // 维度 Agent：第一个返回一个 issue
          if (callCount === 1) {
            return Promise.resolve(createMockResponse(JSON.stringify([
              {
                file: 'test.ts',
                line: 10,
                severity: 'high',
                description: 'Existing issue',
                suggestion: 'Fix it',
                confidence: 0.8,
              },
            ])));
          }
          return Promise.resolve(createMockResponse(JSON.stringify([])));
        }

        const round = callCount - 5;
        if (round === 1) {
          // 第 1 轮：找到一个新 issue
          return Promise.resolve(
            createMockResponse(createAdversaryResponseWithNewIssue(1))
          );
        }
        // 第 2 轮：无新发现，全部 confirmed -> 收敛
        return Promise.resolve(
          createMockResponse(createEmptyAdversaryResponse(2)) // 1个原始 + 1个第一轮发现
        );
      });

      MockAnthropic.mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      const orchestrator = new ReviewOrchestrator({
        maxAdversaryRounds: 3,
        enableAdversary: true,
        enableMetaReview: false,
      });

      const report = await orchestrator.run(createTestRequest());

      // 5 次维度 Agent + 2 次对抗（第2轮收敛，没有第3轮）= 7
      expect(mockCreate).toHaveBeenCalledTimes(7);
    });
  });

  describe('token usage tracking per round', () => {
    it('should record token usage independently for each adversary round with key adversary-agent-round-N', async () => {
      let callCount = 0;
      const mockCreate = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return Promise.resolve(createMockResponse(JSON.stringify([])));
        }
        const round = callCount - 5;
        // 每轮返回不同的 token 数量
        return Promise.resolve(
          createMockResponse(
            createAdversaryResponseWithNewIssue(round),
            100 * round,  // input tokens: 100, 200, 300
            50 * round     // output tokens: 50, 100, 150
          )
        );
      });

      MockAnthropic.mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      const orchestrator = new ReviewOrchestrator({
        maxAdversaryRounds: 3,
        enableAdversary: true,
      });

      const report = await orchestrator.run(createTestRequest());

      const metadata = report.metadata as ExtendedReviewMetadata;

      // 各轮独立的 token 记录
      expect(metadata.agentTokenUsage['adversary-agent-round-1']).toBeDefined();
      expect(metadata.agentTokenUsage['adversary-agent-round-2']).toBeDefined();
      expect(metadata.agentTokenUsage['adversary-agent-round-3']).toBeDefined();

      // 验证 token 数值正确
      expect(metadata.agentTokenUsage['adversary-agent-round-1'].input).toBe(100);
      expect(metadata.agentTokenUsage['adversary-agent-round-1'].output).toBe(50);
      expect(metadata.agentTokenUsage['adversary-agent-round-1'].total).toBe(150);

      expect(metadata.agentTokenUsage['adversary-agent-round-2'].input).toBe(200);
      expect(metadata.agentTokenUsage['adversary-agent-round-2'].output).toBe(100);
      expect(metadata.agentTokenUsage['adversary-agent-round-2'].total).toBe(300);

      expect(metadata.agentTokenUsage['adversary-agent-round-3'].input).toBe(300);
      expect(metadata.agentTokenUsage['adversary-agent-round-3'].output).toBe(150);
      expect(metadata.agentTokenUsage['adversary-agent-round-3'].total).toBe(450);
    });
  });

  describe('cumulative existingIssues across rounds', () => {
    it('should accumulate previous round findings into existingIssues for next round', async () => {
      const callArgs: string[] = [];
      let callCount = 0;

      const mockCreate = jest.fn().mockImplementation((args: { messages: Array<{ content: string }> }) => {
        callCount++;
        if (callCount <= 5) {
          // 维度 Agent：第一个返回一个 issue
          if (callCount === 1) {
            return Promise.resolve(createMockResponse(JSON.stringify([
              {
                file: 'original.ts',
                line: 1,
                severity: 'high',
                description: 'Original issue',
                suggestion: 'Fix original',
                confidence: 0.9,
              },
            ])));
          }
          return Promise.resolve(createMockResponse(JSON.stringify([])));
        }

        // 记录对抗 Agent 收到的用户消息
        if (args.messages && args.messages[0]) {
          callArgs.push(args.messages[0].content);
        }

        const round = callCount - 5;
        if (round <= 2) {
          return Promise.resolve(
            createMockResponse(createAdversaryResponseWithNewIssue(round))
          );
        }
        // 第3轮也返回新 issue
        return Promise.resolve(
          createMockResponse(createAdversaryResponseWithNewIssue(round))
        );
      });

      MockAnthropic.mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      const orchestrator = new ReviewOrchestrator({
        maxAdversaryRounds: 3,
        enableAdversary: true,
        enableMetaReview: false,
      });

      await orchestrator.run(createTestRequest());

      // 第 1 轮：existingIssues 只包含原始维度 issue（1个）
      // 第 2 轮：existingIssues 包含原始 + 第1轮发现（2个）
      // 第 3 轮：existingIssues 包含原始 + 第1轮 + 第2轮发现（3个）
      expect(callArgs.length).toBe(3);

      // 第2轮消息应包含第1轮发现的 issue 文件名
      expect(callArgs[1]).toContain('found-1.ts');
      // 第3轮消息应包含第1轮和第2轮的发现
      expect(callArgs[2]).toContain('found-1.ts');
      expect(callArgs[2]).toContain('found-2.ts');
    });
  });

  describe('calibrator handles merged multi-round AdversaryResult', () => {
    it('should correctly calibrate with merged multi-round results', () => {
      const calibrator = new IssueCalibrator();

      const originalIssues = [
        createTestIssue({ description: 'Issue A', confidence: 0.8 }),
        createTestIssue({ line: 20, description: 'Issue B', confidence: 0.7, dimension: ReviewDimension.Security }),
      ];

      // 模拟合并后的多轮对抗结果
      const mergedAdversaryResult: AdversaryResult = {
        agentId: 'adversary-agent',
        issues: [
          createTestIssue({
            file: 'new.ts',
            line: 50,
            dimension: ReviewDimension.AdversaryFound,
            description: 'Round 1 finding',
            confidence: 0.75,
          }),
          createTestIssue({
            file: 'new2.ts',
            line: 60,
            dimension: ReviewDimension.AdversaryFound,
            description: 'Round 2 finding',
            confidence: 0.65,
          }),
        ],
        durationMs: 5000,
        tokenUsage: { input: 600, output: 400, total: 1000 },
        success: true,
        falsePositives: [1], // Issue B 被标记为 false_positive
        confidenceAdjustments: [
          { issueIndex: 0, newConfidence: 0.9, reason: 'Confirmed with high confidence' },
        ],
        judgments: [
          {
            existingIssueIndex: 0,
            judgment: 'confirmed' as const,
            reason: 'Confirmed via multi-round review',
          },
          {
            existingIssueIndex: 1,
            judgment: 'false_positive' as const,
            reason: 'Not a real issue after deeper analysis',
            suggestedConfidenceAdjustment: 0.2,
          },
        ],
      };

      const result = calibrator.calibrate(originalIssues, mergedAdversaryResult);

      // Issue A 应被保留且置信度调整为 0.9
      const issueA = result.find(i => i.description === 'Issue A');
      expect(issueA).toBeDefined();
      expect(issueA!.confidence).toBe(0.9);

      // Issue B 被标记为 false_positive，置信度 0.7 >= 0.3 所以降级而非移除
      const issueB = result.find(i => i.description === 'Issue B');
      expect(issueB).toBeDefined();
      expect(issueB!.severity).toBe('medium'); // high -> medium 降级

      // 多轮对抗发现的新问题应被加入
      const round1Finding = result.find(i => i.description === 'Round 1 finding');
      const round2Finding = result.find(i => i.description === 'Round 2 finding');
      expect(round1Finding).toBeDefined();
      expect(round2Finding).toBeDefined();
    });
  });

  describe('backward compatibility with maxAdversaryRounds=1', () => {
    it('should behave identically to single-round when maxAdversaryRounds=1', async () => {
      let callCount = 0;
      const mockCreate = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return Promise.resolve(createMockResponse(JSON.stringify([])));
        }
        // 单轮对抗
        return Promise.resolve(
          createMockResponse(
            JSON.stringify({
              newIssues: [{
                file: 'found.ts',
                line: 1,
                severity: 'medium',
                dimension: 'adversary-found',
                description: 'Single round finding',
                suggestion: 'Fix it',
                confidence: 0.7,
              }],
              issueJudgments: [],
            }),
            500,
            300
          )
        );
      });

      MockAnthropic.mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      const orchestrator = new ReviewOrchestrator({
        maxAdversaryRounds: 1,
        enableAdversary: true,
        enableMetaReview: false,
      });

      const report = await orchestrator.run(createTestRequest());

      // 5 维度 + 1 对抗 = 6
      expect(mockCreate).toHaveBeenCalledTimes(6);

      const metadata = report.metadata as ExtendedReviewMetadata;
      // 单轮时 agentId 保持 adversary-agent（向后兼容）
      expect(metadata.agentTokenUsage['adversary-agent']).toBeDefined();
      expect(metadata.agentTokenUsage['adversary-agent'].input).toBe(500);
      expect(metadata.agentTokenUsage['adversary-agent'].output).toBe(300);
      expect(metadata.agentTokenUsage['adversary-agent'].total).toBe(800);
    });

    it('should use default maxAdversaryRounds=1 when not specified', async () => {
      let callCount = 0;
      const mockCreate = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return Promise.resolve(createMockResponse(JSON.stringify([])));
        }
        return Promise.resolve(
          createMockResponse(JSON.stringify({ newIssues: [], issueJudgments: [] }))
        );
      });

      MockAnthropic.mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      // 不传 maxAdversaryRounds
      const orchestrator = new ReviewOrchestrator({ enableAdversary: true, enableMetaReview: false });

      await orchestrator.run(createTestRequest());

      // 5 维度 + 1 对抗 = 6
      expect(mockCreate).toHaveBeenCalledTimes(6);
    });
  });
});
