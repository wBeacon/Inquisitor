import {
  AgentConfig,
  ReviewIssue,
  ReviewReport,
  MetaReviewReport,
  MetaReviewSummary,
  RootCause,
  MetaReviewVerdict,
  MetaReviewResult,
  ReviewDimension,
} from '../types';
import { META_REVIEWER_AGENT_PROMPT } from './prompts/meta-reviewer-prompt';
import { AgentRunner } from './agent-runner';
import { LLMProvider } from '../providers';

/**
 * MetaReviewerAgent - 元审查 Agent
 * 从整体视角评估完整的审查报告，识别根因、评估质量、做出最终裁决
 * 继承 AgentRunner 复用 API 调用和 JSON 解析基础设施
 */
export class MetaReviewerAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>, provider?: LLMProvider) {
    const fullConfig: AgentConfig = {
      id: config?.id || 'meta-reviewer',
      name: config?.name || 'Meta Reviewer Agent',
      description:
        config?.description ||
        'Evaluates complete review reports from holistic perspective, identifies root causes, assesses quality, and makes final verdicts',
      systemPrompt: config?.systemPrompt || META_REVIEWER_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 6000,
      temperature: config?.temperature || 0.3, // 较低温度以保持严谨
    };

    const timeout = config?.maxTokens ? config.maxTokens * 100 : 600000;
    super(fullConfig, timeout, provider);
  }

  /**
   * 实现 AgentRunner 的抽象方法（未使用，元审查通过 analyze() 调用）
   */
  protected async performReview(
    files: string[],
    context: string
  ): Promise<ReviewIssue[]> {
    // MetaReviewerAgent 主要通过 analyze() 使用，此方法提供基本兼容
    return [];
  }

  /**
   * 执行元审查
   * @param report 完整的审查报告
   * @param files 待审查的文件列表
   * @param context 审查上下文
   * @returns 元审查结果
   */
  async analyze(
    report: ReviewReport,
    files: string[],
    context: string
  ): Promise<MetaReviewReport> {
    const startTime = Date.now();

    try {
      // 构建用户消息
      const userMessage = this.buildAnalysisMessage(report, files, context);

      // 调用 Claude API
      const rawResponse = await this.callClaudeAPI(userMessage);

      // 解析响应
      const result = this.parseMetaReviewResponse(rawResponse, report.issues);

      const durationMs = Date.now() - startTime;

      const metaReviewReport: MetaReviewReport = {
        agentId: this.config.id,
        issues: [], // 元审查不生成新的 issue，而是评估现有 issue
        durationMs,
        tokenUsage: {
          input: this._lastTokenUsage.input,
          output: this._lastTokenUsage.output,
          total: this._lastTokenUsage.total,
        },
        success: true,
        summary: result.summary,
        rootCauses: result.rootCauses,
        verdict: result.verdict,
        observations: result.observations,
      };

      return metaReviewReport;
    } catch (error) {
      // Graceful degradation: API 超时或解析错误时，返回默认的中等评级报告
      const durationMs = Date.now() - startTime;

      const defaultSummary: MetaReviewSummary = {
        qualityGrade: 'C',
        qualityScore: 50,
        coveragePercentage: 50,
        completenessPercentage: 50,
        criticalFindingsCount: report.summary.bySeverity.critical,
        priorityRecommendation:
          'Unable to complete meta-review due to API failure. Please review findings manually.',
      };

      return {
        agentId: this.config.id,
        issues: [],
        durationMs,
        tokenUsage: {
          input: this._lastTokenUsage.input,
          output: this._lastTokenUsage.output,
          total: this._lastTokenUsage.total,
        },
        success: false,
        error: error instanceof Error ? error.message : String(error),
        summary: defaultSummary,
        rootCauses: [],
        verdict: {
          dismissedIssueIndices: [],
          elevatedIssueIndices: [],
          summary: 'Meta-review failed due to API error.',
        },
      };
    }
  }

  /**
   * 构建发送给 Claude API 的分析消息
   */
  private buildAnalysisMessage(
    report: ReviewReport,
    files: string[],
    context: string
  ): string {
    let message = '## 代码审查报告元审查\n\n';

    // 添加文件列表
    message += '### 审查的文件\n';
    for (const file of files) {
      message += `- ${file}\n`;
    }
    message += '\n';

    // 添加代码上下文
    message += '### 代码内容\n```\n';
    message += context;
    message += '\n```\n\n';

    // 添加审查摘要
    message += '### 审查摘要\n';
    message += `- 总问题数: ${report.summary.totalIssues}\n`;
    message += `- Critical: ${report.summary.bySeverity.critical}\n`;
    message += `- High: ${report.summary.bySeverity.high}\n`;
    message += `- Medium: ${report.summary.bySeverity.medium}\n`;
    message += `- Low: ${report.summary.bySeverity.low}\n`;

    // 获取有问题的维度
    const dimensionsWithIssues: string[] = [];
    for (const dimension in report.summary.byDimension) {
      const count = report.summary.byDimension[dimension as ReviewDimension];
      if (typeof count === 'number' && count > 0) {
        dimensionsWithIssues.push(dimension);
      }
    }
    message += `- 审查维度: ${dimensionsWithIssues.join(', ') || 'None'}\n`;
    message += `- 耗时: ${report.metadata.durationMs}ms\n`;

    // 安全地访问 stages 信息
    const metadata = report.metadata as unknown as Record<string, unknown>;
    const stages = metadata.stages;
    if (stages && typeof stages === 'object') {
      message += `- 各阶段耗时:\n`;
      for (const [stage, time] of Object.entries(stages)) {
        message += `  - ${stage}: ${time}ms\n`;
      }
    }
    message += '\n';

    // 添加发现的问题详细列表
    if (report.issues.length > 0) {
      message += '### 发现的问题详细列表\n\n';
      report.issues.forEach((issue, index) => {
        message += `**问题 #${index}**: [${issue.severity.toUpperCase()}] [${issue.dimension}]\n`;
        message += `- 文件: ${issue.file}, 行号: ${issue.line}${issue.endLine ? `-${issue.endLine}` : ''}\n`;
        message += `- 描述: ${issue.description}\n`;
        message += `- 建议: ${issue.suggestion}\n`;
        message += `- 置信度: ${(issue.confidence * 100).toFixed(0)}%\n`;
        if (issue.codeSnippet) {
          message += `- 代码片段: \`${issue.codeSnippet}\`\n`;
        }
        if (issue.foundBy) {
          message += `- 发现者: ${issue.foundBy}\n`;
        }
        message += '\n';
      });
    }

    message += '请按照系统提示中定义的 JSON 格式输出你的元审查结果。';

    return message;
  }

  /**
   * 解析 Claude API 的元审查响应
   */
  private parseMetaReviewResponse(
    rawText: string,
    issues: ReviewIssue[]
  ): {
    summary: MetaReviewSummary;
    rootCauses: RootCause[];
    verdict: MetaReviewVerdict;
    observations?: string[];
  } {
    let text = this.preprocessJsonText(rawText);

    // 尝试提取 JSON 对象
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      text = objectMatch[0];
    }

    const parsed = this.tryParseJson(text) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`Failed to parse meta-review response: ${rawText.substring(0, 200)}`);
    }

    // 验证并提取各个部分
    const summary = this.validateSummary(parsed.summary);
    const rootCauses = this.validateRootCauses(parsed.rootCauses, issues.length);
    const verdict = this.validateVerdict(parsed.verdict, issues.length);
    const observations = this.validateObservations(parsed.observations);

    return { summary, rootCauses, verdict, observations };
  }

  /**
   * 验证质量评估摘要
   */
  private validateSummary(rawSummary: unknown): MetaReviewSummary {
    if (!rawSummary || typeof rawSummary !== 'object') {
      return {
        qualityGrade: 'C',
        qualityScore: 50,
        coveragePercentage: 50,
        completenessPercentage: 50,
        criticalFindingsCount: 0,
        priorityRecommendation: 'Unable to evaluate quality due to parsing error',
      };
    }

    const obj = rawSummary as Record<string, unknown>;

    // 验证质量等级
    const validGrades = new Set(['A', 'B', 'C', 'D', 'F']);
    const qualityGrade = validGrades.has(obj.qualityGrade as string)
      ? (obj.qualityGrade as 'A' | 'B' | 'C' | 'D' | 'F')
      : 'C';

    // 验证分数（0-100）
    const clampScore = (value: unknown): number => {
      const num = typeof value === 'number' ? value : 50;
      return Math.max(0, Math.min(100, Math.floor(num)));
    };

    const qualityScore = clampScore(obj.qualityScore);
    const coveragePercentage = clampScore(obj.coveragePercentage);
    const completenessPercentage = clampScore(obj.completenessPercentage);

    const criticalFindingsCount =
      typeof obj.criticalFindingsCount === 'number' ? Math.max(0, obj.criticalFindingsCount) : 0;

    const priorityRecommendation =
      typeof obj.priorityRecommendation === 'string' && obj.priorityRecommendation.trim().length > 0
        ? obj.priorityRecommendation.trim()
        : 'Review findings based on severity and business impact';

    return {
      qualityGrade,
      qualityScore,
      coveragePercentage,
      completenessPercentage,
      criticalFindingsCount,
      priorityRecommendation,
    };
  }

  /**
   * 验证根因分析
   */
  private validateRootCauses(rawCauses: unknown, issueCount: number): RootCause[] {
    if (!Array.isArray(rawCauses)) return [];

    const validSeverities = new Set(['critical', 'high', 'medium', 'low']);

    return rawCauses
      .filter((item): item is Record<string, unknown> => {
        if (typeof item !== 'object' || item === null) return false;
        const obj = item as Record<string, unknown>;
        if (typeof obj.description !== 'string' || !obj.description) return false;
        if (!Array.isArray(obj.affectedIssueIndices)) return false;
        return true;
      })
      .map((obj) => {
        const severity = validSeverities.has(obj.severity as string)
          ? (obj.severity as any)
          : 'medium';

        // 验证和过滤受影响的问题索引
        const affectedIssueIndices = (obj.affectedIssueIndices as unknown[])
          .filter(
            (idx): idx is number =>
              typeof idx === 'number' && idx >= 0 && idx < issueCount
          );

        return {
          description: (obj.description as string).trim(),
          affectedIssueIndices,
          severity,
        };
      })
      .filter((cause) => cause.affectedIssueIndices.length > 0); // 只保留有效的根因
  }

  /**
   * 验证最终判决
   */
  private validateVerdict(
    rawVerdict: unknown,
    issueCount: number
  ): MetaReviewVerdict {
    if (!rawVerdict || typeof rawVerdict !== 'object') {
      return {
        dismissedIssueIndices: [],
        elevatedIssueIndices: [],
        summary: 'Unable to generate verdict due to parsing error',
      };
    }

    const obj = rawVerdict as Record<string, unknown>;

    const validateIndices = (arr: unknown, max: number): number[] => {
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((idx): idx is number => typeof idx === 'number' && idx >= 0 && idx < max)
        .filter((v, i, a) => a.indexOf(v) === i); // 去重
    };

    const dismissedIssueIndices = validateIndices(obj.dismissedIssueIndices, issueCount);
    const elevatedIssueIndices = validateIndices(obj.elevatedIssueIndices, issueCount);

    // 确保驳回和优先级提升的问题不重叠
    const elevatedSet = new Set(elevatedIssueIndices);
    const finalDismissed = dismissedIssueIndices.filter((idx) => !elevatedSet.has(idx));

    const summary =
      typeof obj.summary === 'string' && obj.summary.trim().length > 0
        ? obj.summary.trim()
        : 'Meta-review completed. Please address identified issues based on severity and rootcause analysis.';

    return {
      dismissedIssueIndices: finalDismissed,
      elevatedIssueIndices,
      summary,
    };
  }

  /**
   * 验证观察
   */
  private validateObservations(rawObservations: unknown): string[] | undefined {
    if (!Array.isArray(rawObservations)) return undefined;

    const observations = rawObservations
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());

    return observations.length > 0 ? observations : undefined;
  }

  /**
   * 将 MetaReviewReport 转换为简化的 MetaReviewResult
   * 用于附加到 ReviewReport.metaReview
   */
  static toMetaReviewResult(report: MetaReviewReport): MetaReviewResult {
    // 映射 verdict: 根据 dismissedIssueIndices 和 summary 推导
    let verdict: 'approve' | 'request_changes' | 'needs_discussion' = 'needs_discussion';
    const grade = report.summary.qualityGrade;
    if (grade === 'A' || grade === 'B') {
      verdict = 'approve';
    } else if (grade === 'D' || grade === 'F') {
      verdict = 'request_changes';
    }

    // rootCauses 转为 string[] （从详细的 RootCause 提取描述）
    const rootCauses = report.rootCauses.map((rc) => rc.description);

    return {
      qualityGrade: report.summary.qualityGrade,
      rootCauses,
      verdict,
      dismissedIssueIndices: [...report.verdict.dismissedIssueIndices],
    };
  }
}
