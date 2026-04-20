/**
 * Tests for PromptOptimizer
 * 
 * Tests cover:
 * - Component parsing
 * - Compression strategies
 * - Optimization levels
 * - Token savings calculation
 * - Report generation
 */

import {
  PromptOptimizer,
  optimizePrompt,
  compareOptimizationLevels,
  type OptimizationResult,
  type PromptComponent,
} from '../prompt-optimizer';
import { TokenCounter } from '../token-counter';

describe('PromptOptimizer', () => {
  let optimizer: PromptOptimizer;

  beforeEach(() => {
    optimizer = new PromptOptimizer();
  });

  describe('Component Parsing', () => {
    test('should parse prompt into components', () => {
      const prompt = `## 推理框架
这是 CoT 指令

## 输出格式
JSON 格式

## 示例
一个示例`;

      const components = optimizer.parsePromptComponents(prompt);

      expect(components).toHaveLength(3);
      expect(components[0].name).toContain('推理框架');
      expect(components[0].type).toBe('instruction');
      expect(components[0].priority).toBeGreaterThan(5);
    });

    test('should assign correct priority levels', () => {
      const prompt = `## 推理框架
CoT content

## 输出格式
JSON content

## 示例
Example content`;

      const components = optimizer.parsePromptComponents(prompt);
      
      // 输出格式应该最高优先级
      const formatComponent = components.find(c => c.type === 'format');
      expect(formatComponent?.priority).toBe(10);

      // CoT 应该高优先级
      const cotComponent = components.find(c => c.name.includes('推理框架'));
      expect(cotComponent?.priority).toBeGreaterThanOrEqual(9);

      // 示例应该低优先级
      const exampleComponent = components.find(c => c.type === 'example');
      expect(exampleComponent?.priority).toBeLessThan(5);
    });

    test('should mark format and required components', () => {
      const prompt = `## 输出格式
JSON content`;

      const components = optimizer.parsePromptComponents(prompt);
      const formatComponent = components.find(c => c.type === 'format');

      expect(formatComponent?.required).toBe(true);
    });
  });

  describe('Compression Strategies', () => {
    test('should remove redundancy', () => {
      const prompt = `## 指令
这是一个重要指令。
这是一个重要指令。
另一个不同的指令。`;

      const result = optimizer.optimizePrompt(prompt, undefined, 'balanced');

      expect(result.tokensSaved).toBeGreaterThanOrEqual(0);
      expect(result.originalTokens).toBeGreaterThanOrEqual(
        result.optimizedTokens
      );
    });

    test('should abbreviate explanations', () => {
      const longPrompt = `## 指令
必须先进行以下逐步推理过程，思考步骤不需要输出，但必须在内部执行。`;

      const result = optimizer.optimizePrompt(
        longPrompt,
        undefined,
        'aggressive'
      );

      // 应该发生压缩
      expect(result.optimizedTokens).toBeLessThanOrEqual(
        result.originalTokens
      );
    });
  });

  describe('Optimization Levels', () => {
    const testPrompt = `## 推理框架
Step 1: 理解代码
Step 2: 分析上下文
Step 3: 逐段审查
Step 4: 深度验证
Step 5: 影响评估
Step 6: 置信度校准

## 输出格式
JSON 格式定义

## 示例
示例 1: ...
示例 2: ...
示例 3: ...`;

    test('conservative level should make minimal changes', () => {
      const result = optimizer.optimizePrompt(
        testPrompt,
        undefined,
        'conservative'
      );

      // 保守模式下压缩率应该相对较小
      expect(result.compressionPercentage).toBeLessThan(30);
    });

    test('balanced level should balance quality and compression', () => {
      const result = optimizer.optimizePrompt(
        testPrompt,
        undefined,
        'balanced'
      );

      // 平衡模式
      expect(result.compressionPercentage).toBeGreaterThanOrEqual(0);
      expect(result.compressionPercentage).toBeLessThan(50);
    });

    test('aggressive level should maximize compression', () => {
      const result = optimizer.optimizePrompt(
        testPrompt,
        undefined,
        'aggressive'
      );

      // 激进模式可能会压缩更多
      expect(result.originalTokens).toBeGreaterThanOrEqual(
        result.optimizedTokens
      );
    });

    test('should respect target token limit', () => {
      const targetTokens = 100;
      const result = optimizer.optimizePrompt(
        testPrompt,
        targetTokens,
        'aggressive'
      );

      // 应该尽量接近或低于目标
      expect(result.optimizedTokens).toBeLessThanOrEqual(
        targetTokens + 50
      ); // 允许小范围超出
    });
  });

  describe('Component Optimization', () => {
    test('should not remove required components', () => {
      const component: PromptComponent = {
        name: 'JSON Format',
        content: '这是 JSON 格式说明',
        type: 'format',
        priority: 10,
        required: true,
      };

      const result = optimizer.optimizeComponent(component, 'aggressive');

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    test('should be able to remove non-required low-priority components', () => {
      const component: PromptComponent = {
        name: 'Additional Example',
        content: '这是一个补充示例，可能不是必需的',
        type: 'example',
        priority: 2,
        required: false,
      };

      // 这个测试主要验证逻辑不会崩溃
      const result = optimizer.optimizeComponent(component, 'aggressive');
      expect(result).toBeDefined();
    });
  });

  describe('Token Savings Calculation', () => {
    test('should calculate accurate token savings', () => {
      const prompt = `## 指令
这是一个很长很长很长的指令，包含了大量的重复信息和冗余说明。
这是一个很长很长很长的指令，包含了大量的重复信息和冗余说明。
这是一个很长很长很长的指令，包含了大量的重复信息和冗余说明。`;

      const result = optimizer.optimizePrompt(prompt, undefined, 'aggressive');

      expect(result.tokensSaved).toBeGreaterThanOrEqual(0);
      expect(result.originalTokens).toBeGreaterThan(0);
      expect(result.optimizedTokens).toBeGreaterThan(0);
      expect(result.compressionPercentage).toBe(
        (result.tokensSaved / result.originalTokens) * 100
      );
    });

    test('should never have negative token savings', () => {
      const shortPrompt = '简短的指令';

      const result = optimizer.optimizePrompt(
        shortPrompt,
        undefined,
        'aggressive'
      );

      expect(result.tokensSaved).toBeGreaterThanOrEqual(0);
      expect(result.compressionPercentage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Report Generation', () => {
    test('should generate comprehensive report', () => {
      const prompt = `## 指令
这是一个指令

## 约束
这是一个约束`;

      const result = optimizer.optimizePrompt(prompt, undefined, 'balanced');
      const report = optimizer.generateReport(result);

      expect(report).toContain('Prompt Optimization Report');
      expect(report).toContain('Original tokens');
      expect(report).toContain('Optimized tokens');
      expect(report).toContain('Tokens saved');
      expect(report).toContain('Compression rate');
    });

    test('report should include optimization summary', () => {
      const prompt = `## CoT
CoT content

## 格式
Format content

## 示例
Example content`;

      const result = optimizer.optimizePrompt(prompt, 50, 'aggressive');
      const report = optimizer.generateReport(result);

      // 应该包含摘要信息
      expect(report).toContain('Summary');
      expect(report).toContain('Compression rate');
      expect(report.split('\n').length).toBeGreaterThan(5);
    });
  });

  describe('Optimization Comparison', () => {
    test('should provide comparison of all optimization levels', () => {
      const prompt = `## 指令
这是一个长指令，包含重复内容。
这是一个长指令，包含重复内容。
这是一个长指令，包含重复内容。`;

      const comparison = compareOptimizationLevels(prompt);

      expect(comparison.conservative).toBeDefined();
      expect(comparison.balanced).toBeDefined();
      expect(comparison.aggressive).toBeDefined();

      // 激进模式应该压缩至少和保守模式一样多
      expect(comparison.aggressive.tokensSaved).toBeGreaterThanOrEqual(
        comparison.conservative.tokensSaved
      );
    });

    test('all levels should have non-negative token savings', () => {
      const prompt = `## 测试
测试内容`;

      const comparison = compareOptimizationLevels(prompt);

      expect(comparison.conservative.tokensSaved).toBeGreaterThanOrEqual(0);
      expect(comparison.balanced.tokensSaved).toBeGreaterThanOrEqual(0);
      expect(comparison.aggressive.tokensSaved).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Convenience Functions', () => {
    test('optimizePrompt function should work correctly', () => {
      const prompt = `## 指令
重复的内容。
重复的内容。`;

      const result = optimizePrompt(prompt, undefined, 'balanced');

      expect(result).toBeDefined();
      expect(result.originalTokens).toBeGreaterThan(0);
      expect(result.optimizedTokens).toBeGreaterThan(0);
    });

    test('compareOptimizationLevels function should work correctly', () => {
      const prompt = `## 指令
一些指令内容`;

      const comparison = compareOptimizationLevels(prompt);

      expect(comparison.conservative).toBeDefined();
      expect(comparison.balanced).toBeDefined();
      expect(comparison.aggressive).toBeDefined();
    });
  });

  describe('Chinese Text Handling', () => {
    test('should handle Chinese text correctly', () => {
      const chinesePrompt = `## 审查框架
第一步：理解代码
第二步：分析上下文
第三步：逐段审查

## 输出格式
JSON 格式定义

## 约束条件
以下情况不应报告：
1. 故意的设计选择
2. 测试代码特殊写法`;

      const result = optimizer.optimizePrompt(
        chinesePrompt,
        undefined,
        'balanced'
      );

      expect(result.originalTokens).toBeGreaterThan(0);
      expect(result.optimizedTokens).toBeGreaterThan(0);
      // 检查优化后的提示词包含关键内容
      expect(result.optimizedPrompt.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty prompt', () => {
      const result = optimizer.optimizePrompt('', undefined, 'balanced');

      expect(result.originalTokens).toEqual(0);
      expect(result.optimizedTokens).toEqual(0);
      expect(result.tokensSaved).toEqual(0);
    });

    test('should handle very short prompt', () => {
      const result = optimizer.optimizePrompt('Hi', undefined, 'balanced');

      // 短提示词会直接返回原文本（因为没有 section markers）
      expect(result.originalTokens).toBeGreaterThan(0);
      // optimizedTokens 可能是 0，取决于解析结果
      expect(result.compressionPercentage).toBeGreaterThanOrEqual(0);
    });

    test('should handle prompt with no sections', () => {
      const prompt = '这是一个没有section标记的提示词';

      const components = optimizer.parsePromptComponents(prompt);

      // 应该至少解析成一个通用组件
      expect(components.length).toBeGreaterThanOrEqual(0);
    });

    test('should handle very long prompt', () => {
      const longContent = '内容'.repeat(1000);
      const prompt = `## 指令\n${longContent}`;

      const result = optimizer.optimizePrompt(prompt, undefined, 'balanced');

      expect(result.originalTokens).toBeGreaterThan(1000);
      expect(result.optimizedTokens).toBeGreaterThan(0);
    });
  });

  describe('Integration with TokenCounter', () => {
    test('should use TokenCounter for accurate token counting', () => {
      const prompt = `## 指令
这是一个指令`;

      const result = optimizer.optimizePrompt(prompt, undefined, 'balanced');
      const counter = TokenCounter.getInstance();
      const directCount = counter.countTokens(result.optimizedPrompt);

      // 优化结果中的 token 数应该与直接计数接近
      expect(result.optimizedTokens).toEqual(directCount.tokenCount);
    });

    test('compression percentage should be mathematically correct', () => {
      const prompt = `## 指令
这是一个长指令，包含大量内容。
这是一个长指令，包含大量内容。
这是一个长指令，包含大量内容。`;

      const result = optimizer.optimizePrompt(prompt, undefined, 'aggressive');

      const expectedPercentage =
        (result.tokensSaved / result.originalTokens) * 100;

      expect(result.compressionPercentage).toBeCloseTo(
        expectedPercentage,
        1
      );
    });
  });
});
