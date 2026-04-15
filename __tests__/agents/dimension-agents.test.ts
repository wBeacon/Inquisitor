import {
  LogicAgent,
  SecurityAgent,
  PerformanceAgent,
  MaintainabilityAgent,
  EdgeCaseAgent,
  AgentRunner,
} from '../../src/agents';
import { ReviewDimension, ReviewIssue } from '../../src/types';
import { AGENT_PROMPTS } from '../../src/agents/prompts';

// mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn(),
      },
    })),
  };
});

import Anthropic from '@anthropic-ai/sdk';

/**
 * 创建模拟的 Anthropic API 响应
 */
function createMockResponse(text: string, inputTokens = 150, outputTokens = 50) {
  return {
    content: [{ type: 'text' as const, text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

/**
 * 获取当前 mock 实例的 messages.create 方法
 */
function getMockCreate(): jest.Mock {
  const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;
  // 获取最近创建的实例
  const instances = MockedAnthropic.mock.instances;
  if (instances.length === 0) {
    // 尚未有实例，先创建一个并预设 mock
    const mockCreate = jest.fn();
    MockedAnthropic.mockImplementation(() => ({
      messages: { create: mockCreate },
    }) as unknown as Anthropic);
    return mockCreate;
  }
  return (instances[instances.length - 1] as unknown as { messages: { create: jest.Mock } }).messages.create;
}

/**
 * 设置全局 mock：所有新的 Anthropic 实例都使用同一个 mockCreate
 */
function setupGlobalMock(mockCreate: jest.Mock): void {
  const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;
  MockedAnthropic.mockImplementation(() => ({
    messages: { create: mockCreate },
  }) as unknown as Anthropic);
}

// 标准的合法 review issues JSON
const VALID_ISSUES_JSON = JSON.stringify([
  {
    file: 'test.ts',
    line: 10,
    severity: 'high',
    dimension: 'logic',
    description: 'Potential null reference error',
    suggestion: 'Add null check before accessing property',
    confidence: 0.85,
  },
]);

const VALID_SECURITY_ISSUES_JSON = JSON.stringify([
  {
    file: 'api.ts',
    line: 25,
    severity: 'critical',
    dimension: 'security',
    description: 'SQL injection vulnerability',
    suggestion: 'Use parameterized queries',
    confidence: 0.95,
  },
]);

describe('Dimension Agents', () => {
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate = jest.fn();
    setupGlobalMock(mockCreate);
  });

  // === 验收条件 1: performReview 实际调用 Claude API ===
  describe('API integration', () => {
    it('should call Anthropic SDK to perform review (LogicAgent)', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_ISSUES_JSON));
      const agent = new LogicAgent();
      const result = await agent.review(['test.ts'], 'function foo() { return null; }');
      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledTimes(1);
      // 验证传递了 system prompt 和 user message
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toBeDefined();
      expect(callArgs.messages).toBeDefined();
      expect(callArgs.messages[0].role).toBe('user');
    });

    it('should call Anthropic SDK to perform review (SecurityAgent)', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_SECURITY_ISSUES_JSON));
      const agent = new SecurityAgent();
      const result = await agent.review(['api.ts'], 'const q = "SELECT * FROM users WHERE id=" + id;');
      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should call Anthropic SDK to perform review (PerformanceAgent)', async () => {
      mockCreate.mockResolvedValue(createMockResponse('[]'));
      const agent = new PerformanceAgent();
      const result = await agent.review(['app.ts'], 'for(let i=0;i<arr.length;i++){}');
      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should call Anthropic SDK to perform review (MaintainabilityAgent)', async () => {
      mockCreate.mockResolvedValue(createMockResponse('[]'));
      const agent = new MaintainabilityAgent();
      const result = await agent.review(['app.ts'], 'function doEverything() { /* 200 lines */ }');
      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should call Anthropic SDK to perform review (EdgeCaseAgent)', async () => {
      mockCreate.mockResolvedValue(createMockResponse('[]'));
      const agent = new EdgeCaseAgent();
      const result = await agent.review(['app.ts'], 'function parse(input) { return input.split(","); }');
      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  // === 验收条件 2: 独立上下文，无共享可变状态 ===
  describe('agent isolation', () => {
    it('should have independent configs (no shared mutable state)', () => {
      const a = new LogicAgent();
      const b = new SecurityAgent();
      // 不同实例，不同配置对象
      expect(a.getId()).not.toBe(b.getId());
      const configA = a.getConfig();
      const configB = b.getConfig();
      expect(configA).not.toBe(configB);
      expect(configA.id).not.toBe(configB.id);
      // getConfig 每次返回不同的对象（副本）
      const configA2 = a.getConfig();
      expect(configA).not.toBe(configA2);
      expect(configA).toEqual(configA2);
    });

    it('should create independent API clients for each review call', async () => {
      const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;
      mockCreate.mockResolvedValue(createMockResponse('[]'));
      const agent = new LogicAgent();
      await agent.review(['a.ts'], 'code1');
      await agent.review(['b.ts'], 'code2');
      // 每次 review 调用应创建新的 Anthropic 实例
      expect(MockedAnthropic).toHaveBeenCalledTimes(2);
    });

    it('should maintain agent independence during concurrent execution', async () => {
      mockCreate.mockResolvedValue(createMockResponse('[]'));
      const agent1 = new LogicAgent();
      const agent2 = new SecurityAgent();
      const [result1, result2] = await Promise.all([
        agent1.review(['test.ts'], 'code1'),
        agent2.review(['test.ts'], 'code2'),
      ]);
      expect(result1.agentId).toBe('logic-agent');
      expect(result2.agentId).toBe('security-agent');
      expect(result1.agentId).not.toBe(result2.agentId);
    });
  });

  // === 验收条件 3: 输出 schema 验证 ===
  describe('output schema validation', () => {
    it('should validate well-formed output matches ReviewIssue schema', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_ISSUES_JSON));
      const agent = new LogicAgent();
      const result = await agent.review(['test.ts'], 'code');
      expect(result.issues.length).toBe(1);
      const issue = result.issues[0];
      // 验证每个必填字段的类型
      expect(typeof issue.file).toBe('string');
      expect(issue.file.length).toBeGreaterThan(0);
      expect(typeof issue.line).toBe('number');
      expect(issue.line).toBeGreaterThan(0);
      expect(['critical', 'high', 'medium', 'low']).toContain(issue.severity);
      expect(issue.dimension).toBe(ReviewDimension.Logic);
      expect(typeof issue.description).toBe('string');
      expect(issue.description.length).toBeGreaterThan(0);
      expect(typeof issue.suggestion).toBe('string');
      expect(issue.suggestion.length).toBeGreaterThan(0);
      expect(typeof issue.confidence).toBe('number');
      expect(issue.confidence).toBeGreaterThanOrEqual(0);
      expect(issue.confidence).toBeLessThanOrEqual(1);
    });

    it('should reject malformed JSON and return empty issues', async () => {
      mockCreate.mockResolvedValue(createMockResponse('this is not valid json'));
      const agent = new LogicAgent();
      const result = await agent.review(['test.ts'], 'code');
      expect(result.success).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('should reject issues with missing required fields', async () => {
      const malformedIssues = JSON.stringify([
        { file: 'test.ts' }, // 缺少 line, description, suggestion 等
        { line: 10 }, // 缺少 file
        { file: 'test.ts', line: 0, description: 'test', suggestion: 'fix' }, // line 不能为 0
      ]);
      mockCreate.mockResolvedValue(createMockResponse(malformedIssues));
      const agent = new LogicAgent();
      const result = await agent.review(['test.ts'], 'code');
      expect(result.issues).toEqual([]);
    });

    it('should clamp out-of-range confidence values to 0-1', async () => {
      const issuesWithBadConfidence = JSON.stringify([
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: 'logic',
          description: 'High confidence',
          suggestion: 'Fix',
          confidence: 1.5,
        },
        {
          file: 'test.ts',
          line: 20,
          severity: 'high',
          dimension: 'logic',
          description: 'Negative confidence',
          suggestion: 'Fix',
          confidence: -0.3,
        },
      ]);
      mockCreate.mockResolvedValue(createMockResponse(issuesWithBadConfidence));
      const agent = new LogicAgent();
      const result = await agent.review(['test.ts'], 'code');
      expect(result.issues.length).toBe(2);
      expect(result.issues[0].confidence).toBeLessThanOrEqual(1);
      expect(result.issues[0].confidence).toBe(1);
      expect(result.issues[1].confidence).toBeGreaterThanOrEqual(0);
      expect(result.issues[1].confidence).toBe(0);
    });
  });

  // === 验收条件 4: system prompt 检查点 ===
  describe('system prompt checkpoints', () => {
    it('should have at least 10 checkpoints for each dimension prompt', () => {
      for (const [key, prompt] of Object.entries(AGENT_PROMPTS)) {
        // 匹配编号列表项 (如 "1. ", "2. " 等)
        const checkpoints = prompt.match(/\d+\.\s+\*\*/g);
        expect(checkpoints).toBeDefined();
        expect(checkpoints!.length).toBeGreaterThanOrEqual(10);
      }
    });

    it('should have dimension-specific content in each prompt', () => {
      // logic prompt 应包含逻辑相关关键词
      expect(AGENT_PROMPTS.logic).toContain('逻辑');
      expect(AGENT_PROMPTS.logic).toContain('控制流');
      expect(AGENT_PROMPTS.logic).not.toContain('注入漏洞');

      // security prompt 应包含安全相关关键词
      expect(AGENT_PROMPTS.security).toContain('安全');
      expect(AGENT_PROMPTS.security).toContain('注入');

      // performance prompt 应包含性能相关关键词
      expect(AGENT_PROMPTS.performance).toContain('性能');
      expect(AGENT_PROMPTS.performance).toContain('N+1');

      // maintainability prompt 应包含可维护性关键词
      expect(AGENT_PROMPTS.maintainability).toContain('可维护');
      expect(AGENT_PROMPTS.maintainability).toContain('SOLID');

      // edge_cases prompt 应包含边界情况关键词
      expect(AGENT_PROMPTS.edge_cases).toContain('边界');
      expect(AGENT_PROMPTS.edge_cases).toContain('空输入');
    });
  });

  // === 验收条件 5: 并行执行 ===
  describe('parallel execution', () => {
    it('should run 5 agents in parallel with total time < maxSingle * 1.5', async () => {
      // 每个 Agent mock 耗时 100ms
      const agentDelay = 100;
      mockCreate.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(createMockResponse('[]')), agentDelay);
        });
      });

      const agents = [
        new LogicAgent(),
        new SecurityAgent(),
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      const startTime = Date.now();
      const results = await Promise.all(
        agents.map((agent) => agent.review(['test.ts'], 'const x = 1;'))
      );
      const parallelDuration = Date.now() - startTime;

      expect(results).toHaveLength(5);
      expect(results.every((r) => r.success)).toBe(true);

      // 单个最慢 agent 的耗时（约 100ms）
      const maxSingleDuration = Math.max(...results.map((r) => r.durationMs));
      // 并行总耗时应 < 最慢单个 * 1.5
      expect(parallelDuration).toBeLessThan(maxSingleDuration * 1.5);
      // 绝对值：总耗时应 < 200ms（5 个 100ms 如果串行要 500ms）
      expect(parallelDuration).toBeLessThan(200);
    });
  });

  // === 验收条件 6: 错误处理 ===
  describe('error handling', () => {
    it('should handle API timeout gracefully', async () => {
      mockCreate.mockImplementation(() => new Promise(() => {
        // 永远不 resolve，模拟超时
      }));
      const agent = new LogicAgent(undefined, 50); // 50ms 超时
      const result = await agent.review(['test.ts'], 'code');
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      expect(result.issues).toEqual([]);
    });

    it('should handle malformed API response gracefully', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{invalid json response' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });
      const agent = new SecurityAgent();
      const result = await agent.review(['test.ts'], 'code');
      expect(result.success).toBe(true); // 解析失败不算 error，只是返回空 issues
      expect(result.issues).toEqual([]);
    });

    it('should handle network error gracefully', async () => {
      mockCreate.mockRejectedValue(new Error('Network error: ECONNREFUSED'));
      const agent = new PerformanceAgent();
      const result = await agent.review(['test.ts'], 'code');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should not affect other agents when one fails', async () => {
      let callCount = 0;
      mockCreate.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Agent 2 network failure'));
        }
        return Promise.resolve(createMockResponse('[]'));
      });

      const agents = [
        new LogicAgent(),
        new SecurityAgent(), // 这个会失败
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      const results = await Promise.all(
        agents.map((agent) => agent.review(['test.ts'], 'code'))
      );

      // SecurityAgent 应该失败
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain('network failure');

      // 其他 Agent 应该成功
      expect(results[0].success).toBe(true);
      expect(results[2].success).toBe(true);
      expect(results[3].success).toBe(true);
      expect(results[4].success).toBe(true);
    });
  });

  // === 验收条件 7: dimension 强制修正 ===
  describe('dimension enforcement', () => {
    it('should force-correct dimension to match agent responsibility', async () => {
      // LLM 返回错误的 dimension
      const wrongDimensionIssue = JSON.stringify([
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: 'security', // LogicAgent 应该强制修正为 logic
          description: 'Wrong dimension issue',
          suggestion: 'Fix it',
          confidence: 0.8,
        },
      ]);
      mockCreate.mockResolvedValue(createMockResponse(wrongDimensionIssue));
      const agent = new LogicAgent();
      const result = await agent.review(['test.ts'], 'code');
      expect(result.issues.length).toBe(1);
      expect(result.issues[0].dimension).toBe(ReviewDimension.Logic);
    });

    it('should enforce dimension for all agent types', async () => {
      const wrongDimensionIssues = JSON.stringify([
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: 'logic', // 错误的维度
          description: 'Some issue',
          suggestion: 'Fix it',
          confidence: 0.8,
        },
      ]);

      const agentDimensionPairs: Array<[AgentRunner, ReviewDimension]> = [
        [new LogicAgent(), ReviewDimension.Logic],
        [new SecurityAgent(), ReviewDimension.Security],
        [new PerformanceAgent(), ReviewDimension.Performance],
        [new MaintainabilityAgent(), ReviewDimension.Maintainability],
        [new EdgeCaseAgent(), ReviewDimension.EdgeCases],
      ];

      for (const [agent, expectedDimension] of agentDimensionPairs) {
        mockCreate.mockResolvedValue(createMockResponse(wrongDimensionIssues));
        const result = await agent.review(['test.ts'], 'code');
        if (result.issues.length > 0) {
          expect(result.issues[0].dimension).toBe(expectedDimension);
        }
      }
    });
  });

  // === 验收条件 8: JSON 解析健壮性 ===
  describe('json parsing robustness', () => {
    it('should handle markdown code fence wrapping', async () => {
      const fencedJson = '```json\n' + VALID_ISSUES_JSON + '\n```';
      mockCreate.mockResolvedValue(createMockResponse(fencedJson));
      const agent = new LogicAgent();
      const result = await agent.review(['test.ts'], 'code');
      expect(result.issues.length).toBe(1);
      expect(result.issues[0].file).toBe('test.ts');
    });

    it('should handle extra text wrapping around JSON', async () => {
      const wrappedJson = 'Here are the issues I found:\n\n' + VALID_ISSUES_JSON + '\n\nThose are all the issues.';
      mockCreate.mockResolvedValue(createMockResponse(wrappedJson));
      const agent = new LogicAgent();
      const result = await agent.review(['test.ts'], 'code');
      expect(result.issues.length).toBe(1);
    });

    it('should handle trailing commas in JSON', async () => {
      const trailingCommaJson = `[
        {
          "file": "test.ts",
          "line": 10,
          "severity": "high",
          "dimension": "logic",
          "description": "Some issue",
          "suggestion": "Fix it",
          "confidence": 0.8,
        },
      ]`;
      mockCreate.mockResolvedValue(createMockResponse(trailingCommaJson));
      const agent = new LogicAgent();
      const result = await agent.review(['test.ts'], 'code');
      expect(result.issues.length).toBe(1);
    });

    it('should handle single quotes replacing double quotes', async () => {
      const singleQuoteJson = `[
        {
          'file': 'test.ts',
          'line': 10,
          'severity': 'high',
          'dimension': 'logic',
          'description': 'Some issue found',
          'suggestion': 'Fix it now',
          'confidence': 0.8
        }
      ]`;
      mockCreate.mockResolvedValue(createMockResponse(singleQuoteJson));
      const agent = new LogicAgent();
      const result = await agent.review(['test.ts'], 'code');
      expect(result.issues.length).toBe(1);
    });

    it('should handle code fence without language tag', async () => {
      const fencedNoLang = '```\n' + VALID_ISSUES_JSON + '\n```';
      mockCreate.mockResolvedValue(createMockResponse(fencedNoLang));
      const agent = new LogicAgent();
      const result = await agent.review(['test.ts'], 'code');
      expect(result.issues.length).toBe(1);
    });
  });

  // === 验收条件 9: token usage 追踪 ===
  describe('token usage tracking', () => {
    it('should track actual token usage from API response', async () => {
      mockCreate.mockResolvedValue(createMockResponse('[]', 500, 200));
      const agent = new LogicAgent();
      const result = await agent.review(['test.ts'], 'code');
      expect(result.tokenUsage.input).toBe(500);
      expect(result.tokenUsage.output).toBe(200);
      expect(result.tokenUsage.total).toBe(700);
    });

    it('should not have hardcoded zero token usage on success', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_ISSUES_JSON, 1000, 500));
      const agent = new SecurityAgent();
      const result = await agent.review(['api.ts'], 'code');
      expect(result.success).toBe(true);
      expect(result.tokenUsage.input).not.toBe(0);
      expect(result.tokenUsage.output).not.toBe(0);
      expect(result.tokenUsage.total).not.toBe(0);
      expect(result.tokenUsage.input).toBe(1000);
      expect(result.tokenUsage.output).toBe(500);
      expect(result.tokenUsage.total).toBe(1500);
    });
  });

  // === 验收条件 10: 可配置超时 ===
  describe('timeout configuration', () => {
    it('should respect custom timeout and return success=false on timeout', async () => {
      // Mock 一个 200ms 的 API 调用
      mockCreate.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(createMockResponse('[]')), 200);
        });
      });
      // 创建 100ms 超时的 Agent
      const agent = new LogicAgent(undefined, 100);
      const result = await agent.review(['test.ts'], 'code');
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should succeed when API responds within timeout', async () => {
      mockCreate.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(createMockResponse('[]')), 10);
        });
      });
      const agent = new LogicAgent(undefined, 5000);
      const result = await agent.review(['test.ts'], 'code');
      expect(result.success).toBe(true);
    });

    it('should not throw uncaught exception on timeout', async () => {
      mockCreate.mockImplementation(() => new Promise(() => {
        // 永远不 resolve
      }));
      const agent = new EdgeCaseAgent(undefined, 50);
      // 不应该抛出异常
      const result = await agent.review(['test.ts'], 'code');
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // === 原有配置测试（保持向后兼容） ===
  describe('LogicAgent', () => {
    it('should have correct configuration', async () => {
      const agent = new LogicAgent();
      expect(agent.getId()).toBe('logic-agent');
      expect(agent.getName()).toBe('Logic Correctness Agent');
      expect(agent.getDimension()).toBe(ReviewDimension.Logic);
    });

    it('should support custom configuration', () => {
      const agent = new LogicAgent({
        id: 'custom-logic',
        name: 'Custom Logic Agent',
      });
      expect(agent.getId()).toBe('custom-logic');
      expect(agent.getName()).toBe('Custom Logic Agent');
    });

    it('should have system prompt defined', () => {
      const agent = new LogicAgent();
      const config = agent.getConfig();
      expect(config.systemPrompt).toBeDefined();
      expect(config.systemPrompt.length).toBeGreaterThan(0);
    });
  });

  describe('SecurityAgent', () => {
    it('should have correct configuration', () => {
      const agent = new SecurityAgent();
      expect(agent.getId()).toBe('security-agent');
      expect(agent.getDimension()).toBe(ReviewDimension.Security);
    });
  });

  describe('PerformanceAgent', () => {
    it('should have correct configuration', () => {
      const agent = new PerformanceAgent();
      expect(agent.getId()).toBe('performance-agent');
      expect(agent.getDimension()).toBe(ReviewDimension.Performance);
    });
  });

  describe('MaintainabilityAgent', () => {
    it('should have correct configuration', () => {
      const agent = new MaintainabilityAgent();
      expect(agent.getId()).toBe('maintainability-agent');
      expect(agent.getDimension()).toBe(ReviewDimension.Maintainability);
    });
  });

  describe('EdgeCaseAgent', () => {
    it('should have correct configuration', () => {
      const agent = new EdgeCaseAgent();
      expect(agent.getId()).toBe('edge-case-agent');
      expect(agent.getDimension()).toBe(ReviewDimension.EdgeCases);
    });
  });

  describe('System Prompts', () => {
    it('should have comprehensive system prompts for all agents', () => {
      const agents = [
        new LogicAgent(),
        new SecurityAgent(),
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      for (const agent of agents) {
        const config = agent.getConfig();
        expect(config.systemPrompt).toBeDefined();
        expect(config.systemPrompt.length).toBeGreaterThan(500);
      }
    });

    it('should have output format specifications in prompts', () => {
      const agents = [
        new LogicAgent(),
        new SecurityAgent(),
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      for (const agent of agents) {
        const prompt = agent.getConfig().systemPrompt;
        expect(prompt.toLowerCase()).toContain('json');
        expect(prompt).toContain('dimension');
        expect(prompt).toContain('confidence');
      }
    });
  });

  describe('Agent Configuration', () => {
    it('should have default max tokens set', () => {
      const agents = [
        new LogicAgent(),
        new SecurityAgent(),
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      for (const agent of agents) {
        const config = agent.getConfig();
        expect(config.maxTokens).toBeDefined();
        expect(config.maxTokens).toBeGreaterThan(1000);
      }
    });

    it('should have reasonable temperature values', () => {
      const agents = [
        new LogicAgent(),
        new SecurityAgent(),
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      for (const agent of agents) {
        const config = agent.getConfig();
        expect(config.temperature).toBeDefined();
        expect(config.temperature).toBeGreaterThanOrEqual(0);
        expect(config.temperature).toBeLessThanOrEqual(1);
      }
    });
  });
});
