import { AgentConfig, AgentResult, ReviewIssue, ReviewDimension, TokenMetrics } from '../types';
import { LLMProvider, createProvider } from '../providers';
import { TokenEstimator } from '../utils/token-estimator';
import { PromptOptimizer } from './prompts/prompt-optimizer';

/**
 * AgentRunner - 执行代码审查 Agent 的基础类
 * 通过 LLMProvider 调用 LLM API，每个 Agent 在独立上下文中运行
 * 不共享任何可变状态，每次 review 创建独立的 API session
 */
export abstract class AgentRunner {
  protected readonly config: AgentConfig;
  protected readonly timeout: number;
  /** LLM Provider 实例，延迟初始化以保持向后兼容 */
  private _provider?: LLMProvider;

  constructor(config: AgentConfig, timeout: number = 300000, provider?: LLMProvider) {
    // 5分钟默认超时
    this.config = { ...config }; // 深拷贝配置，确保隔离
    this.timeout = timeout;
    this._provider = provider;
  }

  /**
   * 获取 LLM Provider（延迟创建，默认使用 Anthropic）
   */
  protected getProvider(): LLMProvider {
    if (!this._provider) {
      this._provider = createProvider();
    }
    return this._provider;
  }

  /**
   * 执行审查
   * @param files 要审查的文件路径列表
   * @param context 审查上下文（包含代码内容等）
   * @returns 审查结果
   */
  async review(files: string[], context: string): Promise<AgentResult> {
    const startTime = Date.now();
    let timerId: ReturnType<typeof setTimeout> | undefined;

    try {
      // 使用 Promise.race 实现超时控制
      const reviewPromise = this.performReview(files, context);
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timerId = setTimeout(() => reject(new Error(`Agent ${this.config.id} timeout after ${this.timeout}ms`)), this.timeout);
      });

      const issues = await Promise.race([reviewPromise, timeoutPromise]);
      const durationMs = Date.now() - startTime;

      return {
        agentId: this.config.id,
        issues,
        durationMs,
        tokenUsage: {
          // 由 callLLM 设置的实际值
          input: this._lastTokenUsage.input,
          output: this._lastTokenUsage.output,
          total: this._lastTokenUsage.total,
        },
        tokenMetrics: this._tokenMetrics,
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
        tokenMetrics: this._tokenMetrics,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // 无论成功或失败，都清除超时定时器，防止 Timer 泄漏
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
    }
  }

  // 每次 review 调用的 token 使用量，由 callLLM 更新
  // 初始化为空使用量，实际值由 API 响应填充
  protected _lastTokenUsage: { input: number; output: number; total: number } =
    this.createEmptyTokenUsage();

  // 详细的 token 度量信息（可选）
  protected _tokenMetrics?: TokenMetrics;

  // 预 API 估计值（用于计算效率指标）
  protected _preApiEstimate?: ReturnType<TokenEstimator['estimate']>;

  protected createEmptyTokenUsage(): { input: number; output: number; total: number } {
    const empty = 0;
    return { input: empty, output: empty, total: empty };
  }

  /** 静态共享的 PromptOptimizer 和 TokenEstimator 实例，避免重复初始化 */
  private static _sharedOptimizer?: PromptOptimizer;
  private static _sharedEstimator?: TokenEstimator;

  private static getOptimizer(): PromptOptimizer {
    if (!AgentRunner._sharedOptimizer) {
      AgentRunner._sharedOptimizer = new PromptOptimizer();
    }
    return AgentRunner._sharedOptimizer;
  }

  private static getEstimator(): TokenEstimator {
    if (!AgentRunner._sharedEstimator) {
      AgentRunner._sharedEstimator = new TokenEstimator();
    }
    return AgentRunner._sharedEstimator;
  }

  /**
   * 调用 LLM API 执行审查（Provider 无关）
   * 通过注入的 LLMProvider 发送请求，自动追踪 token 用量
   */
  protected async callLLM(userMessage: string): Promise<string> {
    const provider = this.getProvider();
    const model = this.config.model || provider.defaultModel;
    const maxTokens = this.config.maxTokens || 4000;

    // PRE-API: PromptOptimizer 自动优化（压缩 + 截断）
    const optimizer = AgentRunner.getOptimizer();
    const optimized = optimizer.optimize(
      this.config.systemPrompt,
      userMessage,
      model,
      maxTokens,
    );

    // 使用优化后的 prompt
    const effectiveSystemPrompt = optimized.systemPrompt;
    const effectiveUserMessage = optimized.userMessage;

    if (optimized.wasCompressed || optimized.wasTruncated) {
      console.info(
        `[${this.config.id}] Prompt optimized: ` +
        `${optimized.originalTokens} -> ${optimized.optimizedTokens} tokens ` +
        `(${optimized.compressionPercentage.toFixed(1)}% reduction, ` +
        `strategies: ${optimized.strategiesApplied.join(', ')})`
      );
    }

    // PRE-API: 估计 token 使用量
    const estimator = AgentRunner.getEstimator();
    const estimate = estimator.estimate(
      effectiveSystemPrompt,
      effectiveUserMessage,
      maxTokens,
      model
    );

    // 记录估计结果
    if (estimate.status === 'error') {
      const message = `Token estimation error: ${estimate.statusMessage}`;
      console.error(`[${this.config.id}] ${message}`);
      throw new Error(message);
    } else if (estimate.status === 'warning') {
      console.warn(`[${this.config.id}] Token warning: ${estimate.statusMessage}`);
    } else {
      console.info(`[${this.config.id}] Token estimate: ${estimator.summarize(estimate)}`);
    }

    // 保存预 API 估计
    this._preApiEstimate = estimate;

    // API 调用
    const response = await provider.chat({
      model,
      systemPrompt: effectiveSystemPrompt,
      userMessage: effectiveUserMessage,
      maxTokens,
      temperature: this.config.temperature || 0.5,
    });

    // 追踪 token 使用量
    this._lastTokenUsage = { ...response.tokenUsage };

    // POST-API: 计算实际 vs 估计的效率指标
    if (this._preApiEstimate) {
      this._tokenMetrics = {
        estimatedInputTokens: this._preApiEstimate.totalInputTokens,
        estimatedOutputTokens: this._preApiEstimate.estimatedOutputTokens,
        estimatedTotalTokens: this._preApiEstimate.estimatedTotalTokens,

        actualInputTokens: response.tokenUsage.input,
        actualOutputTokens: response.tokenUsage.output,
        actualTotalTokens: response.tokenUsage.total,

        efficiency: {
          inputAccuracy:
            this._preApiEstimate.totalInputTokens > 0
              ? response.tokenUsage.input / this._preApiEstimate.totalInputTokens
              : 1.0,
          outputAccuracy:
            this._preApiEstimate.estimatedOutputTokens > 0
              ? response.tokenUsage.output / this._preApiEstimate.estimatedOutputTokens
              : 1.0,
          totalAccuracy:
            this._preApiEstimate.estimatedTotalTokens > 0
              ? response.tokenUsage.total / this._preApiEstimate.estimatedTotalTokens
              : 1.0,
        },

        contextWindowSize: this._preApiEstimate.contextWindowSize,
        utilizationPercentage:
          (response.tokenUsage.input / this._preApiEstimate.contextWindowSize) * 100,

        preApiStatus: this._preApiEstimate.status,
        preApiMessage: this._preApiEstimate.statusMessage,
      };

      console.info(
        `[${this.config.id}] Token usage: ` +
          `actual ${response.tokenUsage.total}/${this._preApiEstimate.estimatedTotalTokens} ` +
          `(${(this._tokenMetrics.efficiency.totalAccuracy * 100).toFixed(0)}% accuracy)`
      );
    }

    return response.text;
  }

  /**
   * 调用 Claude API 执行审查
   * @deprecated 请使用 callLLM()。保留此方法以兼容现有子类。
   */
  protected async callClaudeAPI(userMessage: string): Promise<string> {
    return this.callLLM(userMessage);
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
   * JSON 文本预处理：处理 LLM 常见输出问题
   * 1. markdown code fence 包裹
   * 2. trailing comma
   * 3. 单引号替代双引号
   * 子类可复用此方法进行 JSON 解析前的文本清理
   */
  protected preprocessJsonText(rawText: string): string {
    let text = rawText.trim();

    // 移除 markdown code fence
    const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeFenceMatch) {
      text = codeFenceMatch[1].trim();
    }

    // 移除 trailing commas (对象和数组末尾的逗号)
    text = text.replace(/,\s*([\]}])/g, '$1');

    return text;
  }

  /**
   * 尝试解析 JSON 文本，包含单引号/无引号属性名的容错处理
   * 返回解析结果，解析失败返回 null
   */
  protected tryParseJson(text: string): unknown | null {
    try {
      return JSON.parse(text);
    } catch {
      // 尝试将单引号替换为双引号，修复属性名没有引号的情况
      try {
        const doubleQuoted = text
          .replace(/'/g, '"')
          .replace(/(\{|,)\s*(\w+)\s*:/g, '$1"$2":');
        return JSON.parse(doubleQuoted);
      } catch {
        return null;
      }
    }
  }

  /**
   * 健壮的 JSON 解析：处理 LLM 常见输出问题
   * 使用 preprocessJsonText 和 tryParseJson 进行预处理和容错解析
   */
  protected parseJsonResponse(rawText: string): ReviewIssue[] {
    let text = this.preprocessJsonText(rawText);

    // 尝试提取 JSON 数组（处理前后有多余文本的情况）
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      text = arrayMatch[0];
    }

    const parsed = this.tryParseJson(text);
    if (Array.isArray(parsed)) {
      return this.validateAndFixIssues(parsed);
    }
    return [];
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
