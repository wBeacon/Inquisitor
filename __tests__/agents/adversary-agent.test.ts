import { AdversaryAgent, IssueJudgment } from '../../src/agents/adversary-agent';
import { IssueCalibrator, IssueCalibrtor } from '../../src/agents/issue-calibrator';
import { ReviewIssue, ReviewDimension, AdversaryResult } from '../../src/types';
import { ADVERSARY_AGENT_PROMPT } from '../../src/agents/prompts/adversary-prompt';
import {
  LOGIC_AGENT_PROMPT,
  SECURITY_AGENT_PROMPT,
  PERFORMANCE_AGENT_PROMPT,
  MAINTAINABILITY_AGENT_PROMPT,
  EDGE_CASE_AGENT_PROMPT,
} from '../../src/agents/prompts';

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  }));
});

// 获取 mock 的 Anthropic 构造函数
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
function createMockResponse(content: string) {
  return {
    content: [{ type: 'text', text: content }],
    usage: { input_tokens: 100, output_tokens: 200 },
  };
}

describe('AdversaryAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('configuration', () => {
    it('should have correct default configuration', () => {
      const agent = new AdversaryAgent();
      expect(agent.getId()).toBe('adversary-agent');
      expect(agent.getName()).toBe('Adversary Code Review Agent');
    });

    it('should support custom configuration', () => {
      const agent = new AdversaryAgent({
        id: 'custom-adversary',
        name: 'Custom Adversary Agent',
      });
      expect(agent.getId()).toBe('custom-adversary');
      expect(agent.getName()).toBe('Custom Adversary Agent');
    });

    it('should have adversary-specific system prompt', () => {
      const agent = new AdversaryAgent();
      const config = agent.getConfig();
      expect(config.systemPrompt).toBeDefined();
      expect(config.systemPrompt.length).toBeGreaterThan(500);
      expect(config.systemPrompt).toContain('对抗');
    });

    it('should have higher temperature for creative thinking', () => {
      const agent = new AdversaryAgent();
      const config = agent.getConfig();
      expect(config.temperature).toBeDefined();
      expect(config.temperature).toBeGreaterThanOrEqual(0.6);
    });
  });

  // 条件 1: AdversaryAgent 在独立上下文中运行，systemPrompt 不包含维度 Agent prompt 内容
  describe('isolated context', () => {
    it('should not contain any dimension agent prompt content', () => {
      const dimensionPrompts = [
        LOGIC_AGENT_PROMPT,
        SECURITY_AGENT_PROMPT,
        PERFORMANCE_AGENT_PROMPT,
        MAINTAINABILITY_AGENT_PROMPT,
        EDGE_CASE_AGENT_PROMPT,
      ];

      // 从每个维度 prompt 中取一个有代表性的子串进行检查
      // ADVERSARY_AGENT_PROMPT 不应该包含任何维度 Agent 的 prompt 子串
      for (const prompt of dimensionPrompts) {
        // 取 prompt 的前 100 个字符作为特征子串（跳过可能相似的通用部分）
        const uniqueSubstring = prompt.substring(0, 100);
        expect(ADVERSARY_AGENT_PROMPT).not.toContain(uniqueSubstring);
      }
    });
  });

  // 条件 2: 三种判定类型的正确输出
  describe('judgment types: confirmed, disputed, false_positive', () => {
    it('should output all three judgment types with non-empty reasons', async () => {
      const mockResponse = createMockResponse(JSON.stringify({
        newIssues: [],
        issueJudgments: [
          {
            existingIssueIndex: 0,
            judgment: 'confirmed',
            reason: 'This is indeed a real null reference issue',
            suggestedConfidenceAdjustment: 0.9,
          },
          {
            existingIssueIndex: 1,
            judgment: 'disputed',
            reason: 'The variable is initialized on line 5, so this is not actually a problem',
            suggestedConfidenceAdjustment: 0.4,
          },
          {
            existingIssueIndex: 2,
            judgment: 'false_positive',
            reason: 'This code path is unreachable due to the guard clause on line 3',
            suggestedConfidenceAdjustment: 0.1,
          },
        ],
      }));

      MockAnthropic.mockImplementation(() => ({
        messages: { create: jest.fn().mockResolvedValue(mockResponse) },
      }));

      const agent = new AdversaryAgent();
      const existingIssues = [
        createTestIssue({ description: 'Null reference issue' }),
        createTestIssue({ line: 20, description: 'Uninitialized variable' }),
        createTestIssue({ line: 30, description: 'Unreachable code issue' }),
      ];

      const result = await agent.challenge(['test.ts'], 'function test() {}', existingIssues);

      expect(result.success).toBe(true);

      // 检查 falsePositives 包含 index 2
      expect(result.falsePositives).toContain(2);

      // 检查 confidenceAdjustments 包含 confirmed 和 disputed 的调整
      expect(result.confidenceAdjustments.length).toBeGreaterThanOrEqual(2);

      // 所有 judgment 都有 reason
      const judgments = result.judgments as IssueJudgment[];
      expect(judgments).toBeDefined();
      for (const j of judgments) {
        expect(j.reason).toBeTruthy();
        expect(typeof j.reason).toBe('string');
        expect(j.reason.length).toBeGreaterThan(0);
        expect(['confirmed', 'disputed', 'false_positive']).toContain(j.judgment);
      }
    });
  });

  // 条件 3: 新发现问题使用 'adversary-found' 标记
  describe('adversary-found dimension marking', () => {
    it('should mark new issues with adversary-found dimension', async () => {
      const mockResponse = createMockResponse(JSON.stringify({
        newIssues: [
          {
            file: 'app.ts',
            line: 42,
            severity: 'high',
            dimension: 'adversary-found',
            description: 'Memory leak: event listener never removed',
            suggestion: 'Add cleanup in componentWillUnmount',
            confidence: 0.85,
          },
        ],
        issueJudgments: [],
      }));

      MockAnthropic.mockImplementation(() => ({
        messages: { create: jest.fn().mockResolvedValue(mockResponse) },
      }));

      const agent = new AdversaryAgent();
      const result = await agent.challenge(['app.ts'], 'class App { ... }', []);

      expect(result.success).toBe(true);
      expect(result.issues.length).toBe(1);
      expect(result.issues[0].dimension).toBe('adversary-found');
      expect(result.issues[0].foundBy).toBe('adversary-agent');
    });
  });

  // 条件 6: 真实 Claude API 调用
  describe('real Claude API integration', () => {
    it('should call Anthropic client.messages.create with correct parameters', async () => {
      const mockCreate = jest.fn().mockResolvedValue(
        createMockResponse(JSON.stringify({ newIssues: [], issueJudgments: [] }))
      );

      MockAnthropic.mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      const agent = new AdversaryAgent();
      await agent.challenge(['test.ts'], 'function foo() {}', []);

      expect(MockAnthropic).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('对抗'),
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('test.ts'),
            }),
          ]),
        })
      );
    });

    it('should track token usage from API response', async () => {
      MockAnthropic.mockImplementation(() => ({
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [{ type: 'text', text: JSON.stringify({ newIssues: [], issueJudgments: [] }) }],
            usage: { input_tokens: 500, output_tokens: 300 },
          }),
        },
      }));

      const agent = new AdversaryAgent();
      const result = await agent.challenge(['test.ts'], 'code', []);

      expect(result.tokenUsage.input).toBe(500);
      expect(result.tokenUsage.output).toBe(300);
      expect(result.tokenUsage.total).toBe(800);
    });
  });

  // 条件 8: Graceful degradation - API 失败时的错误处理
  describe('error handling and graceful fallback', () => {
    it('should return all issues as confirmed when API call fails (graceful degradation)', async () => {
      MockAnthropic.mockImplementation(() => ({
        messages: {
          create: jest.fn().mockRejectedValue(new Error('API timeout')),
        },
      }));

      const agent = new AdversaryAgent();
      const existingIssues = [
        createTestIssue({ description: 'Issue 1' }),
        createTestIssue({ line: 20, description: 'Issue 2' }),
      ];

      const result = await agent.challenge(['test.ts'], 'code', existingIssues);

      // 失败时不应崩溃，返回 success=false
      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
      // 失败时不标记任何问题为 false positive，保留所有原始结果
      expect(result.falsePositives).toEqual([]);
      expect(result.confidenceAdjustments).toEqual([]);
      // 不丢失原始审查结果（issues 为空因为没有新发现）
      expect(result.issues).toEqual([]);
    });

    it('should handle malformed API response with graceful fallback', async () => {
      MockAnthropic.mockImplementation(() => ({
        messages: {
          create: jest.fn().mockResolvedValue(
            createMockResponse('this is not valid JSON at all')
          ),
        },
      }));

      const agent = new AdversaryAgent();
      const result = await agent.challenge(['test.ts'], 'code', [createTestIssue()]);

      // 解析错误应触发 graceful degradation
      expect(result.success).toBe(false);
      expect(result.falsePositives).toEqual([]);
    });

    it('should handle response with code fence wrapped JSON', async () => {
      const jsonContent = JSON.stringify({
        newIssues: [
          {
            file: 'test.ts',
            line: 5,
            severity: 'medium',
            dimension: 'adversary-found',
            description: 'Found via code fence',
            suggestion: 'Fix it',
            confidence: 0.7,
          },
        ],
        issueJudgments: [
          {
            existingIssueIndex: 0,
            judgment: 'confirmed',
            reason: 'Confirmed in code fence response',
          },
        ],
      });

      MockAnthropic.mockImplementation(() => ({
        messages: {
          create: jest.fn().mockResolvedValue(
            createMockResponse('```json\n' + jsonContent + '\n```')
          ),
        },
      }));

      const agent = new AdversaryAgent();
      const result = await agent.challenge(
        ['test.ts'],
        'code',
        [createTestIssue()]
      );

      expect(result.success).toBe(true);
      expect(result.issues.length).toBe(1);
    });

    it('should handle response with incomplete/invalid newIssues entries', async () => {
      const mockResponse = createMockResponse(JSON.stringify({
        newIssues: [
          { file: 'test.ts', line: 5 }, // 缺少 description 和 suggestion
          {
            file: 'valid.ts',
            line: 10,
            severity: 'high',
            description: 'Valid issue',
            suggestion: 'Fix it',
            confidence: 0.8,
          },
          null, // null 条目
          { file: '', line: 0 }, // 无效文件和行号
        ],
        issueJudgments: [],
      }));

      MockAnthropic.mockImplementation(() => ({
        messages: { create: jest.fn().mockResolvedValue(mockResponse) },
      }));

      const agent = new AdversaryAgent();
      const result = await agent.challenge(['test.ts'], 'code', []);

      expect(result.success).toBe(true);
      // 只有有效的 issue 应被保留
      expect(result.issues.length).toBe(1);
      expect(result.issues[0].file).toBe('valid.ts');
    });

    it('should handle response with invalid judgment entries', async () => {
      const mockResponse = createMockResponse(JSON.stringify({
        newIssues: [],
        issueJudgments: [
          {
            existingIssueIndex: 0,
            judgment: 'invalid_judgment', // 无效的判断类型
            reason: '',  // 空理由
          },
          {
            existingIssueIndex: 5, // 超出范围的索引
            judgment: 'confirmed',
            reason: 'Out of range',
          },
          {
            existingIssueIndex: 0,
            judgment: 'disputed',
            reason: 'Valid dispute reason',
            suggestedConfidenceAdjustment: 0.4,
            suggestedSeverityAdjustment: 'medium',
          },
        ],
      }));

      MockAnthropic.mockImplementation(() => ({
        messages: { create: jest.fn().mockResolvedValue(mockResponse) },
      }));

      const agent = new AdversaryAgent();
      const existingIssues = [createTestIssue()];
      const result = await agent.challenge(['test.ts'], 'code', existingIssues);

      expect(result.success).toBe(true);
    });

    it('should handle existing issues with codeSnippet in message building', async () => {
      const mockResponse = createMockResponse(JSON.stringify({
        newIssues: [],
        issueJudgments: [
          { existingIssueIndex: 0, judgment: 'confirmed', reason: 'Yes' },
        ],
      }));

      MockAnthropic.mockImplementation(() => ({
        messages: { create: jest.fn().mockResolvedValue(mockResponse) },
      }));

      const agent = new AdversaryAgent();
      const issueWithSnippet = createTestIssue({ codeSnippet: 'const x = null;' });
      const result = await agent.challenge(['test.ts'], 'code', [issueWithSnippet]);

      expect(result.success).toBe(true);
    });

    it('should handle response with missing issueJudgments array', async () => {
      const mockResponse = createMockResponse(JSON.stringify({
        newIssues: [],
        // 没有 issueJudgments 字段
      }));

      MockAnthropic.mockImplementation(() => ({
        messages: { create: jest.fn().mockResolvedValue(mockResponse) },
      }));

      const agent = new AdversaryAgent();
      const result = await agent.challenge(
        ['test.ts'],
        'code',
        [createTestIssue(), createTestIssue({ line: 20 })]
      );

      expect(result.success).toBe(true);
      // 缺少判断列表时，所有问题默认 confirmed
      expect(result.falsePositives).toEqual([]);
    });

    it('should handle newIssues with endLine and codeSnippet', async () => {
      const mockResponse = createMockResponse(JSON.stringify({
        newIssues: [
          {
            file: 'test.ts',
            line: 10,
            endLine: 15,
            severity: 'critical',
            dimension: 'adversary-found',
            description: 'Range issue',
            suggestion: 'Fix range',
            confidence: 0.95,
            codeSnippet: 'for (let i = 0; i < n; i++) {',
          },
        ],
        issueJudgments: [],
      }));

      MockAnthropic.mockImplementation(() => ({
        messages: { create: jest.fn().mockResolvedValue(mockResponse) },
      }));

      const agent = new AdversaryAgent();
      const result = await agent.challenge(['test.ts'], 'code', []);

      expect(result.success).toBe(true);
      expect(result.issues[0].endLine).toBe(15);
      expect(result.issues[0].codeSnippet).toBe('for (let i = 0; i < n; i++) {');
    });
  });
});

describe('IssueCalibrator', () => {
  // 条件 7: 拼写修正和向后兼容
  describe('spelling correction and backward compatibility', () => {
    it('should export IssueCalibrator as the correct class name', () => {
      const calibrator = new IssueCalibrator();
      expect(calibrator).toBeInstanceOf(IssueCalibrator);
    });

    it('should export deprecated IssueCalibrtor alias for backward compatibility', () => {
      // IssueCalibrtor 是旧的拼写错误名称，作为 deprecated alias 保留
      const calibrator = new IssueCalibrtor();
      expect(calibrator).toBeInstanceOf(IssueCalibrator);
    });

    it('should have mergeDuplicates method (corrected from mergeeDuplicates)', () => {
      const calibrator = new IssueCalibrator();
      expect(typeof calibrator.mergeDuplicates).toBe('function');
    });
  });

  describe('applyConfidenceAdjustments', () => {
    it('should adjust confidence scores', () => {
      const calibrator = new IssueCalibrator();
      const issues = [
        createTestIssue({ confidence: 0.8 }),
        createTestIssue({ line: 20, dimension: ReviewDimension.Security, confidence: 0.7 }),
      ];

      const adversaryResult: AdversaryResult = {
        agentId: 'adversary',
        issues: [],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [],
        confidenceAdjustments: [
          { issueIndex: 0, newConfidence: 0.5, reason: 'Disputed' },
          { issueIndex: 1, newConfidence: 0.9, reason: 'Confirmed' },
        ],
      };

      const result = calibrator.calibrate(issues, adversaryResult);

      // 结果按 severity 排序，所以需要按 dimension 找
      const logicIssue = result.find(i => i.dimension === ReviewDimension.Logic);
      const securityIssue = result.find(i => i.dimension === ReviewDimension.Security);
      expect(logicIssue?.confidence).toBe(0.5);
      expect(securityIssue?.confidence).toBe(0.9);
    });

    it('should clamp confidence values to 0-1 range', () => {
      const calibrator = new IssueCalibrator();
      const issues = [createTestIssue({ confidence: 0.5 })];

      const adversaryResult: AdversaryResult = {
        agentId: 'adversary',
        issues: [],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [],
        confidenceAdjustments: [{ issueIndex: 0, newConfidence: 1.5, reason: 'Test' }],
      };

      const result = calibrator.calibrate(issues, adversaryResult);
      expect(result[0].confidence).toBeLessThanOrEqual(1.0);
    });
  });

  // 条件 4: severity 降级逻辑
  describe('severity downgrade for false positives', () => {
    it('should downgrade severity for false_positive issues with confidence >= 0.3', () => {
      const calibrator = new IssueCalibrator();
      const issues = [
        createTestIssue({ severity: 'critical', confidence: 0.5 }),
        createTestIssue({ line: 20, severity: 'high', confidence: 0.4 }),
        createTestIssue({ line: 30, severity: 'medium', confidence: 0.6 }),
        createTestIssue({ line: 40, severity: 'low', confidence: 0.35 }),
      ];

      const adversaryResult: AdversaryResult = {
        agentId: 'adversary',
        issues: [],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [0, 1, 2, 3], // 所有都标记为 false_positive
        confidenceAdjustments: [],
      };

      const result = calibrator.calibrate(issues, adversaryResult);

      // critical -> high
      const criticalDowngraded = result.find(i => i.line === 10);
      expect(criticalDowngraded?.severity).toBe('high');

      // high -> medium
      const highDowngraded = result.find(i => i.line === 20);
      expect(highDowngraded?.severity).toBe('medium');

      // medium -> low
      const mediumDowngraded = result.find(i => i.line === 30);
      expect(mediumDowngraded?.severity).toBe('low');

      // low -> low (保持不变)
      const lowKept = result.find(i => i.line === 40);
      expect(lowKept?.severity).toBe('low');
    });
  });

  // 条件 4 & 9: false_positive 且低置信度移除逻辑
  describe('low confidence false_positive removal', () => {
    it('should remove false_positive issues with confidence below 0.3', () => {
      const calibrator = new IssueCalibrator();
      const issues = [
        createTestIssue({ confidence: 0.2, description: 'Low confidence false positive to remove' }),
        createTestIssue({ line: 20, confidence: 0.5, description: 'Higher confidence false positive to keep' }),
        createTestIssue({ line: 30, confidence: 0.8, description: 'Not false positive, keep' }),
      ];

      // 先应用置信度调整使 index 0 的置信度低于 0.3
      const adversaryResult: AdversaryResult = {
        agentId: 'adversary',
        issues: [],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [0, 1], // 前两个标记为 false_positive
        confidenceAdjustments: [
          { issueIndex: 0, newConfidence: 0.15, reason: 'Definitely not a real issue' },
        ],
      };

      const result = calibrator.calibrate(issues, adversaryResult);

      // index 0 (confidence 0.15 < 0.3, false_positive) 应被移除
      expect(result.find(i => i.description === 'Low confidence false positive to remove')).toBeUndefined();

      // index 1 (confidence 0.5 >= 0.3, false_positive) 应保留但 severity 降级
      const keptFP = result.find(i => i.description === 'Higher confidence false positive to keep');
      expect(keptFP).toBeDefined();

      // index 2 (非 false_positive) 应保留
      expect(result.find(i => i.description === 'Not false positive, keep')).toBeDefined();
    });
  });

  describe('graceful degradation in calibration', () => {
    it('should return original issues when adversary review fails (graceful fallback)', () => {
      const calibrator = new IssueCalibrator();
      const issues = [
        createTestIssue({ description: 'Original issue 1' }),
        createTestIssue({ line: 20, description: 'Original issue 2' }),
      ];

      // 对抗审查失败
      const adversaryResult: AdversaryResult = {
        agentId: 'adversary',
        issues: [],
        durationMs: 100,
        tokenUsage: { input: 0, output: 0, total: 0 },
        success: false,
        error: 'API timeout',
        falsePositives: [],
        confidenceAdjustments: [],
      };

      const result = calibrator.calibrate(issues, adversaryResult);

      // 失败时应返回所有原始问题，不丢失任何结果
      expect(result.length).toBe(2);
      expect(result[0].description).toBe('Original issue 1');
      expect(result[1].description).toBe('Original issue 2');
    });
  });

  describe('mergeDuplicates', () => {
    it('should keep issue with higher confidence when duplicates exist', () => {
      const calibrator = new IssueCalibrator();
      const issues = [
        createTestIssue({ description: 'Issue found by Agent 1', confidence: 0.7 }),
        createTestIssue({ description: 'Issue found by Agent 2', confidence: 0.9 }),
      ];

      const adversaryResult: AdversaryResult = {
        agentId: 'adversary',
        issues: [],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [],
        confidenceAdjustments: [],
      };

      const result = calibrator.calibrate(issues, adversaryResult);

      expect(result.length).toBe(1);
      expect(result[0].confidence).toBe(0.9);
      expect(result[0].description).toBe('Issue found by Agent 2');
    });
  });

  describe('sortIssues', () => {
    it('should sort by severity first, then by confidence', () => {
      const calibrator = new IssueCalibrator();
      const issues = [
        createTestIssue({ severity: 'low', confidence: 0.9, description: 'Low severity' }),
        createTestIssue({ line: 20, severity: 'critical', confidence: 0.3, description: 'Critical low confidence' }),
        createTestIssue({ line: 30, severity: 'high', confidence: 0.9, description: 'High high confidence' }),
        createTestIssue({ line: 40, severity: 'high', confidence: 0.3, description: 'High low confidence' }),
      ];

      const adversaryResult: AdversaryResult = {
        agentId: 'adversary',
        issues: [],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [],
        confidenceAdjustments: [],
      };

      const result = calibrator.calibrate(issues, adversaryResult);

      expect(result[0].severity).toBe('critical');
      expect(result[1].severity).toBe('high');
      expect(result[1].confidence).toBe(0.9);
      expect(result[2].confidence).toBe(0.3);
    });
  });

  describe('generateCalibrationSummary', () => {
    it('should provide accurate calibration statistics', () => {
      const calibrator = new IssueCalibrator();
      const originalIssues = [createTestIssue()];

      const adversaryResult: AdversaryResult = {
        agentId: 'adversary',
        issues: [
          createTestIssue({
            line: 50,
            dimension: ReviewDimension.Security,
            severity: 'medium',
            description: 'New issue',
            confidence: 0.6,
          }),
        ],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [0],
        confidenceAdjustments: [],
      };

      const finalIssues = calibrator.calibrate(originalIssues, adversaryResult);
      const summary = calibrator.generateCalibrationSummary(
        originalIssues,
        adversaryResult,
        finalIssues
      );

      expect(summary.originalCount).toBe(1);
      expect(summary.falsePositivesRemoved).toBe(1);
      expect(summary.newIssuesAdded).toBe(1);
      // false_positive 的 issue 置信度为 0.8 >= 0.3，所以会被降级而非移除
      // 最终有 1 个降级的原始 issue + 1 个新 issue = 2（可能去重后更少）
      expect(summary.finalCount).toBeGreaterThanOrEqual(1);
    });
  });
});
