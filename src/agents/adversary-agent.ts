import { AgentConfig, ReviewIssue, AdversaryResult, ReviewDimension, IssueJudgment } from '../types';
import { ADVERSARY_AGENT_PROMPT } from './prompts/adversary-prompt';
import { AgentRunner } from './agent-runner';
import { LLMProvider } from '../providers';

// 从 types 中 re-export IssueJudgment，保持向后兼容
export { IssueJudgment } from '../types';

/**
 * AdversaryAgent 的审查响应格式
 */
export interface AdversaryReviewResponse {
  /** 新发现的问题 */
  newIssues: ReviewIssue[];
  /** 对已有问题的判断 */
  issueJudgments: IssueJudgment[];
}

/**
 * AdversaryAgent - 对抗式审查 Agent
 * 继承 AgentRunner 复用 API 调用和 JSON 解析基础设施。
 * 以全新的、完全独立的视角审视代码，寻找被遗漏的问题并质疑已有结论。
 * 通过 Anthropic SDK 调用 Claude API，在完全隔离的上下文中运行。
 */
export class AdversaryAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>, provider?: LLMProvider) {
    const fullConfig: AgentConfig = {
      id: config?.id || 'adversary-agent',
      name: config?.name || 'Adversary Code Review Agent',
      description:
        config?.description ||
        'Operates in completely isolated context to find missed issues and challenge existing conclusions',
      systemPrompt: config?.systemPrompt || ADVERSARY_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.7, // 略高的温度以鼓励创意思考
    };

    const timeout = config?.maxTokens ? config.maxTokens * 100 : 300000;
    super(fullConfig, timeout, provider);
  }

  /**
   * 实现 AgentRunner 的抽象方法
   * AdversaryAgent 主要通过 challenge() 方法使用，performReview 提供基本兼容
   */
  protected async performReview(
    files: string[],
    context: string
  ): Promise<ReviewIssue[]> {
    // AdversaryAgent 主要通过 challenge() 使用，此方法提供基本兼容
    const result = await this.performAdversaryReview(files, context, []);
    return result.newIssues;
  }

  /**
   * 执行对抗审查
   * @param files 待审查的文件列表
   * @param context 审查上下文
   * @param existingIssues 其他 Agent 发现的问题
   * @returns 对抗审查结果
   */
  async challenge(
    files: string[],
    context: string,
    existingIssues: ReviewIssue[]
  ): Promise<AdversaryResult> {
    const startTime = Date.now();

    try {
      const result = await this.performAdversaryReview(files, context, existingIssues);

      const durationMs = Date.now() - startTime;

      const adversaryResult: AdversaryResult = {
        agentId: this.config.id,
        issues: result.newIssues,
        durationMs,
        tokenUsage: {
          input: this._lastTokenUsage.input,
          output: this._lastTokenUsage.output,
          total: this._lastTokenUsage.total,
        },
        success: true,
        falsePositives: result.issueJudgments
          .filter((j) => j.judgment === 'false_positive')
          .map((j) => j.existingIssueIndex),
        confidenceAdjustments: result.issueJudgments
          .filter((j) => j.suggestedConfidenceAdjustment !== undefined)
          .map((j) => ({
            issueIndex: j.existingIssueIndex,
            newConfidence: j.suggestedConfidenceAdjustment || 0,
            reason: j.reason,
          })),
      };

      // 附加完整的判断信息，供 IssueCalibrator 使用
      adversaryResult.judgments = result.issueJudgments;

      return adversaryResult;
    } catch (error) {
      // Graceful degradation: API 超时或解析错误时，返回所有 issue 为 confirmed，不丢失原始审查结果
      const durationMs = Date.now() - startTime;

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
        falsePositives: [],
        confidenceAdjustments: [],
      };
    }
  }

  /**
   * 执行对抗审查的实际逻辑
   * 构建结构化用户消息，调用 Claude API（复用基类 callClaudeAPI），解析响应
   */
  async performAdversaryReview(
    files: string[],
    context: string,
    existingIssues: ReviewIssue[]
  ): Promise<AdversaryReviewResponse> {
    // 构建用户消息
    const userMessage = this.buildUserMessage(files, context, existingIssues);

    // 调用 Claude API（复用基类方法）
    const rawResponse = await this.callClaudeAPI(userMessage);

    // 解析响应
    return this.parseAdversaryResponse(rawResponse, existingIssues);
  }

  /**
   * 构建发送给 Claude API 的用户消息
   * @param files 文件列表
   * @param context 代码上下文
   * @param existingIssues 已有问题列表
   * @param previousRoundFindings 前几轮对抗审查发现的新问题（多轮迭代用）
   */
  buildUserMessage(
    files: string[],
    context: string,
    existingIssues: ReviewIssue[],
    previousRoundFindings?: ReviewIssue[]
  ): string {
    let message = '## 待审查代码\n\n';

    // 添加文件列表
    message += '### 文件列表\n';
    for (const file of files) {
      message += `- ${file}\n`;
    }
    message += '\n';

    // 添加代码上下文
    message += '### 代码内容\n';
    message += '```\n';
    message += context;
    message += '\n```\n\n';

    // 添加已有问题列表
    if (existingIssues.length > 0) {
      message += '## 已有审查问题\n\n';
      message += '以下是其他 Agent 发现的问题列表，请对每个问题进行独立判断：\n\n';

      existingIssues.forEach((issue, index) => {
        message += `### 问题 #${index} [${issue.severity}] [${issue.dimension}]\n`;
        message += `- 文件: ${issue.file}, 行号: ${issue.line}\n`;
        message += `- 描述: ${issue.description}\n`;
        message += `- 建议: ${issue.suggestion}\n`;
        message += `- 置信度: ${issue.confidence}\n`;
        if (issue.codeSnippet) {
          message += `- 代码片段: \`${issue.codeSnippet}\`\n`;
        }
        message += '\n';
      });
    } else {
      message += '## 已有审查问题\n\n无已有问题。请专注于寻找新问题。\n\n';
    }

    // 添加前几轮对抗审查的发现（多轮迭代时）
    if (previousRoundFindings && previousRoundFindings.length > 0) {
      message += '## 前轮对抗审查已发现的问题\n\n';
      message += '以下问题已在之前的对抗轮次中被发现，请勿重复报告，专注于寻找新的遗漏：\n\n';

      previousRoundFindings.forEach((issue, index) => {
        message += `### 已发现 #${index} [${issue.severity}]\n`;
        message += `- 文件: ${issue.file}, 行号: ${issue.line}\n`;
        message += `- 描述: ${issue.description}\n\n`;
      });
    }

    message += '请按照系统提示中定义的 JSON 格式输出你的审查结果。';

    return message;
  }

  /**
   * 解析 Claude API 的对抗审查响应
   * 复用基类的 preprocessJsonText 和 tryParseJson 进行 JSON 预处理和容错解析
   */
  private parseAdversaryResponse(
    rawText: string,
    existingIssues: ReviewIssue[]
  ): AdversaryReviewResponse {
    let text = this.preprocessJsonText(rawText);

    // 尝试提取 JSON 对象
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      text = objectMatch[0];
    }

    const parsed = this.tryParseJson(text) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`Failed to parse adversary response: ${rawText.substring(0, 200)}`);
    }

    // 提取并验证 newIssues
    const newIssues = this.validateNewIssues(parsed.newIssues);

    // 提取并验证 issueJudgments
    const issueJudgments = this.validateJudgments(parsed.issueJudgments, existingIssues.length);

    return { newIssues, issueJudgments };
  }

  /**
   * 验证并修正新发现的问题
   * 所有新问题的 dimension 强制设为 'adversary-found'
   */
  private validateNewIssues(rawIssues: unknown): ReviewIssue[] {
    if (!Array.isArray(rawIssues)) return [];

    const validSeverities = new Set(['critical', 'high', 'medium', 'low']);

    return rawIssues
      .filter((item): item is Record<string, unknown> => {
        if (typeof item !== 'object' || item === null) return false;
        const obj = item as Record<string, unknown>;
        if (typeof obj.file !== 'string' || !obj.file) return false;
        if (typeof obj.line !== 'number' || obj.line <= 0) return false;
        if (typeof obj.description !== 'string' || !obj.description) return false;
        if (typeof obj.suggestion !== 'string' || !obj.suggestion) return false;
        return true;
      })
      .map((obj) => {
        const severity = validSeverities.has(obj.severity as string)
          ? (obj.severity as ReviewIssue['severity'])
          : 'medium';

        let confidence = typeof obj.confidence === 'number' ? obj.confidence : 0.5;
        confidence = Math.max(0, Math.min(1, confidence));

        const issue: ReviewIssue = {
          file: obj.file as string,
          line: obj.line as number,
          severity,
          // 所有对抗审查发现的问题统一标记为 'adversary-found'
          dimension: ReviewDimension.AdversaryFound,
          description: obj.description as string,
          suggestion: obj.suggestion as string,
          confidence,
          foundBy: 'adversary-agent',
        };

        if (typeof obj.endLine === 'number' && obj.endLine > 0) {
          issue.endLine = obj.endLine;
        }
        if (typeof obj.codeSnippet === 'string') {
          issue.codeSnippet = obj.codeSnippet;
        }

        return issue;
      });
  }

  /**
   * 验证并修正问题判断
   * 确保每个判断都有有效的 judgment 和非空 reason
   */
  private validateJudgments(rawJudgments: unknown, existingCount: number): IssueJudgment[] {
    if (!Array.isArray(rawJudgments)) {
      // 如果没有判断列表，对所有已有问题默认 confirmed
      return Array.from({ length: existingCount }, (_, i) => ({
        existingIssueIndex: i,
        judgment: 'confirmed' as const,
        reason: 'No explicit judgment provided by adversary, defaulting to confirmed',
      }));
    }

    const validJudgments = new Set(['confirmed', 'disputed', 'false_positive']);

    return rawJudgments
      .filter((item): item is Record<string, unknown> => {
        if (typeof item !== 'object' || item === null) return false;
        const obj = item as Record<string, unknown>;
        if (typeof obj.existingIssueIndex !== 'number') return false;
        if (obj.existingIssueIndex < 0 || obj.existingIssueIndex >= existingCount) return false;
        return true;
      })
      .map((obj) => {
        const judgment = validJudgments.has(obj.judgment as string)
          ? (obj.judgment as IssueJudgment['judgment'])
          : 'confirmed';

        // reason 必须为非空字符串
        const reason =
          typeof obj.reason === 'string' && obj.reason.trim().length > 0
            ? obj.reason.trim()
            : `Issue ${judgment} by adversary review`;

        const result: IssueJudgment = {
          existingIssueIndex: obj.existingIssueIndex as number,
          judgment,
          reason,
        };

        if (typeof obj.suggestedConfidenceAdjustment === 'number') {
          result.suggestedConfidenceAdjustment = Math.max(
            0,
            Math.min(1, obj.suggestedConfidenceAdjustment)
          );
        }

        if (
          typeof obj.suggestedSeverityAdjustment === 'string' &&
          ['critical', 'high', 'medium', 'low'].includes(obj.suggestedSeverityAdjustment)
        ) {
          result.suggestedSeverityAdjustment = obj.suggestedSeverityAdjustment;
        }

        return result;
      });
  }
}
