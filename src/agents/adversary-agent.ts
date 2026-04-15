import { AgentConfig, ReviewIssue, AdversaryResult } from '../types';
import { ADVERSARY_AGENT_PROMPT } from './prompts';

/**
 * AdversaryResult 中的问题判断
 */
export interface IssueJudgment {
  /** 已有问题列表中的索引 */
  existingIssueIndex: number;
  /** 判断结果：confirmed、disputed、false_positive */
  judgment: 'confirmed' | 'disputed' | 'false_positive';
  /** 判断理由 */
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
 * 以全新的、完全独立的视角审视代码，寻找被遗漏的问题并质疑已有结论
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
      // 在实际实现中，这会调用 Claude Code Agent tool
      // 传递 ADVERSARY_AGENT_PROMPT 作为 system prompt
      // 以及已有的问题列表作为输入

      const result = await this.performAdversaryReview(files, context, existingIssues);

      const durationMs = Date.now() - startTime;

      return {
        agentId: this.config.id,
        issues: result.newIssues,
        durationMs,
        tokenUsage: {
          input: 0,
          output: 0,
          total: 0,
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
    } catch (error) {
      const durationMs = Date.now() - startTime;

      return {
        agentId: this.config.id,
        issues: [],
        durationMs,
        tokenUsage: {
          input: 0,
          output: 0,
          total: 0,
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
   */
  private async performAdversaryReview(
    _files: string[],
    _context: string,
    _existingIssues: ReviewIssue[]
  ): Promise<AdversaryReviewResponse> {
    // 占位符实现
    // 实际实现会调用 Claude Code Agent tool
    console.log(`AdversaryAgent reviewing ${_files.length} files with ${_existingIssues.length} existing issues`);

    return {
      newIssues: [],
      issueJudgments: _existingIssues.map((_, index) => ({
        existingIssueIndex: index,
        judgment: 'confirmed' as const,
        reason: 'Confirmed by adversary review',
      })),
    };
  }

  /**
   * 获取 Agent 配置
   */
  getConfig(): AgentConfig {
    return this.config;
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
