import { MetaReviewerAgent } from '../../src/agents/meta-reviewer';
import { ReviewReport, ReviewDimension, ReviewIssue } from '../../src/types';

describe('MetaReviewerAgent', () => {
  let metaReviewer: MetaReviewerAgent;

  beforeEach(() => {
    metaReviewer = new MetaReviewerAgent();
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      const config = metaReviewer.getConfig();
      expect(config.id).toBe('meta-reviewer');
      expect(config.name).toBe('Meta Reviewer Agent');
      expect(config.maxTokens).toBe(6000);
      expect(config.temperature).toBe(0.3);
    });

    it('should allow custom config', () => {
      const custom = new MetaReviewerAgent({
        id: 'custom-meta',
        name: 'Custom Meta Reviewer',
        temperature: 0.5,
      });
      const config = custom.getConfig();
      expect(config.id).toBe('custom-meta');
      expect(config.name).toBe('Custom Meta Reviewer');
      expect(config.temperature).toBe(0.5);
    });
  });

  describe('buildAnalysisMessage', () => {
    it('should build analysis message with proper structure', () => {
      const report: ReviewReport = {
        issues: [
          {
            file: 'test.ts',
            line: 10,
            severity: 'high',
            dimension: ReviewDimension.Logic,
            description: 'Test issue',
            suggestion: 'Fix it',
            confidence: 0.8,
          },
        ],
        summary: {
          bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
          byDimension: {
            [ReviewDimension.Logic]: 1,
            [ReviewDimension.Security]: 0,
            [ReviewDimension.Performance]: 0,
            [ReviewDimension.Maintainability]: 0,
            [ReviewDimension.EdgeCases]: 0,
            [ReviewDimension.AdversaryFound]: 0,
          },
          totalIssues: 1,
        },
        metadata: {
          durationMs: 1000,
          tokenUsage: { input: 100, output: 50, total: 150 },
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          agents: ['logic-agent'],
        },
      };

      // Access private method through any cast for testing
      const message = (metaReviewer as any).buildAnalysisMessage(report, ['test.ts'], 'code');
      expect(message).toContain('代码审查报告元审查');
      expect(message).toContain('test.ts');
      expect(message).toContain('总问题数: 1');
      expect(message).toContain('High: 1');
      expect(message).toContain('Test issue');
    });
  });

  describe('validateSummary', () => {
    it('should validate and return default summary on invalid input', () => {
      const validator = (metaReviewer as any).validateSummary;
      
      const result = validator.call(metaReviewer, null);
      expect(result.qualityGrade).toBe('C');
      expect(result.qualityScore).toBe(50);
      expect(result.coveragePercentage).toBe(50);
      expect(result.completenessPercentage).toBe(50);
    });

    it('should validate valid summary object', () => {
      const validator = (metaReviewer as any).validateSummary;
      const input = {
        qualityGrade: 'A',
        qualityScore: 95,
        coveragePercentage: 90,
        completenessPercentage: 85,
        criticalFindingsCount: 2,
        priorityRecommendation: 'Fix critical issues immediately',
      };

      const result = validator.call(metaReviewer, input);
      expect(result.qualityGrade).toBe('A');
      expect(result.qualityScore).toBe(95);
      expect(result.coveragePercentage).toBe(90);
      expect(result.completenessPercentage).toBe(85);
      expect(result.criticalFindingsCount).toBe(2);
    });

    it('should clamp scores to 0-100 range', () => {
      const validator = (metaReviewer as any).validateSummary;
      const input = {
        qualityGrade: 'B',
        qualityScore: 150,
        coveragePercentage: -50,
        completenessPercentage: 1.5,
        criticalFindingsCount: 0,
        priorityRecommendation: 'Test',
      };

      const result = validator.call(metaReviewer, input);
      expect(result.qualityScore).toBe(100);
      expect(result.coveragePercentage).toBe(0);
      expect(result.completenessPercentage).toBe(1);
    });
  });

  describe('validateRootCauses', () => {
    it('should validate and filter valid root causes', () => {
      const validator = (metaReviewer as any).validateRootCauses;
      const input = [
        {
          description: 'Missing null check',
          affectedIssueIndices: [0, 1],
          severity: 'high',
        },
        {
          description: 'Invalid index',
          affectedIssueIndices: [5, 10], // Out of range
          severity: 'medium',
        },
      ];

      const result = validator.call(metaReviewer, input, 3);
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Missing null check');
      expect(result[0].affectedIssueIndices).toEqual([0, 1]);
    });

    it('should return empty array for invalid input', () => {
      const validator = (metaReviewer as any).validateRootCauses;
      expect(validator.call(metaReviewer, null, 5)).toEqual([]);
      expect(validator.call(metaReviewer, 'not an array', 5)).toEqual([]);
    });
  });

  describe('validateVerdict', () => {
    it('should validate verdict with indices', () => {
      const validator = (metaReviewer as any).validateVerdict;
      const input = {
        dismissedIssueIndices: [2, 3],
        elevatedIssueIndices: [0],
        summary: 'Review summary',
      };

      const result = validator.call(metaReviewer, input, 5);
      expect(result.dismissedIssueIndices).toEqual([2, 3]);
      expect(result.elevatedIssueIndices).toEqual([0]);
      expect(result.summary).toBe('Review summary');
    });

    it('should prevent overlapping dismissed and elevated indices', () => {
      const validator = (metaReviewer as any).validateVerdict;
      const input = {
        dismissedIssueIndices: [0, 1, 2],
        elevatedIssueIndices: [0, 3], // 0 overlaps
        summary: 'Test',
      };

      const result = validator.call(metaReviewer, input, 5);
      expect(result.dismissedIssueIndices).toEqual([1, 2]);
      expect(result.elevatedIssueIndices).toEqual([0, 3]);
    });

    it('should filter out-of-range indices', () => {
      const validator = (metaReviewer as any).validateVerdict;
      const input = {
        dismissedIssueIndices: [0, 5, 10],
        elevatedIssueIndices: [1, 20],
        summary: 'Test',
      };

      const result = validator.call(metaReviewer, input, 3);
      expect(result.dismissedIssueIndices).toEqual([0]);
      expect(result.elevatedIssueIndices).toEqual([1]);
    });
  });

  describe('validateObservations', () => {
    it('should filter valid observations', () => {
      const validator = (metaReviewer as any).validateObservations;
      const input = ['Valid observation 1', '', 'Valid observation 2', '  '];

      const result = validator.call(metaReviewer, input);
      expect(result).toHaveLength(2);
      expect(result).toContain('Valid observation 1');
      expect(result).toContain('Valid observation 2');
    });

    it('should return undefined for empty array', () => {
      const validator = (metaReviewer as any).validateObservations;
      expect(validator.call(metaReviewer, [])).toBeUndefined();
      expect(validator.call(metaReviewer, ['', '  '])).toBeUndefined();
    });

    it('should return undefined for non-array', () => {
      const validator = (metaReviewer as any).validateObservations;
      expect(validator.call(metaReviewer, null)).toBeUndefined();
      expect(validator.call(metaReviewer, 'not an array')).toBeUndefined();
    });
  });

  describe('agent properties', () => {
    it('should return correct agent ID', () => {
      expect(metaReviewer.getId()).toBe('meta-reviewer');
    });

    it('should return correct agent name', () => {
      expect(metaReviewer.getName()).toBe('Meta Reviewer Agent');
    });

    it('should not have assigned dimension', () => {
      expect(metaReviewer.getDimension()).toBeUndefined();
    });
  });
});
