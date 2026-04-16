import Anthropic from '@anthropic-ai/sdk';
import { AgentConfig, AgentResult, ReviewIssue, ReviewDimension } from '../types';

/**
 * AgentRunner - 执行代码审查 Agent 的基础类
 * 通过 Anthropic SDK 调用 Claude API，每个 Agent 在独立上下文中运行
 * 不共享任何可变状态，每次 review 创建独立的 API session
 */
export abstract class AgentRunner {
  protected readonly config: AgentConfig;
  protected readonly timeout: number;

  constructor(config: AgentConfig, timeout: number = 300000) {
    // 5分钟默认超时
    this.config = { ...config }; // 深拷贝配置，确保隔离
    this.timeout = timeout;
  }

  /**
   * 执行审查
   * @param files 要审查的文件路径列表
   * @param context 审查上下文（包含代码内容等）
   * @returns 审查结果
   */
  async review(files: string[], context: string): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      // 使用 Promise.race 实现超时控制
      const reviewPromise = this.performReview(files, context);
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error(`Agent ${this.config.id} timeout after ${this.timeout}ms`)), this.timeout);
      });

      const issues = await Promise.race([reviewPromise, timeoutPromise]);
      const durationMs = Date.now() - startTime;

      return {
        agentId: this.config.id,
        issues,
        durationMs,
        tokenUsage: {
          // 由 performReview 设置的实际值
          input: this._lastTokenUsage.input,
          output: this._lastTokenUsage.output,
          total: this._lastTokenUsage.total,
        },
        success: true,
      };
    } catch (error) {
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
      };
    }
  }

  // 每次 review 调用的 token 使用量，由 callClaudeAPI 更新
  // 初始化为空使用量，实际值由 API 响应填充
  protected _lastTokenUsage: { input: number; output: number; total: number } =
    this.createEmptyTokenUsage();

  protected createEmptyTokenUsage(): { input: number; output: number; total: number } {
    const empty = 0;
    return { input: empty, output: empty, total: empty };
  }

  /**
   * 调用 Claude API 执行审查
   * 每次调用创建独立的 Anthropic 客户端实例，确保完全隔离
   */
  protected async callClaudeAPI(userMessage: string): Promise<string> {
    // 每次调用创建新的客户端实例，确保无共享状态
    const client = new Anthropic();

    const response = await client.messages.create({
      model: this.config.model || 'claude-sonnet-4-20250514',
      max_tokens: this.config.maxTokens || 4000,
      temperature: this.config.temperature || 0.5,
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
   * 由子类实现的实际审查逻辑
   */
  protected abstract performReview(
    files: string[],
    context: string
  ): Promise<ReviewIssue[]>;

  /**
   * 获取 Agent 配置（返回副本，确保隔离）
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

  /**
   * 获取审查维度
   */
  getDimension(): ReviewDimension | undefined {
    return this.config.dimension;
  }

  /**
   * 健壮的 JSON 解析：处理 LLM 常见输出问题
   * 1. markdown code fence 包裹
   * 2. 多余文本包裹
   * 3. trailing comma
   * 4. 单引号替代双引号
   */
  protected parseJsonResponse(rawText: string): ReviewIssue[] {
    let text = rawText.trim();

    // 移除 markdown code fence
    const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeFenceMatch) {
      text = codeFenceMatch[1].trim();
    }

    // 尝试提取 JSON 数组（处理前后有多余文本的情况）
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      text = arrayMatch[0];
    }

    // 移除 trailing commas (对象和数组末尾的逗号)
    text = text.replace(/,\s*([\]}])/g, '$1');

    // 尝试直接解析
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return this.validateAndFixIssues(parsed);
      }
      return [];
    } catch {
      // 尝试将单引号替换为双引号
      try {
        const doubleQuoted = text
          .replace(/'/g, '"')
          // 修复属性名没有引号的情况
          .replace(/(\{|,)\s*(\w+)\s*:/g, '$1"$2":');
        const parsed = JSON.parse(doubleQuoted);
        if (Array.isArray(parsed)) {
          return this.validateAndFixIssues(parsed);
        }
      } catch {
        // 解析失败
      }
      return [];
    }
  }

  /**
   * 验证并修正 issue 数据：
   * - 确保必填字段存在且类型正确
   * - 强制修正 dimension 为当前 Agent 负责的维度
   * - 限制 confidence 在 0-1 范围内
   * - 过滤掉无效的 issue
   */
  protected validateAndFixIssues(rawIssues: unknown[]): ReviewIssue[] {
    const validSeverities = new Set(['critical', 'high', 'medium', 'low']);
    const expectedDimension = this.config.dimension;

    return rawIssues
      .filter((item): item is Record<string, unknown> => {
        if (typeof item !== 'object' || item === null) return false;
        const obj = item as Record<string, unknown>;
        // 必须有 file(string)、line(number>0)、description(string)、suggestion(string)
        if (typeof obj.file !== 'string' || !obj.file) return false;
        if (typeof obj.line !== 'number' || obj.line <= 0) return false;
        if (typeof obj.description !== 'string' || !obj.description) return false;
        if (typeof obj.suggestion !== 'string' || !obj.suggestion) return false;
        return true;
      })
      .map((obj) => {
        // 修正 severity
        const severity = validSeverities.has(obj.severity as string)
          ? (obj.severity as ReviewIssue['severity'])
          : 'medium';

        // 强制修正 dimension 为该 Agent 负责的维度
        const dimension = expectedDimension || (obj.dimension as ReviewDimension);

        // 限制 confidence 在 0-1 范围
        let confidence = typeof obj.confidence === 'number' ? obj.confidence : 0.5;
        confidence = Math.max(0, Math.min(1, confidence));

        const issue: ReviewIssue = {
          file: obj.file as string,
          line: obj.line as number,
          severity,
          dimension,
          description: obj.description as string,
          suggestion: obj.suggestion as string,
          confidence,
        };

        // 可选字段
        if (typeof obj.endLine === 'number' && obj.endLine > 0) {
          issue.endLine = obj.endLine;
        }
        if (typeof obj.codeSnippet === 'string') {
          issue.codeSnippet = obj.codeSnippet;
        }
        if (typeof obj.foundBy === 'string') {
          issue.foundBy = obj.foundBy;
        }

        return issue;
      });
  }

  /**
   * 格式化输出为 JSON
   */
  protected formatIssuesAsJson(issues: ReviewIssue[]): string {
    return JSON.stringify(issues, null, 2);
  }
}
