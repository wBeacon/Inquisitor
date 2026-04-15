import { AdversaryAgent } from '../../src/agents';
import { IssueCalibrtor } from '../../src/agents/issue-calibrator';
import { ReviewIssue, ReviewDimension, AdversaryResult } from '../../src/types';

describe('AdversaryAgent', () => {
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
      expect(config.temperature).toBeGreaterThanOrEqual(0.6); // Higher for creativity
    });
  });

  describe('challenge method', () => {
    it('should handle empty existing issues', async () => {
      const agent = new AdversaryAgent();
      const result = await agent.challenge(['test.ts'], 'function test() {}', []);

      expect(result.agentId).toBe('adversary-agent');
      expect(result.success).toBe(true);
      expect(result.issues).toBeDefined();
      expect(result.falsePositives).toBeDefined();
      expect(result.confidenceAdjustments).toBeDefined();
    });

    it('should handle existing issues list', async () => {
      const agent = new AdversaryAgent();
      const existingIssues: ReviewIssue[] = [
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Potential null reference',
          suggestion: 'Add null check',
          confidence: 0.8,
        },
      ];

      const result = await agent.challenge(['test.ts'], 'function test() {}', existingIssues);

      expect(result.success).toBe(true);
      expect(result.falsePositives).toBeDefined();
      expect(result.confidenceAdjustments).toBeDefined();
    });

    it('should return proper AdversaryResult structure', async () => {
      const agent = new AdversaryAgent();
      const result = await agent.challenge(['test.ts'], 'code', []);

      expect(result).toHaveProperty('agentId');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('tokenUsage');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('falsePositives');
      expect(result).toHaveProperty('confidenceAdjustments');
    });
  });
});

describe('IssueCalibrtor', () => {
  describe('applyConfidenceAdjustments', () => {
    it('should adjust confidence scores', () => {
      const calibrator = new IssueCalibrtor();
      const issues: ReviewIssue[] = [
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Issue 1',
          suggestion: 'Fix it',
          confidence: 0.8,
        },
        {
          file: 'test.ts',
          line: 20,
          severity: 'medium',
          dimension: ReviewDimension.Security,
          description: 'Issue 2',
          suggestion: 'Fix it',
          confidence: 0.7,
        },
      ];

      const adversaryResult = {
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

      expect(result[0].confidence).toBe(0.5);
      expect(result[1].confidence).toBe(0.9);
    });

    it('should clamp confidence values to 0-1 range', () => {
      const calibrator = new IssueCalibrtor();
      const issues: ReviewIssue[] = [
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Issue',
          suggestion: 'Fix',
          confidence: 0.5,
        },
      ];

      const adversaryResult = {
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

  describe('filterFalsePositives', () => {
    it('should remove issues marked as false positives', () => {
      const calibrator = new IssueCalibrtor();
      const issues: ReviewIssue[] = [
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Issue 1',
          suggestion: 'Fix',
          confidence: 0.8,
        },
        {
          file: 'test.ts',
          line: 20,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Issue 2',
          suggestion: 'Fix',
          confidence: 0.7,
        },
      ];

      const adversaryResult = {
        agentId: 'adversary',
        issues: [],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [0], // Mark first issue as false positive
        confidenceAdjustments: [],
      };

      const result = calibrator.calibrate(issues, adversaryResult);

      expect(result.length).toBe(1);
      expect(result[0].description).toBe('Issue 2');
    });
  });

  describe('mergeeDuplicates', () => {
    it('should keep issue with higher confidence when duplicates exist', () => {
      const calibrator = new IssueCalibrtor();
      const issues: ReviewIssue[] = [
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Issue found by Agent 1',
          suggestion: 'Fix it',
          confidence: 0.7,
        },
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Issue found by Agent 2',
          suggestion: 'Fix it',
          confidence: 0.9,
        },
      ];

      const adversaryResult = {
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
      const calibrator = new IssueCalibrtor();
      const issues: ReviewIssue[] = [
        {
          file: 'test.ts',
          line: 10,
          severity: 'low',
          dimension: ReviewDimension.Logic,
          description: 'Low severity',
          suggestion: 'Fix',
          confidence: 0.9,
        },
        {
          file: 'test.ts',
          line: 20,
          severity: 'critical',
          dimension: ReviewDimension.Logic,
          description: 'Critical low confidence',
          suggestion: 'Fix',
          confidence: 0.3,
        },
        {
          file: 'test.ts',
          line: 30,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'High high confidence',
          suggestion: 'Fix',
          confidence: 0.9,
        },
        {
          file: 'test.ts',
          line: 40,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'High low confidence',
          suggestion: 'Fix',
          confidence: 0.3,
        },
      ];

      const adversaryResult = {
        agentId: 'adversary',
        issues: [],
        durationMs: 100,
        tokenUsage: { input: 100, output: 50, total: 150 },
        success: true,
        falsePositives: [],
        confidenceAdjustments: [],
      };

      const result = calibrator.calibrate(issues, adversaryResult);

      // Should be sorted: critical > high > low
      // Within same severity: higher confidence first
      expect(result[0].severity).toBe('critical');
      expect(result[1].severity).toBe('high');
      expect(result[1].confidence).toBe(0.9); // Higher confidence first
      expect(result[2].confidence).toBe(0.3); // Lower confidence second
    });
  });

  describe('generateCalibrationSummary', () => {
    it('should provide accurate calibration statistics', () => {
      const calibrator = new IssueCalibrtor();
      const originalIssues: ReviewIssue[] = [
        {
          file: 'test.ts',
          line: 10,
          severity: 'high',
          dimension: ReviewDimension.Logic,
          description: 'Issue',
          suggestion: 'Fix',
          confidence: 0.8,
        },
      ];

      const adversaryResult: AdversaryResult = {
        agentId: 'adversary',
        issues: [
          {
            file: 'test.ts',
            line: 50,
            severity: 'medium',
            dimension: ReviewDimension.Security,
            description: 'New issue',
            suggestion: 'Fix',
            confidence: 0.6,
          },
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
      expect(summary.finalCount).toBeLessThanOrEqual(1); // After false positive removal
    });
  });
});
