/**
 * Token Estimator Tests
 */

import { 
  TokenEstimator, 
  estimate, 
  validateTokens,
  type TokenEstimate 
} from '../token-estimator';

describe('TokenEstimator', () => {
  let estimator: TokenEstimator;

  beforeEach(() => {
    estimator = new TokenEstimator();
  });

  describe('estimate', () => {
    it('should estimate basic tokens', () => {
      const result = estimator.estimate(
        'You are helpful.',
        'Help me.',
        1000,
        'claude-sonnet-4-20250514'
      );

      expect(result.totalInputTokens).toBeGreaterThan(0);
      expect(result.estimatedOutputTokens).toBe(1000);
      expect(result.estimatedTotalTokens).toBeGreaterThan(result.estimatedOutputTokens);
      expect(result.model).toBe('claude-sonnet-4-20250514');
      expect(result.contextWindowSize).toBe(200000);
      expect(result.utilizationPercentage).toBeGreaterThan(0);
      expect(result.utilizationPercentage).toBeLessThan(100);
      expect(result.status).toBe('ok');
      expect(result.exceedsWindow).toBe(false);
    });

    it('should handle large prompts', () => {
      const largePrompt = 'System instructions. '.repeat(500);
      const largeMessage = 'User message content. '.repeat(500);

      const result = estimator.estimate(
        largePrompt,
        largeMessage,
        4000,
        'claude-sonnet-4-20250514'
      );

      expect(result.totalInputTokens).toBeGreaterThan(0);
      expect(result.status).toBe('ok'); // Should still be ok with 200k context
    });

    it('should detect warning status for high utilization', () => {
      // Create estimate that uses significant tokens
      const result = estimator.estimate(
        'System. '.repeat(100),
        'Message. '.repeat(500),
        100000, // Very large output request
        'claude-sonnet-4-20250514'
      );

      if (result.utilizationPercentage > 80) {
        expect(result.status).toBe('warning');
      }
    });

    it('should detect error status for exceeding context', () => {
      // Try to use more than context window
      const result = estimator.estimate(
        'System. '.repeat(10),
        'Message. '.repeat(10),
        210000, // More than 200k window
        'claude-sonnet-4-20250514'
      );

      expect(result.exceedsWindow).toBe(true);
      expect(result.status).toBe('error');
    });

    it('should include status message', () => {
      const result = estimator.estimate(
        'You are helpful.',
        'Help me.',
        1000,
        'claude-sonnet-4-20250514'
      );

      expect(result.statusMessage).toBeDefined();
      expect(result.statusMessage.length).toBeGreaterThan(0);
    });

    it('should use default values', () => {
      const result = estimator.estimate(
        'You are helpful.',
        'Help me.'
      );

      expect(result.model).toBe('claude-sonnet-4-20250514');
      expect(result.estimatedOutputTokens).toBe(4000);
    });
  });

  describe('getContextWindow', () => {
    it('should return correct context window for known models', () => {
      const window1 = estimator.getContextWindow('claude-sonnet-4-20250514');
      const window2 = estimator.getContextWindow('claude-opus-4-1-20250805');
      
      expect(window1.maxTokens).toBe(200000);
      expect(window2.maxTokens).toBe(200000);
      expect(window1.recommendedBuffer).toBeGreaterThan(0);
    });

    it('should return default for unknown models', () => {
      const window = estimator.getContextWindow('unknown-model-xyz');
      expect(window.maxTokens).toBe(200000);
      expect(window.recommendedBuffer).toBeGreaterThan(0);
    });
  });

  describe('isValid', () => {
    it('should return true for ok status', () => {
      const result = estimator.estimate(
        'You are helpful.',
        'Help me.',
        1000,
        'claude-sonnet-4-20250514'
      );

      expect(estimator.isValid(result)).toBe(true);
    });

    it('should return false for error status', () => {
      const result = estimator.estimate(
        'a',
        'b',
        210000, // Exceeds window
        'claude-sonnet-4-20250514'
      );

      expect(estimator.isValid(result)).toBe(false);
    });

    it('should throw on error when requested', () => {
      const result = estimator.estimate(
        'a',
        'b',
        210000,
        'claude-sonnet-4-20250514'
      );

      expect(() => estimator.isValid(result, true)).toThrow();
    });
  });

  describe('summarize', () => {
    it('should generate human-readable summary', () => {
      const result = estimator.estimate(
        'You are helpful.',
        'Help me.',
        1000,
        'claude-sonnet-4-20250514'
      );

      const summary = estimator.summarize(result);
      expect(summary).toContain('claude-sonnet-4-20250514');
      expect(summary).toContain('输入');
      expect(summary).toContain('输出预估');
      expect(summary).toContain('总计');
      expect(summary).toContain('状态');
    });
  });

  describe('calculateSavings', () => {
    it('should calculate token savings', () => {
      const original = 'You are a comprehensive code reviewer with deep expertise in software engineering. ' +
                      'Your role is to thoroughly review code and provide detailed feedback. ' +
                      'Please consider all aspects including performance, security, and maintainability.';
      
      const improved = 'Review code: performance, security, maintainability.';
      
      const savings = estimator.calculateSavings(original, improved, 'Review this code.');
      
      expect(savings.tokensSaved).toBeGreaterThanOrEqual(0);
      expect(savings.percentageSaved).toBeGreaterThanOrEqual(0);
      expect(savings.percentageSaved).toBeLessThanOrEqual(100);
    });

    it('should handle identical prompts', () => {
      const prompt = 'Same prompt';
      
      const savings = estimator.calculateSavings(prompt, prompt, 'Message');
      
      expect(savings.tokensSaved).toBe(0);
      expect(savings.percentageSaved).toBe(0);
    });
  });
});

describe('Convenience functions', () => {
  it('estimate should return estimate', () => {
    const result = estimate(
      'You are helpful.',
      'Help me.',
      1000,
      'claude-sonnet-4-20250514'
    );

    expect(result.totalInputTokens).toBeGreaterThan(0);
    expect(result.status).toBe('ok');
  });

  it('validateTokens should return boolean', () => {
    const valid = validateTokens(
      'You are helpful.',
      'Help me.',
      1000,
      'claude-sonnet-4-20250514'
    );

    expect(typeof valid).toBe('boolean');
    expect(valid).toBe(true);
  });

  it('validateTokens should throw when requested', () => {
    expect(() => {
      validateTokens(
        'a',
        'b',
        210000, // Exceeds window
        'claude-sonnet-4-20250514',
        true // throwOnError
      );
    }).toThrow();
  });
});
