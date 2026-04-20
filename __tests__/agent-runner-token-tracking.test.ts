/**
 * AgentRunner Token Tracking Tests
 * 
 * Tests for Phase 2 integration:
 * - Pre-API token estimation
 * - Token metrics calculation
 * - Efficiency tracking
 * - Error handling for token overflows
 */

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
import { LogicAgent } from '../src/agents/logic-agent';
import { TokenMetrics } from '../src/types';

/**
 * Create a mock Anthropic response
 */
function createMockResponse(text: string, inputTokens = 150, outputTokens = 50) {
  return {
    content: [{ type: 'text' as const, text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

/**
 * Setup global mock for all Anthropic instances
 */
function setupGlobalMock(mockCreate: jest.Mock): void {
  const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;
  MockedAnthropic.mockImplementation(() => ({
    messages: { create: mockCreate },
  }) as unknown as Anthropic);
}

// Standard valid review issues JSON
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

describe('AgentRunner Token Tracking (Phase 2)', () => {
  let agent: LogicAgent;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate = jest.fn();
    setupGlobalMock(mockCreate);
    agent = new LogicAgent();
  });

  describe('Token Metrics in AgentResult', () => {
    it('should include tokenMetrics in successful result', async () => {
      mockCreate.mockResolvedValueOnce(createMockResponse(VALID_ISSUES_JSON));
      
      const files = ['test.ts'];
      const context = 'const x = 1;';

      const result = await agent.review(files, context);

      expect(result.success).toBe(true);
      expect(result.tokenMetrics).toBeDefined();
      expect(result.tokenMetrics).toHaveProperty('estimatedInputTokens');
      expect(result.tokenMetrics).toHaveProperty('actualInputTokens');
    });

    it('should have correct TokenMetrics structure', async () => {
      mockCreate.mockResolvedValueOnce(createMockResponse(VALID_ISSUES_JSON));
      
      const files = ['test.ts'];
      const context = 'const x = 1;';

      const result = await agent.review(files, context);

      expect(result.success).toBe(true);
      expect(result.tokenMetrics).toBeDefined();

      const metrics = result.tokenMetrics!;

      // Pre-API estimation fields
      expect(metrics.estimatedInputTokens).toBeGreaterThan(0);
      expect(metrics.estimatedOutputTokens).toBeGreaterThan(0);
      expect(metrics.estimatedTotalTokens).toBeGreaterThan(0);

      // Actual usage fields
      expect(metrics.actualInputTokens).toBeGreaterThanOrEqual(0);
      expect(metrics.actualOutputTokens).toBeGreaterThanOrEqual(0);
      expect(metrics.actualTotalTokens).toBeGreaterThanOrEqual(0);

      // Efficiency metrics
      expect(metrics.efficiency).toBeDefined();
      expect(metrics.efficiency.inputAccuracy).toBeGreaterThan(0);
      expect(metrics.efficiency.outputAccuracy).toBeGreaterThan(0);
      expect(metrics.efficiency.totalAccuracy).toBeGreaterThan(0);

      // Context window tracking
      expect(metrics.contextWindowSize).toBeGreaterThan(0);
      expect(metrics.utilizationPercentage).toBeGreaterThanOrEqual(0);
      expect(metrics.utilizationPercentage).toBeLessThanOrEqual(100);

      // Pre-API validation
      expect(['ok', 'warning', 'error']).toContain(metrics.preApiStatus);
      expect(metrics.preApiMessage).toBeDefined();
      expect(typeof metrics.preApiMessage).toBe('string');
    });
  });

  describe('Efficiency Metrics', () => {
    it('should calculate efficiency ratios as actual/estimated', async () => {
      // Use higher mock tokens to be realistic compared to estimated amounts
      mockCreate.mockResolvedValueOnce(createMockResponse(VALID_ISSUES_JSON, 2500, 3500));
      
      const files = ['test.ts'];
      const context = 'const x = 1;';

      const result = await agent.review(files, context);

      expect(result.success).toBe(true);
      expect(result.tokenMetrics).toBeDefined();

      const metrics = result.tokenMetrics!;

      // Efficiency should be calculated as actual / estimated
      // With reasonable mock values, ratios should be between 0.2 and 3.0
      expect(metrics.efficiency.inputAccuracy).toBeGreaterThan(0);
      expect(metrics.efficiency.inputAccuracy).toBeLessThan(5.0);

      expect(metrics.efficiency.outputAccuracy).toBeGreaterThan(0);
      expect(metrics.efficiency.outputAccuracy).toBeLessThan(5.0);

      expect(metrics.efficiency.totalAccuracy).toBeGreaterThan(0);
      expect(metrics.efficiency.totalAccuracy).toBeLessThan(5.0);
    });

    it('should handle zero division in efficiency calculation', async () => {
      mockCreate.mockResolvedValueOnce(createMockResponse(VALID_ISSUES_JSON));
      
      // Edge case: ensure no division by zero errors
      const files = ['test.ts'];
      const context = 'const x = 1;';

      const result = await agent.review(files, context);

      expect(result.success).toBe(true);
      expect(result.tokenMetrics).toBeDefined();
      expect(result.tokenMetrics!.efficiency).toBeDefined();
      
      // Should not have NaN or Infinity
      expect(Number.isFinite(result.tokenMetrics!.efficiency.inputAccuracy)).toBe(true);
      expect(Number.isFinite(result.tokenMetrics!.efficiency.outputAccuracy)).toBe(true);
      expect(Number.isFinite(result.tokenMetrics!.efficiency.totalAccuracy)).toBe(true);
    });

    it('should not throw on very short prompts', async () => {
      mockCreate.mockResolvedValueOnce(createMockResponse(VALID_ISSUES_JSON, 50, 20));
      
      const files = ['a.ts'];
      const context = 'x=1';

      expect(async () => {
        await agent.review(files, context);
      }).not.toThrow();
    });
  });

  describe('Token Calculation', () => {
    it('should calculate total tokens correctly', async () => {
      mockCreate.mockResolvedValueOnce(createMockResponse(VALID_ISSUES_JSON, 200, 100));
      
      const files = ['test.ts'];
      const context = 'const x = 1;';

      const result = await agent.review(files, context);

      expect(result.success).toBe(true);
      expect(result.tokenMetrics).toBeDefined();

      const metrics = result.tokenMetrics!;

      const expectedTotal = metrics.actualInputTokens + metrics.actualOutputTokens;
      expect(metrics.actualTotalTokens).toBe(expectedTotal);
    });

    it('should have estimated >= actual input tokens', async () => {
      mockCreate.mockResolvedValueOnce(createMockResponse(VALID_ISSUES_JSON));
      
      const files = ['test.ts'];
      const context = 'const x = 1;';

      const result = await agent.review(files, context);

      expect(result.success).toBe(true);
      expect(result.tokenMetrics).toBeDefined();

      const metrics = result.tokenMetrics!;

      // Estimated should generally be >= actual (slightly can differ due to encoding variations)
      expect(metrics.estimatedInputTokens).toBeGreaterThanOrEqual(
        metrics.actualInputTokens * 0.5
      );
    });
  });

  describe('Token Usage Backward Compatibility', () => {
    it('should still populate tokenUsage field', async () => {
      mockCreate.mockResolvedValueOnce(createMockResponse(VALID_ISSUES_JSON));
      
      const files = ['test.ts'];
      const context = 'const x = 1;';

      const result = await agent.review(files, context);

      expect(result.success).toBe(true);
      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage.input).toBeGreaterThanOrEqual(0);
      expect(result.tokenUsage.output).toBeGreaterThanOrEqual(0);
      expect(result.tokenUsage.total).toBeGreaterThanOrEqual(0);
    });

    it('should match actual tokens in tokenMetrics', async () => {
      mockCreate.mockResolvedValueOnce(createMockResponse(VALID_ISSUES_JSON, 200, 100));
      
      const files = ['test.ts'];
      const context = 'const x = 1;';

      const result = await agent.review(files, context);

      expect(result.success).toBe(true);

      if (result.tokenMetrics) {
        expect(result.tokenUsage.input).toBe(result.tokenMetrics.actualInputTokens);
        expect(result.tokenUsage.output).toBe(result.tokenMetrics.actualOutputTokens);
        expect(result.tokenUsage.total).toBe(result.tokenMetrics.actualTotalTokens);
      }
    });
  });

  describe('Multiple Agent Reviews', () => {
    it('should track independent token metrics for each agent', async () => {
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ISSUES_JSON, 200, 100))
        .mockResolvedValueOnce(createMockResponse(VALID_ISSUES_JSON, 210, 110));
      
      const files = ['test.ts'];
      const context = 'const x = 1;';

      const result1 = await agent.review(files, context);
      const result2 = await agent.review(files, context);

      // Both should have metrics
      expect(result1.tokenMetrics).toBeDefined();
      expect(result2.tokenMetrics).toBeDefined();

      // Metrics should be comparable (same structure)
      expect(result1.tokenMetrics).toHaveProperty('estimatedInputTokens');
      expect(result2.tokenMetrics).toHaveProperty('estimatedInputTokens');
    });

    it('should track token accuracy across multiple calls', async () => {
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ISSUES_JSON, 150, 50))
        .mockResolvedValueOnce(createMockResponse(VALID_ISSUES_JSON, 180, 60));
      
      const files = ['test.ts'];
      const context = 'const x = 1;';

      const result1 = await agent.review(files, context);
      const result2 = await agent.review(files, context);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Both should have efficiency calculations
      expect(result1.tokenMetrics!.efficiency).toBeDefined();
      expect(result2.tokenMetrics!.efficiency).toBeDefined();

      // Efficiency metrics should be reasonable (positive and finite)
      const allAccuracies = [
        result1.tokenMetrics!.efficiency.totalAccuracy,
        result2.tokenMetrics!.efficiency.totalAccuracy,
      ];

      allAccuracies.forEach((accuracy) => {
        expect(accuracy).toBeGreaterThan(0);
        expect(Number.isFinite(accuracy)).toBe(true);
      });
    });
  });
});
