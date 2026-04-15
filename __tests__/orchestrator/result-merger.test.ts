import { ResultMerger } from '../../src/orchestrator/result-merger';
import { ReviewIssue, ReviewDimension, AgentResult, AdversaryResult, TokenUsage } from '../../src/types';

/**
 * 辅助函数：创建模拟 ReviewIssue
 */
function createIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    file: 'test.ts',
    line: 1,
    severity: 'medium',
    dimension: ReviewDimension.Logic,
    description: 'test issue',
    suggestion: 'fix it',
    confidence: 0.8,
    ...overrides,
  };
}

/**
 * 辅助函数：创建模拟 AgentResult
 */
function createAgentResult(
  agentId: string,
  issues: ReviewIssue[] = [],
  tokenUsage: TokenUsage = { input: 100, output: 50, total: 150 }
): AgentResult {
  return {
    agentId,
    issues,
    durationMs: 100,
    tokenUsage,
    success: true,
  };
}

describe('ResultMerger', () => {
  let merger: ResultMerger;

  beforeEach(() => {
    merger = new ResultMerger();
  });

  describe('collectIssues', () => {
    it('should collect issues from multiple agent results', () => {
      const results = [
        createAgentResult('agent-1', [createIssue({ description: 'issue 1' })]),
        createAgentResult('agent-2', [
          createIssue({ description: 'issue 2' }),
          createIssue({ description: 'issue 3' }),
        ]),
      ];

      const issues = merger.collectIssues(results);
      expect(issues).toHaveLength(3);
    });

    it('should return empty array for no results', () => {
      expect(merger.collectIssues([])).toEqual([]);
    });
  });

  describe('dedup', () => {
    it('should remove duplicate issues based on file:line:dimension:severity key', () => {
      const issues = [
        createIssue({ file: 'a.ts', line: 10, severity: 'high', confidence: 0.7 }),
        createIssue({ file: 'a.ts', line: 10, severity: 'high', confidence: 0.9 }),
        createIssue({ file: 'b.ts', line: 10, severity: 'high', confidence: 0.5 }),
      ];

      const deduped = merger.dedup(issues);
      expect(deduped).toHaveLength(2);
      // 保留置信度更高的
      const issueA = deduped.find((i) => i.file === 'a.ts');
      expect(issueA?.confidence).toBe(0.9);
    });

    it('should not dedup issues with different dimensions', () => {
      const issues = [
        createIssue({ dimension: ReviewDimension.Logic }),
        createIssue({ dimension: ReviewDimension.Security }),
      ];

      expect(merger.dedup(issues)).toHaveLength(2);
    });
  });

  describe('sort', () => {
    it('should sort by severity then confidence', () => {
      const issues = [
        createIssue({ severity: 'low', confidence: 0.9 }),
        createIssue({ severity: 'critical', confidence: 0.5 }),
        createIssue({ severity: 'medium', confidence: 0.7 }),
        createIssue({ severity: 'high', confidence: 0.8 }),
      ];

      const sorted = merger.sort(issues);
      expect(sorted[0].severity).toBe('critical');
      expect(sorted[1].severity).toBe('high');
      expect(sorted[2].severity).toBe('medium');
      expect(sorted[3].severity).toBe('low');
    });

    it('should sort same severity by confidence descending', () => {
      const issues = [
        createIssue({ severity: 'high', confidence: 0.5 }),
        createIssue({ severity: 'high', confidence: 0.9, line: 2 }),
        createIssue({ severity: 'high', confidence: 0.7, line: 3 }),
      ];

      const sorted = merger.sort(issues);
      expect(sorted[0].confidence).toBe(0.9);
      expect(sorted[1].confidence).toBe(0.7);
      expect(sorted[2].confidence).toBe(0.5);
    });

    it('should not mutate original array', () => {
      const issues = [
        createIssue({ severity: 'low' }),
        createIssue({ severity: 'critical', line: 2 }),
      ];
      const original = [...issues];
      merger.sort(issues);
      expect(issues[0].severity).toBe(original[0].severity);
    });
  });

  describe('applyConfidenceAdjustments', () => {
    it('should adjust confidence for specified indices', () => {
      const issues = [
        createIssue({ confidence: 0.8 }),
        createIssue({ confidence: 0.6, line: 2 }),
      ];

      const adjusted = merger.applyConfidenceAdjustments(issues, [
        { issueIndex: 0, newConfidence: 0.3, reason: 'looks like FP' },
      ]);

      expect(adjusted[0].confidence).toBe(0.3);
      expect(adjusted[1].confidence).toBe(0.6);
    });

    it('should clamp confidence to 0-1 range', () => {
      const issues = [createIssue({ confidence: 0.5 })];
      const adjusted = merger.applyConfidenceAdjustments(issues, [
        { issueIndex: 0, newConfidence: 1.5, reason: 'test' },
      ]);
      expect(adjusted[0].confidence).toBe(1);
    });
  });

  describe('processFalsePositives', () => {
    it('should remove low confidence false positives', () => {
      const issues = [
        createIssue({ confidence: 0.2 }), // 低于 0.3, 应被移除
        createIssue({ confidence: 0.8, line: 2 }),
      ];

      const processed = merger.processFalsePositives(issues, [0]);
      expect(processed).toHaveLength(1);
      expect(processed[0].line).toBe(2);
    });

    it('should downgrade severity for higher confidence false positives', () => {
      const issues = [
        createIssue({ confidence: 0.8, severity: 'critical' }),
      ];

      const processed = merger.processFalsePositives(issues, [0]);
      expect(processed).toHaveLength(1);
      expect(processed[0].severity).toBe('high');
    });

    it('should not affect non-false-positive issues', () => {
      const issues = [
        createIssue({ severity: 'critical' }),
        createIssue({ severity: 'high', line: 2 }),
      ];

      const processed = merger.processFalsePositives(issues, []);
      expect(processed).toHaveLength(2);
      expect(processed[0].severity).toBe('critical');
    });
  });

  describe('merge (full pipeline)', () => {
    it('should merge with adversary result', () => {
      const originalIssues = [
        createIssue({ description: 'original issue' }),
      ];

      const adversaryResult: AdversaryResult = {
        agentId: 'adversary',
        issues: [createIssue({ description: 'new issue', line: 20 })],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [],
        confidenceAdjustments: [],
      };

      const merged = merger.merge(originalIssues, adversaryResult);
      expect(merged).toHaveLength(2);
    });

    it('should fall back to basic dedup/sort without adversary', () => {
      const issues = [
        createIssue({ severity: 'low' }),
        createIssue({ severity: 'critical', line: 2 }),
      ];

      const merged = merger.merge(issues);
      expect(merged[0].severity).toBe('critical');
    });
  });

  describe('per-agent token usage aggregation', () => {
    it('should aggregate per-agent token usage', () => {
      const results = [
        createAgentResult('logic', [], { input: 200, output: 100, total: 300 }),
        createAgentResult('security', [], { input: 150, output: 80, total: 230 }),
      ];

      const usage = merger.aggregateTokenUsage(results);
      expect(usage['logic']).toEqual({ input: 200, output: 100, total: 300 });
      expect(usage['security']).toEqual({ input: 150, output: 80, total: 230 });
    });

    it('should compute total token usage', () => {
      const results = [
        createAgentResult('a', [], { input: 200, output: 100, total: 300 }),
        createAgentResult('b', [], { input: 150, output: 80, total: 230 }),
      ];

      const total = merger.totalTokenUsage(results);
      expect(total.input).toBe(350);
      expect(total.output).toBe(180);
      expect(total.total).toBe(530);
    });
  });
});
