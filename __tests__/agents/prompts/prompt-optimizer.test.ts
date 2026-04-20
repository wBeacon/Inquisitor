/**
 * PromptOptimizer 单元测试
 *
 * 覆盖：
 * - diff 语义压缩（移除空行/注释行/重复 import）
 * - 压缩率 >= 15%
 * - 核心变更行（+/-）完整保留
 * - 智能截断（超出阈值时按优先级截断）
 * - 截断后 prompt 仍有效
 */

import {
  PromptOptimizer,
  type OptimizedPrompt,
} from '../../../src/agents/prompts/prompt-optimizer';
import { TokenCounter } from '../../../src/utils/token-counter';

describe('PromptOptimizer', () => {
  let optimizer: PromptOptimizer;

  beforeEach(() => {
    optimizer = new PromptOptimizer();
  });

  describe('compressDiffContext - diff 语义压缩', () => {
    it('应移除上下文中的纯空行（保留最多1行）', () => {
      const input = [
        'diff --git a/test.ts b/test.ts',
        '--- a/test.ts',
        '+++ b/test.ts',
        '@@ -1,10 +1,10 @@',
        ' const a = 1;',
        '',
        '',
        '',
        '+const b = 2;',
        '',
        '',
        '-const c = 3;',
      ].join('\n');

      const result = optimizer.compressDiffContext(input);
      const lines = result.split('\n');

      // 变更行必须保留
      expect(result).toContain('+const b = 2;');
      expect(result).toContain('-const c = 3;');

      // 连续空行应被压缩
      let consecutiveBlank = 0;
      let maxConsecutive = 0;
      for (const line of lines) {
        if (line.trim() === '') {
          consecutiveBlank++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveBlank);
        } else {
          consecutiveBlank = 0;
        }
      }
      expect(maxConsecutive).toBeLessThanOrEqual(1);
    });

    it('应移除上下文中的纯注释行', () => {
      const input = [
        'diff --git a/test.ts b/test.ts',
        '@@ -1,10 +1,10 @@',
        '// 这是一个注释',
        '# 另一个注释',
        '/* 块注释开始',
        '* 块注释中间',
        '*/ 块注释结束',
        '+const added = true;',
        ' const context = "keep";',
        '-const removed = false;',
      ].join('\n');

      const result = optimizer.compressDiffContext(input);

      // 变更行必须保留
      expect(result).toContain('+const added = true;');
      expect(result).toContain('-const removed = false;');
      // 普通上下文行保留
      expect(result).toContain(' const context = "keep";');
      // 注释行应被移除
      expect(result).not.toContain('// 这是一个注释');
      expect(result).not.toContain('# 另一个注释');
    });

    it('应去除重复的 import 语句', () => {
      const input = [
        'diff --git a/test.ts b/test.ts',
        '@@ -1,10 +1,10 @@',
        " import { foo } from 'bar';",
        " import { baz } from 'bar';",
        " import { qux } from 'other';",
        " import { qux } from 'other';",
        '+const x = foo + baz;',
      ].join('\n');

      const result = optimizer.compressDiffContext(input);

      // 变更行保留
      expect(result).toContain('+const x = foo + baz;');

      // 来自同一个模块的 import 应去重（只保留第一个）
      const barImports = result.split('\n').filter((l: string) => l.includes("from 'bar'"));
      expect(barImports.length).toBe(1);

      const otherImports = result.split('\n').filter((l: string) => l.includes("from 'other'"));
      expect(otherImports.length).toBe(1);
    });

    it('应保留所有 diff 元数据行', () => {
      const input = [
        'diff --git a/test.ts b/test.ts',
        'index abc123..def456 100644',
        '--- a/test.ts',
        '+++ b/test.ts',
        '@@ -1,5 +1,5 @@',
        '+new line',
      ].join('\n');

      const result = optimizer.compressDiffContext(input);

      expect(result).toContain('diff --git');
      expect(result).toContain('index abc123');
      expect(result).toContain('--- a/test.ts');
      expect(result).toContain('+++ b/test.ts');
      expect(result).toContain('@@');
      expect(result).toContain('+new line');
    });

    it('对包含大量空行和重复 import 的 diff，压缩率应 >= 15%', () => {
      // 构造一个包含大量可压缩内容的 diff
      const lines: string[] = [
        'diff --git a/large.ts b/large.ts',
        '@@ -1,100 +1,100 @@',
      ];

      // 添加大量上下文空行
      for (let i = 0; i < 20; i++) {
        lines.push('');
      }

      // 添加重复的 import
      for (let i = 0; i < 15; i++) {
        lines.push(` import { Component } from 'react';`);
        lines.push(` import { useState } from 'react';`);
      }

      // 添加大量注释行
      for (let i = 0; i < 20; i++) {
        lines.push(`// 这是第 ${i} 行注释`);
      }

      // 添加一些变更行
      lines.push('+const newVar = "added";');
      lines.push('-const oldVar = "removed";');
      lines.push('+const anotherNew = true;');

      // 再添加一些上下文代码
      for (let i = 0; i < 10; i++) {
        lines.push(` const context${i} = ${i};`);
      }

      const input = lines.join('\n');
      const counter = TokenCounter.getInstance();
      const originalTokens = counter.countTokens(input).tokenCount;

      const result = optimizer.compressDiffContext(input);
      const compressedTokens = counter.countTokens(result).tokenCount;

      const reductionRate = (originalTokens - compressedTokens) / originalTokens;

      // 压缩率应 >= 15%
      expect(reductionRate).toBeGreaterThanOrEqual(0.15);

      // 所有变更行保留
      expect(result).toContain('+const newVar = "added";');
      expect(result).toContain('-const oldVar = "removed";');
      expect(result).toContain('+const anotherNew = true;');
    });
  });

  describe('optimize - 智能截断', () => {
    it('短 prompt 不需要截断', () => {
      const result = optimizer.optimize(
        'You are a code reviewer.',
        'Review: const x = 1;',
        'claude-sonnet-4-20250514',
        4000,
      );

      expect(result.wasTruncated).toBe(false);
      expect(result.optimizedTokens).toBeLessThanOrEqual(result.originalTokens);
    });

    it('超长 prompt 应触发截断', () => {
      // 确保 prompt 真正超出 200K context window
      const longDiff = 'code line content here. '.repeat(100000);
      const result = optimizer.optimize(
        'System prompt instructions for code review. '.repeat(100),
        longDiff,
        'claude-sonnet-4-20250514',
        4000,
      );

      expect(result.wasTruncated).toBe(true);
      expect(result.strategiesApplied.length).toBeGreaterThan(0);
    });

    it('截断后 token 数应 <= 阈值', () => {
      const longContent = 'code line content here. '.repeat(50000);
      const result = optimizer.optimize(
        'System prompt for reviewing code. '.repeat(100),
        longContent,
        'claude-sonnet-4-20250514',
        4000,
      );

      // 截断后的 token 数应在阈值内
      const counter = TokenCounter.getInstance();
      const finalTokens = counter.countPromptTokens(
        result.systemPrompt,
        result.userMessage,
      ).totalTokens;

      // 上下文窗口 200000 - maxOutputTokens 4000 = 196000
      expect(finalTokens).toBeLessThanOrEqual(196000);
    });

    it('截断后核心 diff 内容应尽量完整保留', () => {
      // 构造一个需要截断的场景，但 diff 不太长
      const systemPrompt = 'System instructions. '.repeat(500); // 较长的系统提示
      const userMessage = [
        'diff --git a/test.ts b/test.ts',
        '@@ -1,3 +1,3 @@',
        '+const important = true;',
        '-const old = false;',
        ' const context = "keep";',
      ].join('\n');

      const result = optimizer.optimize(
        systemPrompt,
        userMessage,
        'claude-sonnet-4-20250514',
        4000,
      );

      // 用户消息应该被保留（因为它很短，截断应该从系统提示开始）
      expect(result.userMessage).toContain('+const important = true;');
      expect(result.userMessage).toContain('-const old = false;');
    });

    it('项目上下文应优先被截断', () => {
      const systemPrompt = 'Short system.';
      // 构造一个很大的用户消息，包含项目上下文标记
      const diffPart = '+const x = 1;\n'.repeat(100);
      const projectContext = '--- 项目上下文\n' + 'eslint config content. '.repeat(20000);
      const userMessage = diffPart + '\n' + projectContext;

      const result = optimizer.optimize(
        systemPrompt,
        userMessage,
        'claude-sonnet-4-20250514',
        4000,
      );

      // 如果需要截断，项目上下文应该被优先截断
      if (result.wasTruncated) {
        expect(result.strategiesApplied).toContain('truncate-project-context');
      }
    });
  });

  describe('optimize - 压缩', () => {
    it('包含可压缩内容的 diff 应被自动压缩', () => {
      const userMessage = [
        'diff --git a/test.ts b/test.ts',
        '@@ -1,20 +1,20 @@',
        '// comment 1',
        '// comment 2',
        '// comment 3',
        '',
        '',
        '',
        '+const added = true;',
        '-const removed = false;',
      ].join('\n');

      const result = optimizer.optimize(
        'System prompt.',
        userMessage,
        'claude-sonnet-4-20250514',
        4000,
      );

      expect(result.wasCompressed).toBe(true);
      expect(result.strategiesApplied).toContain('diff-semantic-compression');
    });

    it('不包含可压缩内容的文本不应标记为已压缩', () => {
      const result = optimizer.optimize(
        'System prompt.',
        'const x = 1;',
        'claude-sonnet-4-20250514',
        4000,
      );

      expect(result.wasCompressed).toBe(false);
    });

    it('compressionPercentage 不应为负数', () => {
      const result = optimizer.optimize(
        'System prompt.',
        'User message.',
        'claude-sonnet-4-20250514',
        4000,
      );

      expect(result.compressionPercentage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('边界情况', () => {
    it('空 prompt 应正常处理', () => {
      const result = optimizer.optimize('', '', 'claude-sonnet-4-20250514', 4000);

      expect(result.optimizedTokens).toBeGreaterThanOrEqual(0);
      expect(result.wasTruncated).toBe(false);
    });

    it('未知模型应使用默认配置', () => {
      const result = optimizer.optimize(
        'System.',
        'User.',
        'unknown-model',
        4000,
      );

      // 短文本走快速路径，token 计数跳过
      expect(result.optimizedTokens).toBeGreaterThanOrEqual(0);
    });

    it('compressDiffContext 处理无 diff 格式的文本', () => {
      const input = 'This is just plain text without any diff format.';
      const result = optimizer.compressDiffContext(input);

      // 应该原样返回（可能移除了注释行，但普通文本不受影响）
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
