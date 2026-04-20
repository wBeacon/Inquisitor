/**
 * TokenManager 单元测试
 *
 * 覆盖：
 * - 基于 token counting 的 prompt 长度预估（误差 < 5%）
 * - 不同模型返回不同的 ModelTokenConfig
 * - estimateCost 返回结构化报告
 */

import {
  TokenManager,
  MODEL_CONFIGS,
  DEFAULT_MODEL_CONFIG,
  type ModelTokenConfig,
  type TokenCostReport,
  type AgentTokenEstimate,
} from '../../../src/agents/prompts/token-manager';
import { TokenCounter } from '../../../src/utils/token-counter';

describe('TokenManager', () => {
  let manager: TokenManager;

  beforeEach(() => {
    manager = new TokenManager();
  });

  describe('getModelConfig', () => {
    it('claude-sonnet-4-20250514 应返回正确的 ModelTokenConfig', () => {
      const config = manager.getModelConfig('claude-sonnet-4-20250514');

      expect(config.modelId).toBe('claude-sonnet-4-20250514');
      expect(config.contextWindow).toBe(200000);
      expect(config.maxInputTokens).toBe(195000);
      expect(config.recommendedMaxOutput).toBe(8192);
      expect(config.inputPricePerMillion).toBe(3);
      expect(config.outputPricePerMillion).toBe(15);
    });

    it('claude-3-5-haiku-20241022 应返回正确的 ModelTokenConfig', () => {
      const config = manager.getModelConfig('claude-3-5-haiku-20241022');

      expect(config.modelId).toBe('claude-3-5-haiku-20241022');
      expect(config.contextWindow).toBe(200000);
      expect(config.maxInputTokens).toBe(195000);
      expect(config.recommendedMaxOutput).toBe(8192);
      expect(config.inputPricePerMillion).toBe(0.8);
      expect(config.outputPricePerMillion).toBe(4);
    });

    it('不同模型应返回不同的配置（价格不同）', () => {
      const sonnet = manager.getModelConfig('claude-sonnet-4-20250514');
      const haiku = manager.getModelConfig('claude-3-5-haiku-20241022');

      expect(sonnet.inputPricePerMillion).not.toBe(haiku.inputPricePerMillion);
      expect(sonnet.outputPricePerMillion).not.toBe(haiku.outputPricePerMillion);
      expect(sonnet.displayName).not.toBe(haiku.displayName);
    });

    it('未知模型应返回默认配置', () => {
      const config = manager.getModelConfig('unknown-model-xyz');

      expect(config.modelId).toBe('unknown-model-xyz');
      expect(config.contextWindow).toBe(200000);
      expect(config.maxInputTokens).toBe(195000);
    });
  });

  describe('estimateInputTokens - 精度验证', () => {
    it('预估值与 TokenCounter 直接计数结果一致', () => {
      const systemPrompt = 'You are a code reviewer specializing in TypeScript.';
      const userMessage = 'Review this code:\n```\nfunction add(a: number, b: number) { return a + b; }\n```';

      const estimated = manager.estimateInputTokens(systemPrompt, userMessage);
      const counter = TokenCounter.getInstance();
      const directCount = counter.countPromptTokens(systemPrompt, userMessage);

      // 预估值应与直接计数完全一致（同一个底层实现）
      expect(estimated).toBe(directCount.totalTokens);
    });

    it('已知 prompt 的 token 预估误差不超过 5%', () => {
      // 构造一个已知内容的 prompt
      const systemPrompt = 'You are a helpful assistant.';
      const userMessage = 'What is the capital of France?';

      const estimated = manager.estimateInputTokens(systemPrompt, userMessage);

      // 使用 TokenCounter 作为基准值
      const counter = TokenCounter.getInstance();
      const baseline = counter.countPromptTokens(systemPrompt, userMessage).totalTokens;

      // 误差不超过 5%
      const errorRate = Math.abs(estimated - baseline) / baseline;
      expect(errorRate).toBeLessThan(0.05);
    });

    it('中文 prompt 的 token 预估也应准确', () => {
      const systemPrompt = '你是一个代码审查专家，专注于发现逻辑错误。';
      const userMessage = '请审查以下代码变更：\n```diff\n+const x = 1;\n-const x = 2;\n```';

      const estimated = manager.estimateInputTokens(systemPrompt, userMessage);
      expect(estimated).toBeGreaterThan(0);

      // 与直接计数对比
      const counter = TokenCounter.getInstance();
      const baseline = counter.countPromptTokens(systemPrompt, userMessage).totalTokens;
      expect(estimated).toBe(baseline);
    });

    it('长文本 prompt 预估也应准确', () => {
      const systemPrompt = 'System prompt instructions. '.repeat(100);
      const userMessage = 'User message content with code. '.repeat(200);

      const estimated = manager.estimateInputTokens(systemPrompt, userMessage);
      const counter = TokenCounter.getInstance();
      const baseline = counter.countPromptTokens(systemPrompt, userMessage).totalTokens;

      const errorRate = Math.abs(estimated - baseline) / baseline;
      expect(errorRate).toBeLessThan(0.05);
    });
  });

  describe('exceedsThreshold', () => {
    it('短 prompt 不应超出阈值', () => {
      const exceeds = manager.exceedsThreshold(
        'Short system prompt',
        'Short user message',
        'claude-sonnet-4-20250514',
      );
      expect(exceeds).toBe(false);
    });

    it('极长 prompt 应超出阈值', () => {
      const longPrompt = 'x '.repeat(200000);
      const exceeds = manager.exceedsThreshold(
        longPrompt,
        'user message',
        'claude-sonnet-4-20250514',
      );
      expect(exceeds).toBe(true);
    });
  });

  describe('estimateAgentCost', () => {
    it('应返回正确的成本结构', () => {
      const estimate = manager.estimateAgentCost(
        'logic-agent',
        'You are a code reviewer.',
        'Review this code: const x = 1;',
        'claude-sonnet-4-20250514',
        4000,
      );

      expect(estimate.agentId).toBe('logic-agent');
      expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedOutputTokens).toBe(4000);
      expect(estimate.estimatedTotalTokens).toBe(
        estimate.estimatedInputTokens + estimate.estimatedOutputTokens,
      );
      expect(estimate.estimatedInputCost).toBeGreaterThan(0);
      expect(estimate.estimatedOutputCost).toBeGreaterThan(0);
      expect(estimate.estimatedTotalCost).toBeCloseTo(
        estimate.estimatedInputCost + estimate.estimatedOutputCost,
        10,
      );
    });

    it('不同模型的成本应不同', () => {
      const prompt = 'You are a code reviewer.';
      const message = 'Review this code.';

      const sonnetEstimate = manager.estimateAgentCost(
        'agent', prompt, message, 'claude-sonnet-4-20250514', 4000,
      );
      const haikuEstimate = manager.estimateAgentCost(
        'agent', prompt, message, 'claude-3-5-haiku-20241022', 4000,
      );

      // Haiku 应该更便宜
      expect(haikuEstimate.estimatedTotalCost).toBeLessThan(sonnetEstimate.estimatedTotalCost);
    });
  });

  describe('estimateCost - 成本报告', () => {
    it('应返回包含 perAgent 和 total 的结构化报告', () => {
      const agents = [
        {
          agentId: 'logic-agent',
          systemPrompt: 'You are a logic reviewer.',
          userMessage: 'Review this code.',
          maxOutputTokens: 4000,
        },
        {
          agentId: 'security-agent',
          systemPrompt: 'You are a security reviewer.',
          userMessage: 'Review this code.',
          maxOutputTokens: 4000,
        },
      ];

      const report = manager.estimateCost(agents, 'claude-sonnet-4-20250514');

      // 结构验证
      expect(report.model).toBe('claude-sonnet-4-20250514');
      expect(report.perAgent).toHaveLength(2);
      expect(report.perAgent[0].agentId).toBe('logic-agent');
      expect(report.perAgent[1].agentId).toBe('security-agent');

      // token 数量验证
      expect(report.totalInputTokens).toBeGreaterThan(0);
      expect(report.totalOutputTokens).toBeGreaterThan(0);
      expect(report.totalTokens).toBe(report.totalInputTokens + report.totalOutputTokens);

      // 成本验证（正数）
      expect(report.totalInputCost).toBeGreaterThan(0);
      expect(report.totalOutputCost).toBeGreaterThan(0);
      expect(report.totalCost).toBeGreaterThan(0);
    });

    it('perAgent 合计应等于 total', () => {
      const agents = [
        {
          agentId: 'agent-1',
          systemPrompt: 'Prompt 1',
          userMessage: 'Message 1',
          maxOutputTokens: 4000,
        },
        {
          agentId: 'agent-2',
          systemPrompt: 'Prompt 2',
          userMessage: 'Message 2',
          maxOutputTokens: 4000,
        },
        {
          agentId: 'agent-3',
          systemPrompt: 'Prompt 3',
          userMessage: 'Message 3',
          maxOutputTokens: 4000,
        },
      ];

      const report = manager.estimateCost(agents);

      const sumInput = report.perAgent.reduce((s: number, a: AgentTokenEstimate) => s + a.estimatedInputTokens, 0);
      const sumOutput = report.perAgent.reduce((s: number, a: AgentTokenEstimate) => s + a.estimatedOutputTokens, 0);

      expect(report.totalInputTokens).toBe(sumInput);
      expect(report.totalOutputTokens).toBe(sumOutput);
    });

    it('空 agents 列表应返回零值报告', () => {
      const report = manager.estimateCost([]);

      expect(report.perAgent).toHaveLength(0);
      expect(report.totalInputTokens).toBe(0);
      expect(report.totalOutputTokens).toBe(0);
      expect(report.totalCost).toBe(0);
    });

    it('使用默认模型应正常工作', () => {
      const agents = [
        {
          agentId: 'test-agent',
          systemPrompt: 'System prompt',
          userMessage: 'User message',
        },
      ];

      const report = manager.estimateCost(agents);

      expect(report.model).toBe('claude-sonnet-4-20250514');
      expect(report.totalCost).toBeGreaterThan(0);
    });
  });

  describe('MODEL_CONFIGS 配置一致性', () => {
    it('所有配置的 contextWindow 应为正整数', () => {
      for (const key of Object.keys(MODEL_CONFIGS)) {
        const config = MODEL_CONFIGS[key];
        expect(config.contextWindow).toBeGreaterThan(0);
        expect(Number.isInteger(config.contextWindow)).toBe(true);
      }
    });

    it('maxInputTokens 应小于 contextWindow', () => {
      for (const key of Object.keys(MODEL_CONFIGS)) {
        const config = MODEL_CONFIGS[key];
        expect(config.maxInputTokens).toBeLessThan(config.contextWindow);
      }
    });

    it('价格应为正数', () => {
      for (const key of Object.keys(MODEL_CONFIGS)) {
        const config = MODEL_CONFIGS[key];
        expect(config.inputPricePerMillion).toBeGreaterThan(0);
        expect(config.outputPricePerMillion).toBeGreaterThan(0);
      }
    });
  });
});
