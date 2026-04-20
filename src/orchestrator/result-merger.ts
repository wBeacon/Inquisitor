import { ReviewIssue, AgentResult, TokenUsage } from '../types';
import { SEVERITY_ORDER } from '../utils/severity';

/**
 * ResultMerger - 结果合并器
 * 负责从多个 AgentResult 中收集问题、去重、排序，以及聚合 token 统计
 * 校准逻辑（置信度调整、false_positive 处理）由 IssueCalibrator 负责
 */
export class ResultMerger {
  /**
   * 从多个 AgentResult 中收集所有 issues
   * @param results Agent 执行结果列表
   * @returns 合并后的所有 issues
   */
  collectIssues(results: AgentResult[]): ReviewIssue[] {
    return results.flatMap((r) => r.issues);
  }

  /**
   * 去重：基于文件、行号、维度、严重级别的唯一 key
   * 重复问题保留置信度最高的
   * @param issues 问题列表
   * @returns 去重后的问题列表
   */
  dedup(issues: ReviewIssue[]): ReviewIssue[] {
    const issueMap = new Map<string, ReviewIssue>();

    for (const issue of issues) {
      const key = `${issue.file}:${issue.line}:${issue.dimension}:${issue.severity}`;
      const existing = issueMap.get(key);
      if (!existing || issue.confidence > existing.confidence) {
        issueMap.set(key, issue);
      }
    }

    return Array.from(issueMap.values());
  }

  /**
   * 按严重程度和置信度排序
   * 优先级: critical > high > medium > low，同级别按置信度降序
   */
  sort(issues: ReviewIssue[]): ReviewIssue[] {
    return [...issues].sort((a, b) => {
      const severityDiff = (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
      if (severityDiff !== 0) return severityDiff;
      return b.confidence - a.confidence;
    });
  }

  /**
   * 聚合多个 AgentResult 的 token 使用量
   * 返回每个 agent 独立的 token 统计
   */
  aggregateTokenUsage(results: AgentResult[]): Record<string, TokenUsage> {
    const usage: Record<string, TokenUsage> = {};
    for (const result of results) {
      usage[result.agentId] = { ...result.tokenUsage };
    }
    return usage;
  }

  /**
   * 计算总 token 使用量
   */
  totalTokenUsage(results: AgentResult[]): TokenUsage {
    let input = 0;
    let output = 0;
    for (const result of results) {
      input += result.tokenUsage.input;
      output += result.tokenUsage.output;
    }
    return { input, output, total: input + output };
  }
}
