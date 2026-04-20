import { ReviewReport, ReviewIssue, Severity } from '../types/review';
import {
  ComparisonResult,
  TrendResult,
  TrendDataPoint,
  EfficiencyMetrics,
  HistoryRecord,
  QualityGrade,
} from '../types/history';

/**
 * 行号偏移容忍范围（默认 +/- 10 行）
 */
const LINE_OFFSET_TOLERANCE = 10;

/**
 * 描述相似度阈值（0-1），超过此值视为同一问题
 */
const SIMILARITY_THRESHOLD = 0.5;

/**
 * 计算两个字符串的相似度（基于 bigram 重叠率）
 * 返回值 0-1，1 表示完全相同
 */
function computeStringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const lower_a = a.toLowerCase();
  const lower_b = b.toLowerCase();

  // 提取 bigrams
  const bigramsA = new Set<string>();
  for (let i = 0; i < lower_a.length - 1; i++) {
    bigramsA.add(lower_a.substring(i, i + 2));
  }

  const bigramsB = new Set<string>();
  for (let i = 0; i < lower_b.length - 1; i++) {
    bigramsB.add(lower_b.substring(i, i + 2));
  }

  // 计算交集
  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  // Dice 系数
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * 判断两个 issue 是否为同一问题（跨版本匹配）
 * 匹配条件：相同文件 + 相同维度 + 描述相似 + 行号在容忍范围内
 */
function issuesMatch(a: ReviewIssue, b: ReviewIssue): boolean {
  // 文件必须相同
  if (a.file !== b.file) return false;

  // 维度必须相同
  if (a.dimension !== b.dimension) return false;

  // 行号在容忍范围内
  if (Math.abs(a.line - b.line) > LINE_OFFSET_TOLERANCE) return false;

  // 描述相似度检查
  const similarity = computeStringSimilarity(a.description, b.description);
  return similarity >= SIMILARITY_THRESHOLD;
}

/**
 * 对比两份审查报告，返回差异分析
 * @param reportA 基准报告（旧版本）
 * @param reportB 对比报告（新版本）
 * @returns 对比结果
 */
export function compareReports(reportA: ReviewReport, reportB: ReviewReport): ComparisonResult {
  const issuesA = reportA.issues;
  const issuesB = reportB.issues;

  // 标记 A 中每个 issue 是否在 B 中有匹配
  const matchedInA = new Set<number>();
  const matchedInB = new Set<number>();

  // 双重循环寻找匹配
  for (let i = 0; i < issuesA.length; i++) {
    for (let j = 0; j < issuesB.length; j++) {
      if (matchedInB.has(j)) continue;
      if (issuesMatch(issuesA[i], issuesB[j])) {
        matchedInA.add(i);
        matchedInB.add(j);
        break;
      }
    }
  }

  // 已修复：A 有但 B 没有
  const fixedIssues = issuesA.filter((_, i) => !matchedInA.has(i));

  // 新增：B 有但 A 没有
  const newIssues = issuesB.filter((_, i) => !matchedInB.has(i));

  // 持续存在：两份都有
  const persistingIssues = issuesB.filter((_, i) => matchedInB.has(i));

  // 计算各严重级别变化
  const severities: Severity[] = ['critical', 'high', 'medium', 'low'];
  const severityChanges = {} as Record<Severity, number>;
  for (const sev of severities) {
    const countA = reportA.summary.bySeverity[sev] || 0;
    const countB = reportB.summary.bySeverity[sev] || 0;
    severityChanges[sev] = countB - countA;
  }

  // 质量评级变化
  const gradeA = reportA.metaReview?.qualityGrade as QualityGrade | undefined;
  const gradeB = reportB.metaReview?.qualityGrade as QualityGrade | undefined;
  const qualityGradeChange = (gradeA || gradeB)
    ? { from: gradeA, to: gradeB }
    : undefined;

  return {
    newIssues,
    fixedIssues,
    persistingIssues,
    severityChanges,
    qualityGradeChange,
    totalIssuesDelta: issuesB.length - issuesA.length,
  };
}

/**
 * 质量评级转数字（用于趋势判断）
 */
function gradeToNumber(grade?: QualityGrade): number {
  const map: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
  return grade ? (map[grade] || 0) : 0;
}

/**
 * 判断数值序列的趋势
 */
function determineTrend(values: number[]): 'improving' | 'degrading' | 'stable' {
  if (values.length < 2) return 'stable';

  const first = values[0];
  const last = values[values.length - 1];

  // issue 数量减少 = improving
  if (last < first) return 'improving';
  if (last > first) return 'degrading';
  return 'stable';
}

/**
 * 计算质量改进趋势
 * @param records 按时间排序的历史记录
 * @returns 趋势分析结果
 */
export function computeTrend(records: HistoryRecord[]): TrendResult {
  // 空记录或单条记录的默认返回
  if (records.length === 0) {
    return {
      dataPoints: [],
      overallTrend: 'stable',
      severityTrends: {
        critical: 'stable',
        high: 'stable',
        medium: 'stable',
        low: 'stable',
      },
      qualityGradeTrajectory: [],
      averageFixRate: 0,
    };
  }

  // 按时间排序
  const sorted = [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // 构建数据点
  const dataPoints: TrendDataPoint[] = sorted.map(r => ({
    recordId: r.id,
    timestamp: r.timestamp,
    totalIssues: r.report.summary.totalIssues,
    severityCounts: { ...r.report.summary.bySeverity },
    qualityGrade: r.report.metaReview?.qualityGrade as QualityGrade | undefined,
  }));

  // 整体趋势
  const totalCounts = dataPoints.map(dp => dp.totalIssues);
  const overallTrend = determineTrend(totalCounts);

  // 各严重级别趋势
  const severities: Severity[] = ['critical', 'high', 'medium', 'low'];
  const severityTrends = {} as Record<Severity, 'improving' | 'degrading' | 'stable'>;
  for (const sev of severities) {
    const counts = dataPoints.map(dp => dp.severityCounts[sev]);
    severityTrends[sev] = determineTrend(counts);
  }

  // 质量评级轨迹
  const qualityGradeTrajectory = dataPoints.map(dp => ({
    timestamp: dp.timestamp,
    grade: dp.qualityGrade,
  }));

  // 平均修复速度
  let totalFixed = 0;
  let totalDays = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const comparison = compareReports(prev.report, curr.report);
    const fixedCount = comparison.fixedIssues.length;

    const timeDiffMs = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
    const timeDiffDays = timeDiffMs / (1000 * 60 * 60 * 24);

    if (timeDiffDays > 0) {
      totalFixed += fixedCount;
      totalDays += timeDiffDays;
    }
  }

  const averageFixRate = totalDays > 0 ? totalFixed / totalDays : 0;

  return {
    dataPoints,
    overallTrend,
    severityTrends,
    qualityGradeTrajectory,
    averageFixRate,
  };
}

/**
 * 计算审查效率指标
 * @param records 历史记录列表
 * @returns 效率指标
 */
export function computeEfficiencyMetrics(records: HistoryRecord[]): EfficiencyMetrics {
  if (records.length === 0) {
    return {
      averageDurationMs: 0,
      averageTokenUsage: { input: 0, output: 0, total: 0 },
      falsePositiveRateTrend: [],
      totalReviews: 0,
    };
  }

  // 平均审查耗时
  const totalDuration = records.reduce((sum, r) => sum + r.report.metadata.durationMs, 0);
  const averageDurationMs = totalDuration / records.length;

  // 平均 token 消耗
  const totalInput = records.reduce((sum, r) => sum + r.report.metadata.tokenUsage.input, 0);
  const totalOutput = records.reduce((sum, r) => sum + r.report.metadata.tokenUsage.output, 0);
  const totalTokens = records.reduce((sum, r) => sum + r.report.metadata.tokenUsage.total, 0);
  const averageTokenUsage = {
    input: totalInput / records.length,
    output: totalOutput / records.length,
    total: totalTokens / records.length,
  };

  // 误报率趋势（通过 adversaryVerdict 统计）
  const sorted = [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const falsePositiveRateTrend: Array<{ timestamp: string; rate: number }> = [];
  for (const record of sorted) {
    const issues = record.report.issues;
    const totalWithVerdict = issues.filter(i => i.adversaryVerdict).length;
    if (totalWithVerdict > 0) {
      const fpCount = issues.filter(i => i.adversaryVerdict === 'false_positive').length;
      falsePositiveRateTrend.push({
        timestamp: record.timestamp,
        rate: fpCount / totalWithVerdict,
      });
    }
  }

  return {
    averageDurationMs,
    averageTokenUsage,
    falsePositiveRateTrend,
    totalReviews: records.length,
  };
}
