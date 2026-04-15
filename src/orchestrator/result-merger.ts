import { ReviewIssue, AdversaryResult, AgentResult, TokenUsage } from '../types';

/**
 * 去重合并配置
 */
export interface MergerConfig {
  /** 低置信度阈值，低于此值的 false_positive 直接移除 */
  lowConfidenceThreshold: number;
}

/** 默认合并配置 */
const DEFAULT_MERGER_CONFIG: MergerConfig = {
  lowConfidenceThreshold: 0.3,
};

/**
 * severity 降级映射
 */
const SEVERITY_DOWNGRADE: Record<string, ReviewIssue['severity']> = {
  critical: 'high',
  high: 'medium',
  medium: 'low',
  low: 'low',
};

/**
 * ResultMerger - 结果合并器
 * 独立模块，封装去重、置信度校准、排序逻辑
 * 可独立于 IssueCalibrator 使用和测试
 */
export class ResultMerger {
  private readonly config: MergerConfig;

  constructor(config?: Partial<MergerConfig>) {
    this.config = { ...DEFAULT_MERGER_CONFIG, ...config };
  }

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
    const severityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    return [...issues].sort((a, b) => {
      const severityDiff = (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4);
      if (severityDiff !== 0) return severityDiff;
      return b.confidence - a.confidence;
    });
  }

  /**
   * 应用置信度调整
   * @param issues 原始问题列表
   * @param adjustments 对抗 Agent 的置信度调整建议
   * @returns 调整后的问题列表
   */
  applyConfidenceAdjustments(
    issues: ReviewIssue[],
    adjustments: Array<{ issueIndex: number; newConfidence: number; reason: string }>
  ): ReviewIssue[] {
    const adjustmentMap = new Map(adjustments.map((a) => [a.issueIndex, a.newConfidence]));

    return issues.map((issue, index) => {
      const newConfidence = adjustmentMap.get(index);
      if (newConfidence !== undefined) {
        return { ...issue, confidence: Math.max(0, Math.min(1, newConfidence)) };
      }
      return issue;
    });
  }

  /**
   * 处理 false_positive
   * - 低置信度(< threshold) 的 false_positive 直接移除
   * - 其余 false_positive 降级 severity
   */
  processFalsePositives(
    issues: ReviewIssue[],
    falsePositiveIndices: number[]
  ): ReviewIssue[] {
    const fpSet = new Set(falsePositiveIndices);

    return issues
      .map((issue, index) => {
        if (!fpSet.has(index)) return issue;
        // 低置信度 false_positive 移除
        if (issue.confidence < this.config.lowConfidenceThreshold) return null;
        // 降级 severity
        return {
          ...issue,
          severity: SEVERITY_DOWNGRADE[issue.severity] || issue.severity,
        };
      })
      .filter((issue): issue is ReviewIssue => issue !== null);
  }

  /**
   * 完整的合并流程：置信度调整 -> false_positive 处理 -> 添加新问题 -> 去重 -> 排序
   * @param originalIssues 维度 Agent 发现的原始问题
   * @param adversaryResult 对抗审查结果（可选）
   * @returns 最终合并后的问题列表
   */
  merge(originalIssues: ReviewIssue[], adversaryResult?: AdversaryResult): ReviewIssue[] {
    if (!adversaryResult || !adversaryResult.success) {
      // 无对抗结果或对抗失败，仅去重排序
      return this.sort(this.dedup(originalIssues));
    }

    // 置信度调整
    let issues = this.applyConfidenceAdjustments(
      originalIssues,
      adversaryResult.confidenceAdjustments
    );

    // false_positive 处理
    issues = this.processFalsePositives(issues, adversaryResult.falsePositives);

    // 添加对抗 Agent 发现的新问题
    issues = [...issues, ...adversaryResult.issues];

    // 去重和排序
    return this.sort(this.dedup(issues));
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
