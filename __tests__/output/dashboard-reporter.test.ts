import {
  DashboardReporter,
  DashboardData,
  generateDashboard,
} from '../../src/output';
import { ReviewReport, ReviewDimension, ReviewIssue, Severity } from '../../src/types';
import * as path from 'path';
import * as fs from 'fs';

describe('DashboardReporter', () => {
  // Mock report with multiple issues
  const mockReport: ReviewReport = {
    issues: [
      {
        file: 'src/test.ts',
        line: 10,
        severity: 'critical',
        dimension: ReviewDimension.Logic,
        description: 'Null pointer exception risk',
        suggestion: 'Add null check',
        confidence: 0.95,
        foundBy: 'logic-agent',
        codeSnippet: 'const value = obj.property;',
        adversaryVerdict: 'confirmed',
      },
      {
        file: 'src/test.ts',
        line: 20,
        severity: 'high',
        dimension: ReviewDimension.Security,
        description: 'SQL injection vulnerability',
        suggestion: 'Use parameterized queries',
        confidence: 0.88,
        foundBy: 'security-agent',
        adversaryVerdict: 'confirmed',
      },
      {
        file: 'src/utils.ts',
        line: 5,
        severity: 'medium',
        dimension: ReviewDimension.Performance,
        description: 'Inefficient loop',
        suggestion: 'Use map() instead',
        confidence: 0.75,
        foundBy: 'performance-agent',
      },
      {
        file: 'src/utils.ts',
        line: 15,
        severity: 'low',
        dimension: ReviewDimension.Maintainability,
        description: 'Variable name unclear',
        suggestion: 'Rename to itemCount',
        confidence: 0.65,
        foundBy: 'maintainability-agent',
      },
      {
        file: 'src/edge.ts',
        line: 100,
        severity: 'high',
        dimension: ReviewDimension.EdgeCases,
        description: 'Missing boundary check',
        suggestion: 'Add range validation',
        confidence: 0.82,
        foundBy: 'edge-case-agent',
        adversaryVerdict: 'false_positive', // This one is marked as false positive
      },
    ],
    summary: {
      totalIssues: 5,
      bySeverity: {
        critical: 1,
        high: 2,
        medium: 1,
        low: 1,
      },
      byDimension: {
        [ReviewDimension.Logic]: 1,
        [ReviewDimension.Security]: 1,
        [ReviewDimension.Performance]: 1,
        [ReviewDimension.Maintainability]: 1,
        [ReviewDimension.EdgeCases]: 1,
        [ReviewDimension.AdversaryFound]: 0,
      },
    },
    metadata: {
      durationMs: 5000,
      tokenUsage: {
        input: 10000,
        output: 5000,
        total: 15000,
      },
      startedAt: new Date(Date.now() - 5000).toISOString(),
      completedAt: new Date().toISOString(),
      agents: [
        'logic-agent',
        'security-agent',
        'performance-agent',
        'maintainability-agent',
        'edge-case-agent',
      ],
    },
  };

  const emptyReport: ReviewReport = {
    issues: [],
    summary: {
      totalIssues: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      byDimension: {
        [ReviewDimension.Logic]: 0,
        [ReviewDimension.Security]: 0,
        [ReviewDimension.Performance]: 0,
        [ReviewDimension.Maintainability]: 0,
        [ReviewDimension.EdgeCases]: 0,
        [ReviewDimension.AdversaryFound]: 0,
      },
    },
    metadata: {
      durationMs: 100,
      tokenUsage: { input: 1000, output: 500, total: 1500 },
      startedAt: new Date(Date.now() - 100).toISOString(),
      completedAt: new Date().toISOString(),
      agents: [],
    },
  };

  describe('generate()', () => {
    it('should generate dashboard data from review report', () => {
      const dashboard = DashboardReporter.generate(mockReport);

      expect(dashboard).toBeDefined();
      expect(dashboard.metrics).toBeDefined();
      expect(dashboard.issuesBySeverity).toBeDefined();
      expect(dashboard.issuesByDimension).toBeDefined();
      expect(dashboard.issuesByFile).toBeDefined();
      expect(dashboard.performance).toBeDefined();
      expect(dashboard.metadata).toBeDefined();
    });

    it('should extract correct metrics', () => {
      const dashboard = DashboardReporter.generate(mockReport);

      expect(dashboard.metrics.totalIssues).toBe(5);
      expect(dashboard.metrics.critical).toBe(1);
      expect(dashboard.metrics.high).toBe(2);
      expect(dashboard.metrics.medium).toBe(1);
      expect(dashboard.metrics.low).toBe(1);
    });

    it('should calculate average confidence', () => {
      const dashboard = DashboardReporter.generate(mockReport);

      // (0.95 + 0.88 + 0.75 + 0.65 + 0.82) / 5 = 0.81
      expect(dashboard.metrics.averageConfidence).toBe(0.81);
    });

    it('should calculate false positive rate', () => {
      const dashboard = DashboardReporter.generate(mockReport);

      // 1 false positive out of 5 = 20%
      expect(dashboard.metrics.falsePositiveRate).toBe(20);
    });

    it('should group issues by severity', () => {
      const dashboard = DashboardReporter.generate(mockReport);

      expect(dashboard.issuesBySeverity.critical).toHaveLength(1);
      expect(dashboard.issuesBySeverity.high).toHaveLength(2);
      expect(dashboard.issuesBySeverity.medium).toHaveLength(1);
      expect(dashboard.issuesBySeverity.low).toHaveLength(1);
    });

    it('should group issues by dimension', () => {
      const dashboard = DashboardReporter.generate(mockReport);

      expect(dashboard.issuesByDimension[ReviewDimension.Logic]).toHaveLength(1);
      expect(
        dashboard.issuesByDimension[ReviewDimension.Security]
      ).toHaveLength(1);
      expect(
        dashboard.issuesByDimension[ReviewDimension.Performance]
      ).toHaveLength(1);
      expect(
        dashboard.issuesByDimension[ReviewDimension.Maintainability]
      ).toHaveLength(1);
      expect(
        dashboard.issuesByDimension[ReviewDimension.EdgeCases]
      ).toHaveLength(1);
      expect(
        dashboard.issuesByDimension[ReviewDimension.AdversaryFound]
      ).toHaveLength(0);
    });

    it('should group issues by file', () => {
      const dashboard = DashboardReporter.generate(mockReport);

      expect(dashboard.issuesByFile['src/test.ts']).toHaveLength(2);
      expect(dashboard.issuesByFile['src/utils.ts']).toHaveLength(2);
      expect(dashboard.issuesByFile['src/edge.ts']).toHaveLength(1);
    });

    it('should extract performance metrics', () => {
      const dashboard = DashboardReporter.generate(mockReport);

      expect(dashboard.performance.durationMs).toBe(5000);
      expect(dashboard.performance.durationSeconds).toBe('5.00s');
      expect(dashboard.performance.tokenUsage.total).toBe(15000);
    });

    it('should extract metadata', () => {
      const dashboard = DashboardReporter.generate(mockReport);

      expect(dashboard.metadata.agents).toHaveLength(5);
      expect(dashboard.metadata.totalAgents).toBe(5);
      expect(dashboard.metadata.startedAt).toBeInstanceOf(Date);
      expect(dashboard.metadata.completedAt).toBeInstanceOf(Date);
    });

    it('should handle empty report', () => {
      const dashboard = DashboardReporter.generate(emptyReport);

      expect(dashboard.metrics.totalIssues).toBe(0);
      expect(dashboard.metrics.critical).toBe(0);
      expect(dashboard.issuesBySeverity.critical).toHaveLength(0);
    });
  });

  describe('getSeverityStyle()', () => {
    it('should return correct style for critical', () => {
      const style = DashboardReporter.getSeverityStyle('critical');

      expect(style.icon).toBe('🔴');
      expect(style.color).toBe('#e74c3c');
      expect(style.label).toBe('严重');
    });

    it('should return correct style for high', () => {
      const style = DashboardReporter.getSeverityStyle('high');

      expect(style.icon).toBe('🟠');
      expect(style.color).toBe('#f39c12');
      expect(style.label).toBe('高');
    });

    it('should return correct style for medium', () => {
      const style = DashboardReporter.getSeverityStyle('medium');

      expect(style.icon).toBe('🟡');
      expect(style.color).toBe('#f1c40f');
      expect(style.label).toBe('中');
    });

    it('should return correct style for low', () => {
      const style = DashboardReporter.getSeverityStyle('low');

      expect(style.icon).toBe('🟢');
      expect(style.color).toBe('#2ecc71');
      expect(style.label).toBe('低');
    });
  });

  describe('getDimensionLabel()', () => {
    it('should return correct labels for all dimensions', () => {
      expect(DashboardReporter.getDimensionLabel(ReviewDimension.Logic)).toBe(
        '逻辑正确性'
      );
      expect(
        DashboardReporter.getDimensionLabel(ReviewDimension.Security)
      ).toBe('安全性');
      expect(
        DashboardReporter.getDimensionLabel(ReviewDimension.Performance)
      ).toBe('性能');
      expect(
        DashboardReporter.getDimensionLabel(ReviewDimension.Maintainability)
      ).toBe('可维护性');
      expect(
        DashboardReporter.getDimensionLabel(ReviewDimension.EdgeCases)
      ).toBe('边界情况');
      expect(
        DashboardReporter.getDimensionLabel(ReviewDimension.AdversaryFound)
      ).toBe('对抗发现');
    });
  });

  describe('getQualityGradeStyle()', () => {
    it('should return correct style for each grade', () => {
      const gradeA = DashboardReporter.getQualityGradeStyle('A');
      expect(gradeA.description).toBe('优秀');
      expect(gradeA.color).toBe('#27ae60');

      const gradeB = DashboardReporter.getQualityGradeStyle('B');
      expect(gradeB.description).toBe('良好');
      expect(gradeB.color).toBe('#3498db');

      const gradeC = DashboardReporter.getQualityGradeStyle('C');
      expect(gradeC.description).toBe('中等');
      expect(gradeC.color).toBe('#f39c12');

      const gradeD = DashboardReporter.getQualityGradeStyle('D');
      expect(gradeD.description).toBe('较差');
      expect(gradeD.color).toBe('#e67e22');

      const gradeF = DashboardReporter.getQualityGradeStyle('F');
      expect(gradeF.description).toBe('不及格');
      expect(gradeF.color).toBe('#e74c3c');
    });
  });

  describe('generateDashboard()', () => {
    it('should return an HTML string via the convenience function', () => {
      const html = generateDashboard(mockReport);

      expect(typeof html).toBe('string');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('severity');
      expect(html).toContain('dimension');
    });
  });

  describe('edge cases', () => {
    it('should handle report with single issue', () => {
      const singleIssueReport: ReviewReport = {
        ...mockReport,
        issues: [mockReport.issues[0]],
        summary: {
          ...mockReport.summary,
          totalIssues: 1,
          bySeverity: { critical: 1, high: 0, medium: 0, low: 0 },
        },
      };

      const dashboard = DashboardReporter.generate(singleIssueReport);

      expect(dashboard.metrics.totalIssues).toBe(1);
      expect(dashboard.metrics.averageConfidence).toBe(0.95);
    });

    it('should handle report with all false positives', () => {
      const allFalsePositivesReport: ReviewReport = {
        ...mockReport,
        issues: mockReport.issues.map((issue) => ({
          ...issue,
          adversaryVerdict: 'false_positive' as any,
        })),
      };

      const dashboard = DashboardReporter.generate(
        allFalsePositivesReport
      );

      expect(dashboard.metrics.falsePositiveRate).toBe(100);
    });

    it('should handle very long execution times', () => {
      const slowReport: ReviewReport = {
        ...mockReport,
        metadata: {
          ...mockReport.metadata,
          durationMs: 120000, // 2 minutes
        },
      };

      const dashboard = DashboardReporter.generate(slowReport);

      expect(dashboard.performance.durationSeconds).toBe('120.00s');
    });

    it('should handle very high token counts', () => {
      const highTokenReport: ReviewReport = {
        ...mockReport,
        metadata: {
          ...mockReport.metadata,
          tokenUsage: {
            input: 1000000,
            output: 500000,
            total: 1500000,
          },
        },
      };

      const dashboard = DashboardReporter.generate(highTokenReport);

      expect(dashboard.performance.tokenUsage.total).toBe(1500000);
    });
  });

  // ==================== HTML 渲染测试 ====================

  describe('render() - HTML 仪表板', () => {
    const reporter = new DashboardReporter();

    // 构造含 metaReview 的完整报告
    const reportWithMeta: ReviewReport = {
      ...mockReport,
      metaReview: {
        qualityGrade: 'B',
        rootCauses: [
          '认证模块缺乏安全意识',
          '错误处理不一致',
          '代码结构问题',
        ],
        verdict: 'request_changes',
        dismissedIssueIndices: [],
        qualityScore: 72,
        coveragePercentage: 85,
        completenessPercentage: 78,
      } as any,
    };

    // 无 metaReview 的报告
    const reportWithoutMeta: ReviewReport = {
      ...mockReport,
      metaReview: undefined,
    };

    // 零 issue 报告
    const zeroIssueReport: ReviewReport = {
      ...emptyReport,
      metaReview: {
        qualityGrade: 'A',
        rootCauses: [],
        verdict: 'approve',
        dismissedIssueIndices: [],
        qualityScore: 95,
        coveragePercentage: 98,
        completenessPercentage: 96,
      } as any,
    };

    // 大量 issue (50+) 报告
    const manyIssuesReport: ReviewReport = (() => {
      const issues: ReviewIssue[] = [];
      const severities: Severity[] = ['critical', 'high', 'medium', 'low'];
      const dimensions = Object.values(ReviewDimension);

      for (let i = 0; i < 55; i++) {
        issues.push({
          file: `src/module-${i % 10}/file-${i}.ts`,
          line: 10 + i,
          severity: severities[i % 4],
          dimension: dimensions[i % dimensions.length],
          description: `问题描述 #${i + 1}：这是一个测试问题`,
          suggestion: `修复建议 #${i + 1}`,
          confidence: 0.5 + (i % 50) / 100,
          foundBy: `agent-${i % 5}`,
        });
      }

      const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
      const byDimension: Record<string, number> = {};
      for (const d of dimensions) byDimension[d] = 0;
      for (const issue of issues) {
        bySeverity[issue.severity]++;
        byDimension[issue.dimension] = (byDimension[issue.dimension] || 0) + 1;
      }

      return {
        issues,
        summary: {
          totalIssues: issues.length,
          bySeverity,
          byDimension,
        },
        metadata: {
          durationMs: 120000,
          tokenUsage: { input: 100000, output: 50000, total: 150000 },
          startedAt: new Date(Date.now() - 120000).toISOString(),
          completedAt: new Date().toISOString(),
          agents: ['logic-agent', 'security-agent', 'performance-agent', 'maintainability-agent', 'edge-case-agent', 'adversary-agent'],
        },
        metaReview: {
          qualityGrade: 'D',
          rootCauses: ['系统性架构问题', '测试覆盖不足'],
          verdict: 'request_changes',
          dismissedIssueIndices: [3, 7, 12],
          qualityScore: 35,
          coveragePercentage: 40,
          completenessPercentage: 45,
        } as any,
      } as ReviewReport;
    })();

    it('应生成自包含 HTML，无外部 CDN 依赖', () => {
      const html = reporter.render(reportWithMeta);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<style>');
      expect(html).toContain('<script>');
      expect(html).not.toContain('cdn');
      expect(html).not.toContain('https://');
    });

    it('有 metaReview 数据时应包含 grade、qualityScore、coverage、completeness', () => {
      const html = reporter.render(reportWithMeta);

      expect(html).toContain('grade');
      expect(html).toContain('qualityScore');
      expect(html).toContain('coverage');
      expect(html).toContain('completeness');
      expect(html).toContain('grade-B');
      expect(html).toContain('72');
    });

    it('无 metaReview 数据时应正常渲染', () => {
      const html = reporter.render(reportWithoutMeta);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('qualityScore: N/A');
      expect(html).toContain('coverage');
      expect(html).toContain('completeness');
    });

    it('零 issue 时应正常渲染', () => {
      const html = reporter.render(zeroIssueReport);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('共发现 0 个问题');
      expect(html).toContain('没有发现问题');
    });

    it('大量 issue (50+) 时应正常渲染', () => {
      const html = reporter.render(manyIssuesReport);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('共发现 55 个问题');
      // 确保所有 issue 都被渲染
      expect(html).toContain('data-severity');
      expect(html).toContain('data-dimension');
      // 文件大小检查
      expect(Buffer.byteLength(html, 'utf-8')).toBeLessThan(512000);
    });

    it('应包含 root-cause 热力图', () => {
      const html = reporter.render(reportWithMeta);

      expect(html).toContain('heatmap');
      expect(html).toContain('root-cause');
      expect(html).toContain('认证模块缺乏安全意识');
      expect(html).toContain('heat-high');
    });

    it('应包含 severity 和 dimension 分布图', () => {
      const html = reporter.render(reportWithMeta);

      expect(html).toContain('severity');
      expect(html).toContain('dimension');
      expect(html).toContain('sev-critical');
      expect(html).toContain('sev-high');
    });

    it('应包含 filter 功能（按 severity 和 dimension 筛选）', () => {
      const html = reporter.render(reportWithMeta);

      expect(html).toContain('filter');
      expect(html).toContain('data-severity');
      expect(html).toContain('data-dimension');
      expect(html).toContain('toggleFilter');
    });

    it('应包含 sort 功能（按 severity、confidence、file 排序）', () => {
      const html = reporter.render(reportWithMeta);

      expect(html).toContain('sort');
      expect(html).toContain('sortIssues');
      expect(html).toContain('data-confidence');
      expect(html).toContain('data-file');
    });

    it('应正确转义 HTML 特殊字符', () => {
      const xssReport: ReviewReport = {
        ...emptyReport,
        issues: [{
          file: '<script>alert("xss")</script>',
          line: 1,
          severity: 'low',
          dimension: ReviewDimension.Security,
          description: 'Test <b>bold</b> & "quotes"',
          suggestion: 'Fix it',
          confidence: 0.5,
        }],
        summary: { ...emptyReport.summary, totalIssues: 1, bySeverity: { critical: 0, high: 0, medium: 0, low: 1 } },
      };

      const html = reporter.render(xssReport);

      expect(html).not.toContain('<script>alert');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
