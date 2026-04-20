/**
 * Token Counter Tests
 */

import { TokenCounter, countTokens, countPromptTokens } from '../token-counter';

describe('TokenCounter', () => {
  let counter: TokenCounter;

  beforeEach(() => {
    counter = TokenCounter.getInstance();
  });

  describe('countTokens', () => {
    it('should count tokens in simple text', () => {
      const result = counter.countTokens('Hello, world!');
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.charCount).toBe('Hello, world!'.length);
      expect(result.text).toBe('Hello, world!');
    });

    it('should handle empty string', () => {
      const result = counter.countTokens('');
      expect(result.tokenCount).toBe(0);
      expect(result.charCount).toBe(0);
    });

    it('should handle long text and generate preview', () => {
      const longText = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
      const result = counter.countTokens(longText);
      expect(result.tokenCount).toBeGreaterThan(100);
      expect(result.charCount).toBe(longText.length);
      expect(result.textPreview.length).toBeLessThanOrEqual(100);
    });

    it('should handle Chinese text', () => {
      const chineseText = '这是中文文本，用来测试token计数功能';
      const result = counter.countTokens(chineseText);
      expect(result.tokenCount).toBeGreaterThan(0);
    });

    it('should handle code snippets', () => {
      const code = `function test() {
        const x = 42;
        return x * 2;
      }`;
      const result = counter.countTokens(code);
      expect(result.tokenCount).toBeGreaterThan(0);
    });
  });

  describe('countPromptTokens', () => {
    it('should count prompt + message tokens with overhead', () => {
      const systemPrompt = 'You are a helpful assistant.';
      const userMessage = 'What is 2 + 2?';
      
      const result = counter.countPromptTokens(systemPrompt, userMessage);
      
      expect(result.systemPromptTokens).toBeGreaterThan(0);
      expect(result.userMessageTokens).toBeGreaterThan(0);
      expect(result.overheadTokens).toBeGreaterThan(0);
      expect(result.totalTokens).toBe(
        result.systemPromptTokens + result.userMessageTokens + result.overheadTokens
      );
    });

    it('should handle empty prompts', () => {
      const result = counter.countPromptTokens('', '');
      expect(result.totalTokens).toBeGreaterThan(0); // Should include format overhead
      expect(result.overheadTokens).toBeGreaterThan(0);
    });

    it('should handle large prompts', () => {
      const largeSystemPrompt = 'System instructions. '.repeat(50);
      const largeUserMessage = 'User message. '.repeat(50);
      
      const result = counter.countPromptTokens(largeSystemPrompt, largeUserMessage);
      expect(result.totalTokens).toBeGreaterThan(200);
    });
  });

  describe('estimateOutputTokens', () => {
    it('should estimate output tokens based on character count', () => {
      const estimate1 = counter.estimateOutputTokens(4000);
      const estimate2 = counter.estimateOutputTokens(8000);
      
      expect(estimate1).toBeGreaterThan(0);
      expect(estimate2).toBeGreaterThan(estimate1); // More chars = more tokens
    });
  });

  describe('compareEfficiency', () => {
    it('should compare text efficiency', () => {
      const text1 = 'Review code';
      const text2 = 'I request that you perform a comprehensive review of the code';
      
      const diff = counter.compareEfficiency(text1, text2);
      expect(diff).toBeGreaterThan(0); // text2 is less efficient
    });
  });
});

describe('TokenCounter singleton', () => {
  it('should return same instance', () => {
    const counter1 = TokenCounter.getInstance();
    const counter2 = TokenCounter.getInstance();
    
    expect(counter1).toBe(counter2);
  });
});

describe('Convenience functions', () => {
  it('countTokens should work', () => {
    const result = countTokens('Hello, world!');
    expect(result.tokenCount).toBeGreaterThan(0);
  });

  it('countPromptTokens should work', () => {
    const result = countPromptTokens('You are helpful.', 'Help me.');
    expect(result.totalTokens).toBeGreaterThan(0);
  });
});
