/**
 * stats.ts - MCP 工具: 审查统计与监控
 *
 * 提供审查统计数据的收集、查询、重置和导出功能:
 * - action: 'get' - 获取当前统计数据
 * - action: 'reset' - 清零所有统计数据
 * - action: 'export' - 导出 Prometheus 格式或结构化 JSON 指标
 * - action: 'record' - 内部使用，记录一次审查结果
 *
 * 统计数据支持持久化到 .inquisitor-stats.json 文件
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

/** 统计数据持久化文件名 */
export const STATS_FILE_NAME = '.inquisitor-stats.json';

/**
 * stats 工具的 inputSchema 定义（zod shape）
 */
export const statsSchema = {
  action: z.enum(['get', 'reset', 'export', 'record']).describe(
    '操作类型: get 获取统计, reset 清零统计, export 导出指标, record 记录审查结果'
  ),
  format: z.enum(['prometheus', 'json']).optional().describe(
    'export 操作的输出格式，默认 prometheus'
  ),
  reviewResult: z.object({
    success: z.boolean(),
    durationMs: z.number(),
    issuesByDimension: z.record(z.string(), z.number()).optional(),
    issuesBySeverity: z.record(z.string(), z.number()).optional(),
  }).optional().describe('record 操作的审查结果数据'),
};

/**
 * 统计数据接口
 */
export interface ReviewStats {
  totalReviews: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
  issuesByDimension: Record<string, number>;
  issuesBySeverity: Record<string, number>;
  lastReviewAt: string | null;
}

/**
 * 创建空统计数据
 */
function createEmptyStats(): ReviewStats {
  return {
    totalReviews: 0,
    successCount: 0,
    failureCount: 0,
    totalDurationMs: 0,
    averageDurationMs: 0,
    issuesByDimension: {},
    issuesBySeverity: {},
    lastReviewAt: null,
  };
}

/**
 * 统计数据存储（模块级单例）
 */
let statsData: ReviewStats = createEmptyStats();

/** 持久化文件路径（可通过 setStatsFilePath 配置） */
let statsFilePath: string = path.resolve(process.cwd(), STATS_FILE_NAME);

/**
 * 设置统计文件路径（用于测试）
 */
export function setStatsFilePath(filePath: string): void {
  statsFilePath = filePath;
}

/**
 * 获取统计文件路径
 */
export function getStatsFilePath(): string {
  return statsFilePath;
}

/**
 * 获取当前统计数据的副本
 */
export function getStats(): ReviewStats {
  return { ...statsData, issuesByDimension: { ...statsData.issuesByDimension }, issuesBySeverity: { ...statsData.issuesBySeverity } };
}

/**
 * 重置统计数据（用于测试）
 */
export function resetStatsInternal(): void {
  statsData = createEmptyStats();
}

/**
 * 从持久化文件加载统计数据
 */
export function loadStatsFromDisk(): boolean {
  try {
    if (fs.existsSync(statsFilePath)) {
      const raw = fs.readFileSync(statsFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      // 验证基本字段
      if (typeof parsed.totalReviews === 'number') {
        statsData = {
          ...createEmptyStats(),
          ...parsed,
        };
        return true;
      }
    }
  } catch {
    // 文件损坏或不存在，使用空统计
  }
  return false;
}

/**
 * 将统计数据持久化到磁盘
 */
export function saveStatsToDisk(): boolean {
  try {
    fs.writeFileSync(statsFilePath, JSON.stringify(statsData, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * 记录一次审查结果
 */
function recordReview(result: {
  success: boolean;
  durationMs: number;
  issuesByDimension?: Record<string, number>;
  issuesBySeverity?: Record<string, number>;
}): void {
  statsData.totalReviews += 1;
  if (result.success) {
    statsData.successCount += 1;
  } else {
    statsData.failureCount += 1;
  }
  statsData.totalDurationMs += result.durationMs;
  statsData.averageDurationMs = Math.round(statsData.totalDurationMs / statsData.totalReviews);
  statsData.lastReviewAt = new Date().toISOString();

  // 累加维度统计
  if (result.issuesByDimension) {
    for (const [dim, count] of Object.entries(result.issuesByDimension)) {
      statsData.issuesByDimension[dim] = (statsData.issuesByDimension[dim] || 0) + count;
    }
  }

  // 累加严重程度统计
  if (result.issuesBySeverity) {
    for (const [sev, count] of Object.entries(result.issuesBySeverity)) {
      statsData.issuesBySeverity[sev] = (statsData.issuesBySeverity[sev] || 0) + count;
    }
  }

  // 异步持久化
  saveStatsToDisk();
}

/**
 * 导出 Prometheus text exposition 格式的指标
 */
function exportPrometheus(): string {
  const lines: string[] = [];

  lines.push('# HELP inquisitor_reviews_total Total number of code reviews performed');
  lines.push('# TYPE inquisitor_reviews_total counter');
  lines.push(`inquisitor_reviews_total ${statsData.totalReviews}`);

  lines.push('# HELP inquisitor_reviews_success_total Total successful reviews');
  lines.push('# TYPE inquisitor_reviews_success_total counter');
  lines.push(`inquisitor_reviews_success_total ${statsData.successCount}`);

  lines.push('# HELP inquisitor_reviews_failure_total Total failed reviews');
  lines.push('# TYPE inquisitor_reviews_failure_total counter');
  lines.push(`inquisitor_reviews_failure_total ${statsData.failureCount}`);

  lines.push('# HELP inquisitor_review_duration_ms_avg Average review duration in milliseconds');
  lines.push('# TYPE inquisitor_review_duration_ms_avg gauge');
  lines.push(`inquisitor_review_duration_ms_avg ${statsData.averageDurationMs}`);

  // 按维度分组的 issue 统计
  lines.push('# HELP inquisitor_issues_by_dimension Issues found by review dimension');
  lines.push('# TYPE inquisitor_issues_by_dimension gauge');
  for (const [dim, count] of Object.entries(statsData.issuesByDimension)) {
    lines.push(`inquisitor_issues_by_dimension{dimension="${dim}"} ${count}`);
  }

  // 按严重程度分组的 issue 统计
  lines.push('# HELP inquisitor_issues_by_severity Issues found by severity level');
  lines.push('# TYPE inquisitor_issues_by_severity gauge');
  for (const [sev, count] of Object.entries(statsData.issuesBySeverity)) {
    lines.push(`inquisitor_issues_by_severity{severity="${sev}"} ${count}`);
  }

  return lines.join('\n');
}

/**
 * 导出结构化 JSON 格式的指标
 */
function exportJson(): object {
  return {
    inquisitor_reviews_total: statsData.totalReviews,
    inquisitor_reviews_success_total: statsData.successCount,
    inquisitor_reviews_failure_total: statsData.failureCount,
    inquisitor_review_duration_ms_avg: statsData.averageDurationMs,
    inquisitor_issues_by_dimension: { ...statsData.issuesByDimension },
    inquisitor_issues_by_severity: { ...statsData.issuesBySeverity },
  };
}

/**
 * 处理 stats 工具调用
 */
export async function handleStats(
  args: {
    action: 'get' | 'reset' | 'export' | 'record';
    format?: 'prometheus' | 'json';
    reviewResult?: {
      success: boolean;
      durationMs: number;
      issuesByDimension?: Record<string, number>;
      issuesBySeverity?: Record<string, number>;
    };
  }
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const action = args.action;

  switch (action) {
    case 'get': {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(getStats(), null, 2),
        }],
      };
    }

    case 'reset': {
      statsData = createEmptyStats();
      saveStatsToDisk();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ message: '统计数据已清零', stats: getStats() }, null, 2),
        }],
      };
    }

    case 'export': {
      const format = args.format || 'prometheus';
      if (format === 'prometheus') {
        return {
          content: [{
            type: 'text' as const,
            text: exportPrometheus(),
          }],
        };
      } else {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(exportJson(), null, 2),
          }],
        };
      }
    }

    case 'record': {
      if (!args.reviewResult) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: 'record 操作需要提供 reviewResult 参数' }),
          }],
        };
      }
      recordReview(args.reviewResult);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ message: '审查结果已记录', stats: getStats() }, null, 2),
        }],
      };
    }

    default: {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: `未知操作: ${action}` }),
        }],
      };
    }
  }
}
