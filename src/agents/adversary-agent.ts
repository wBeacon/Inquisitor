import Anthropic from '@anthropic-ai/sdk';
import { AgentConfig, ReviewIssue, AdversaryResult } from '../types';
import { ADVERSARY_AGENT_PROMPT } from './prompts/adversary-prompt';

/**
 * AdversaryResult 中的问题判断
 */
export interface IssueJudgment {
  /** 已有问题列表中的索引 */
  existingIssueIndex: number;
  /** 判断结果：confirmed、disputed、false_positive */
  judgment: 'confirmed' | 'disputed' | 'false_positive';
  /** 判断理由（必须非空） */
  reason: string;
  /** 建议的置信度调整 */
  suggestedConfidenceAdjustment?: number;
  /** 建议的严重程度调整 */
  suggestedSeverityAdjustment?: string;
}

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
 * 以全新的、完全独立的视角审视代码，寻找被遗漏的问题并质疑已有结论。
 * 通过 Anthropic SDK 调用 Claude API，在完全隔离的上下文中运行。
 */
export class AdversaryAgent {
  private config: AgentConfig;
  private timeout: number;

  constructor(config?: Partial<AgentConfig>) {
    const defaultConfig: AgentConfig = {
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

    this.config = defaultConfig;
    this.timeout = config?.maxTokens ? config.maxTokens * 100 : 300000;
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
      (adversaryResult as unknown as Record<string, unknown>)['_judgments'] = result.issueJudgments;

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

  // 追踪 token 使用量
  private _lastTokenUsage = { input: 0, output: 0, total: 0 };

  /**
   * 调用 Claude API 执行对抗审查
   * 每次调用创建独立的 Anthropic 客户端实例，确保完全隔离
   */
  private async callClaudeAPI(userMessage: string): Promise<string> {
    // 每次调用创建新的客户端实例，确保无共享状态
    const client = new Anthropic();

    const response = await client.messages.create({
      model: this.config.model || 'claude-sonnet-4-20250514',
      max_tokens: this.config.maxTokens || 4000,
      temperature: this.config.temperature || 0.7,
      system: this.config.systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    // 追踪 token 使用量
    this._lastTokenUsage = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      total: response.usage.input_tokens + response.usage.output_tokens,
    };

    // 提取文本内容
    const textContent = response.content.find((block) => block.type === 'text');
    return textContent ? textContent.text : '';
  }

  /**
   * 执行对抗审查的实际逻辑
   * 构建结构化用户消息，调用 Claude API，解析响应
   */
  async performAdversaryReview(
    files: string[],
    context: string,
    existingIssues: ReviewIssue[]
  ): Promise<AdversaryReviewResponse> {
    // 构建用户消息
    const userMessage = this.buildUserMessage(files, context, existingIssues);

    // 调用 Claude API
    const rawResponse = await this.callClaudeAPI(userMessage);

    // 解析响应
    return this.parseAdversaryResponse(rawResponse, existingIssues);
  }

  /**
   * 构建发送给 Claude API 的用户消息
   */
  private buildUserMessage(
    files: string[],
    context: string,
    existingIssues: ReviewIssue[]
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

    message += '请按照系统提示中定义的 JSON 格式输出你的审查结果。';

    return message;
  }

  /**
   * 解析 Claude API 的对抗审查响应
   * 使用健壮的 JSON 解析，处理 LLM 常见输出问题
   */
  private parseAdversaryResponse(
    rawText: string,
    existingIssues: ReviewIssue[]
  ): AdversaryReviewResponse {
    let text = rawText.trim();

    // 移除 markdown code fence
    const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeFenceMatch) {
      text = codeFenceMatch[1].trim();
    }

    // 尝试提取 JSON 对象
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      text = objectMatch[0];
    }

    // 移除 trailing commas
    text = text.replace(/,\s*([\]}])/g, '$1');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      // 尝试单引号替换
      try {
        const doubleQuoted = text
          .replace(/'/g, '"')
          .replace(/(\{|,)\s*(\w+)\s*:/g, '$1"$2":');
        parsed = JSON.parse(doubleQuoted);
      } catch {
        // 解析完全失败，抛出错误触发 graceful degradation
        throw new Error(`Failed to parse adversary response: ${rawText.substring(0, 200)}`);
      }
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
          dimension: 'adversary-found' as unknown as ReviewIssue['dimension'],
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

  /**
   * 获取 Agent 配置
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * 获取 Agent ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * 获取 Agent 名称
   */
  getName(): string {
    return this.config.name;
  }
}
