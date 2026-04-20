import { compareReports, computeTrend, computeEfficiencyMetrics } from '../../src/utils/comparison-util';
import { ReviewReport, ReviewDimension, ReviewIssue } from '../../src/types/review';
import { HistoryRecord } from '../../src/types/history';

/**
 * 创建测试用 ReviewIssue
 */
function createIssue(overrides?: Partial<ReviewIssue>): ReviewIssue {
  return {
    file: overrides?.file ?? 'src/index.ts',
    line: overrides?.line ?? 10,
    severity: overrides?.severity ?? 'high',
    dimension: overrides?.dimension ?? ReviewDimension.Logic,
    description: overrides?.description ?? '逻辑错误：条件判断有误',
    suggestion: overrides?.suggestion ?? '修改条件判断',
    confidence: overrides?.confidence ?? 0.9,
    adversaryVerdict: overrides?.adversaryVerdict,
  };
}

/**
 * 创建测试用 ReviewReport
 */
function createReport(issues: ReviewIssue[], metaReviewGrade?: string): ReviewReport {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const issue of issues) {
    const sev = issue.severity as keyof typeof bySeverity;
    bySeverity[sev]++;
  }

  return {
    issues,
    summary: {
      bySeverity,
      byDimension: {} as any,
      totalIssues: issues.length,
    },
    metadata: {
      durationMs: 5000,
      tokenUsage: { input: 1000, output: 500, total: 1500 },
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: '2024-01-01T00:00:05Z',
      agents: ['logic-agent'],
    },
    metaReview: metaReviewGrade
      ? {
          qualityGrade: metaReviewGrade as any,
          rootCauses: [],
          verdict: 'approve' as const,
          dismissedIssueIndices: [],
        }
      : undefined,
  };
}

/**
 * 创建测试用 HistoryRecord
 */
function createHistoryRecord(
  overrides?: Partial<HistoryRecord> & { issues?: ReviewIssue[]; grade?: string }
): HistoryRecord {
  const issues = overrides?.issues ?? [createIssue()];
  const report = overrides?.report ?? createReport(issues, overrides?.grade);

  return {
    id: overrides?.id ?? `record-${Math.random().toString(36).substring(2, 8)}`,
    timestamp: overrides?.timestamp ?? new Date().toISOString(),
    projectId: overrides?.projectId ?? 'test-project',
    report,
    commitHash: overrides?.commitHash,
    branch: overrides?.branch,
  };
}

describe('compareReports', () => {
  describe('基本对比', () => {
    it('两份相同报告：无新增、无修复、全部持续存在', () => {
      const issue = createIssue();
      const reportA = createReport([issue]);
      const reportB = createReport([issue]);

      const result = compareReports(reportA, reportB);
      expect(result.newIssues).toHaveLength(0);
      expect(result.fixedIssues).toHaveLength(0);
      expect(result.persistingIssues).toHaveLength(1);
      expect(result.totalIssuesDelta).toBe(0);
    });

    it('新报告有新问题', () => {
      const issueA = createIssue({ description: '问题A' });
      const issueB = createIssue({ description: '问题A' });
      const issueNew = createIssue({
        file: 'src/new.ts',
        description: '全新的问题',
      });

      const reportA = createReport([issueA]);
      const reportB = createReport([issueB, issueNew]);

      const result = compareReports(reportA, reportB);
      expect(result.newIssues).toHaveLength(1);
      expect(result.newIssues[0].file).toBe('src/new.ts');
      expect(result.fixedIssues).toHaveLength(0);
      expect(result.persistingIssues).toHaveLength(1);
      expect(result.totalIssuesDelta).toBe(1);
    });

    it('旧问题被修复', () => {
      const issueOld = createIssue({ description: '已修复的问题' });
      const reportA = createReport([issueOld]);
      const reportB = createReport([]);

      const result = compareReports(reportA, reportB);
      expect(result.newIssues).toHaveLength(0);
      expect(result.fixedIssues).toHaveLength(1);
      expect(result.persistingIssues).toHaveLength(0);
      expect(result.totalIssuesDelta).toBe(-1);
    });

    it('空报告对比', () => {
      const reportA = createReport([]);
      const reportB = createReport([]);

      const result = compareReports(reportA, reportB);
      expect(result.newIssues).toHaveLength(0);
      expect(result.fixedIssues).toHaveLength(0);
      expect(result.persistingIssues).toHaveLength(0);
      expect(result.totalIssuesDelta).toBe(0);
    });
  });

  describe('模糊匹配 - similar', () => {
    it('描述相似的问题被识别为同一问题', () => {
      const issueA = createIssue({
        description: '空指针异常：变量 user 可能为 null',
      });
      const issueB = createIssue({
        description: '空指针异常：变量 user 可能为 null 或 undefined',
      });

      const reportA = createReport([issueA]);
      const reportB = createReport([issueB]);

      const result = compareReports(reportA, reportB);
      // 应该被识别为同一问题（持续存在）
      expect(result.persistingIssues).toHaveLength(1);
      expect(result.newIssues).toHaveLength(0);
      expect(result.fixedIssues).toHaveLength(0);
    });

    it('描述完全不同的问题不会被匹配', () => {
      const issueA = createIssue({
        description: 'SQL 注入漏洞',
        dimension: ReviewDimension.Security,
      });
      const issueB = createIssue({
        description: '内存泄漏',
        dimension: ReviewDimension.Performance,
      });

      const reportA = createReport([issueA]);
      const reportB = createReport([issueB]);

      const result = compareReports(reportA, reportB);
      expect(result.newIssues).toHaveLength(1);
      expect(result.fixedIssues).toHaveLength(1);
      expect(result.persistingIssues).toHaveLength(0);
    });
  });

  describe('行号偏移容忍 - offset', () => {
    it('行号在 +/-10 范围内的同一问题被正确匹配', () => {
      const issueA = createIssue({ line: 100 });
      const issueB = createIssue({ line: 108 }); // 偏移 8 行

      const reportA = createReport([issueA]);
      const reportB = createReport([issueB]);

      const result = compareReports(reportA, reportB);
      expect(result.persistingIssues).toHaveLength(1);
      expect(result.newIssues).toHaveLength(0);
    });

    it('行号偏移超过 10 行则视为不同问题', () => {
      const issueA = createIssue({ line: 100 });
      const issueB = createIssue({ line: 115 }); // 偏移 15 行

      const reportA = createReport([issueA]);
      const reportB = createReport([issueB]);

      const result = compareReports(reportA, reportB);
      expect(result.persistingIssues).toHaveLength(0);
      expect(result.newIssues).toHaveLength(1);
      expect(result.fixedIssues).toHaveLength(1);
    });
  });

  describe('severity 分布变化', () => {
    it('正确计算 severity 变化', () => {
      const reportA = createReport([
        createIssue({ severity: 'critical' }),
        createIssue({ severity: 'high', file: 'a.ts' }),
      ]);
      const reportB = createReport([
        createIssue({ severity: 'high', file: 'a.ts' }),
        createIssue({ severity: 'low', file: 'b.ts' }),
      ]);

      const result = compareReports(reportA, reportB);
      expect(result.severityChanges.critical).toBe(-1);
      expect(result.severityChanges.low).toBe(1);
    });
  });

  describe('质量评级变化', () => {
    it('正确追踪质量评级变化', () => {
      const reportA = createReport([], 'C');
      const reportB = createReport([], 'A');

      const result = compareReports(reportA, reportB);
      expect(result.qualityGradeChange).toEqual({ from: 'C', to: 'A' });
    });

    it('两份报告都没有 metaReview 时不返回评级变化', () => {
      const reportA = createReport([]);
      const reportB = createReport([]);

      const result = compareReports(reportA, reportB);
      expect(result.qualityGradeChange).toBeUndefined();
    });
  });
});

describe('computeTrend', () => {
  it('0 条记录返回 stable 默认值', () => {
    const result = computeTrend([]);

    expect(result.dataPoints).toHaveLength(0);
    expect(result.overallTrend).toBe('stable');
    expect(result.qualityGradeTrajectory).toHaveLength(0);
    expect(result.averageFixRate).toBe(0);
  });

  it('1 条记录返回 stable（无法判断趋势）', () => {
    const record = createHistoryRecord({
      issues: [createIssue()],
      grade: 'B',
    });

    const result = computeTrend([record]);

    expect(result.dataPoints).toHaveLength(1);
    expect(result.overallTrend).toBe('stable');
    expect(result.qualityGradeTrajectory).toHaveLength(1);
  });

  it('问题减少时趋势为 improving', () => {
    const record1 = createHistoryRecord({
      id: 'r1',
      timestamp: '2024-01-01T00:00:00Z',
      issues: [createIssue(), createIssue({ file: 'b.ts' }), createIssue({ file: 'c.ts' })],
    });
    const record2 = createHistoryRecord({
      id: 'r2',
      timestamp: '2024-01-02T00:00:00Z',
      issues: [createIssue()],
    });

    const result = computeTrend([record1, record2]);

    expect(result.overallTrend).toBe('improving');
    expect(result.dataPoints).toHaveLength(2);
    expect(result.averageFixRate).toBeGreaterThan(0);
  });

  it('问题增加时趋势为 degrading', () => {
    const record1 = createHistoryRecord({
      id: 'r1',
      timestamp: '2024-01-01T00:00:00Z',
      issues: [createIssue()],
    });
    const record2 = createHistoryRecord({
      id: 'r2',
      timestamp: '2024-01-02T00:00:00Z',
      issues: [createIssue(), createIssue({ file: 'b.ts' }), createIssue({ file: 'c.ts' })],
    });

    const result = computeTrend([record1, record2]);

    expect(result.overallTrend).toBe('degrading');
  });

  it('多条记录追踪质量评级变化轨迹', () => {
    const records = [
      createHistoryRecord({ id: 'r1', timestamp: '2024-01-01T00:00:00Z', grade: 'D' }),
      createHistoryRecord({ id: 'r2', timestamp: '2024-01-02T00:00:00Z', grade: 'C' }),
      createHistoryRecord({ id: 'r3', timestamp: '2024-01-03T00:00:00Z', grade: 'B' }),
    ];

    const result = computeTrend(records);

    expect(result.qualityGradeTrajectory).toHaveLength(3);
    expect(result.qualityGradeTrajectory[0].grade).toBe('D');
    expect(result.qualityGradeTrajectory[1].grade).toBe('C');
    expect(result.qualityGradeTrajectory[2].grade).toBe('B');
  });

  it('计算各 severity 级别的独立趋势', () => {
    const record1 = createHistoryRecord({
      id: 'r1',
      timestamp: '2024-01-01T00:00:00Z',
      issues: [
        createIssue({ severity: 'critical' }),
        createIssue({ severity: 'low', file: 'a.ts' }),
      ],
    });
    const record2 = createHistoryRecord({
      id: 'r2',
      timestamp: '2024-01-02T00:00:00Z',
      issues: [createIssue({ severity: 'low', file: 'a.ts' })],
    });

    const result = computeTrend([record1, record2]);

    expect(result.severityTrends.critical).toBe('improving');
    expect(result.severityTrends.low).toBe('stable');
  });
});

describe('computeEfficiencyMetrics', () => {
  it('0 条记录返回零值', () => {
    const result = computeEfficiencyMetrics([]);

    expect(result.averageDurationMs).toBe(0);
    expect(result.averageTokenUsage.total).toBe(0);
    expect(result.totalReviews).toBe(0);
    expect(result.falsePositiveRateTrend).toHaveLength(0);
  });

  it('计算平均审查耗时', () => {
    const records = [
      createHistoryRecord({
        id: 'r1',
        report: createReport([createIssue()]),
      }),
      createHistoryRecord({
        id: 'r2',
        report: {
          ...createReport([createIssue()]),
          metadata: {
            durationMs: 10000,
            tokenUsage: { input: 2000, output: 1000, total: 3000 },
            startedAt: '2024-01-01T00:00:00Z',
            completedAt: '2024-01-01T00:00:10Z',
            agents: ['logic-agent'],
          },
        },
      }),
    ];

    const result = computeEfficiencyMetrics(records);

    // (5000 + 10000) / 2 = 7500
    expect(result.averageDurationMs).toBe(7500);
    expect(result.totalReviews).toBe(2);
  });

  it('计算平均 token 消耗', () => {
    const records = [
      createHistoryRecord({
        id: 'r1',
        report: createReport([createIssue()]),
      }),
      createHistoryRecord({
        id: 'r2',
        report: {
          ...createReport([createIssue()]),
          metadata: {
            durationMs: 5000,
            tokenUsage: { input: 3000, output: 1500, total: 4500 },
            startedAt: '2024-01-01T00:00:00Z',
            completedAt: '2024-01-01T00:00:05Z',
            agents: ['logic-agent'],
          },
        },
      }),
    ];

    const result = computeEfficiencyMetrics(records);

    // input: (1000 + 3000) / 2 = 2000
    expect(result.averageTokenUsage.input).toBe(2000);
    // output: (500 + 1500) / 2 = 1000
    expect(result.averageTokenUsage.output).toBe(1000);
    // total: (1500 + 4500) / 2 = 3000
    expect(result.averageTokenUsage.total).toBe(3000);
  });

  it('计算误报率趋势（有 adversary 数据时）', () => {
    const issueWithFP = createIssue({ adversaryVerdict: 'false_positive' });
    const issueConfirmed = createIssue({
      adversaryVerdict: 'confirmed',
      file: 'b.ts',
    });

    const records = [
      createHistoryRecord({
        id: 'r1',
        timestamp: '2024-01-01T00:00:00Z',
        issues: [issueWithFP, issueConfirmed],
      }),
    ];

    const result = computeEfficiencyMetrics(records);

    expect(result.falsePositiveRateTrend).toHaveLength(1);
    // 1 FP / 2 with verdict = 0.5
    expect(result.falsePositiveRateTrend[0].rate).toBe(0.5);
  });

  it('没有 adversary 数据时误报率趋势为空', () => {
    const records = [
      createHistoryRecord({
        id: 'r1',
        issues: [createIssue()], // 没有 adversaryVerdict
      }),
    ];

    const result = computeEfficiencyMetrics(records);
    expect(result.falsePositiveRateTrend).toHaveLength(0);
  });
});
