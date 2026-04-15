import {
  ReviewRequest,
  ReviewReport,
  ReviewDimension,
  ReviewIssue,
  ReviewSummary,
  SeverityCount,
  ReviewMetadata,
  AgentResult,
  AdversaryResult,
} from '../types';
import {
  LogicAgent,
  SecurityAgent,
  PerformanceAgent,
  MaintainabilityAgent,
  EdgeCaseAgent,
  AdversaryAgent,
  IssueCalibrator,
} from '../agents';

/**
 * 编排器配置 - 定义 Orchestrator 的运行参数
 */
export interface OrchestratorConfig {
  /** 使用的 AI 模型（如 claude-opus、claude-sonnet） */
  model?: string;
  /** 最大并行 Agent 数 */
  maxParallel?: number;
  /** 单个 Agent 超时时间（毫秒） */
  agentTimeout?: number;
  /** 总体超时时间（毫秒） */
  totalTimeout?: number;
  /** 是否启用对抗审查 */
  enableAdversary?: boolean;
  /** 是否启用缓存 */
  enableCache?: boolean;
}

/**
 * 编排器执行中间结果
 */
interface OrchestrationContext {
  startTime: number;
  dimensionAgentResults: AgentResult[];
  adversaryResult?: AdversaryResult;
}

/**
 * ReviewOrchestrator - 代码审查流程编排器
 * 负责整个审查流程的协调：
 * 1. 并行启动 5 个维度的 Agent 进行审查
 * 2. 收集所有维度的审查结果
 * 3. 启动对抗审查 Agent 进行二次审查
 * 4. 应用校准处理（去重、置信度调整、误报过滤）
 * 5. 生成最终报告
 */
export class ReviewOrchestrator {
  private config: Required<OrchestratorConfig>;
  private calibrator: IssueCalibrator;
  private dimensionAgents: Array<{
    agent: LogicAgent | SecurityAgent | PerformanceAgent | MaintainabilityAgent | EdgeCaseAgent;
    dimension: ReviewDimension;
  }>;
  private adversaryAgent: AdversaryAgent;

  constructor(config?: OrchestratorConfig) {
    this.config = {
      model: config?.model || 'claude-opus',
      maxParallel: config?.maxParallel || 5,
      agentTimeout: config?.agentTimeout || 120000, // 2 minutes
      totalTimeout: config?.totalTimeout || 600000, // 10 minutes
      enableAdversary: config?.enableAdversary !== false, // true by default
      enableCache: config?.enableCache || false,
    };

    this.calibrator = new IssueCalibrator();

    // Initialize dimension agents
    this.dimensionAgents = [
      { agent: new LogicAgent({ model: this.config.model }), dimension: ReviewDimension.Logic },
      {
        agent: new SecurityAgent({ model: this.config.model }),
        dimension: ReviewDimension.Security,
      },
      {
        agent: new PerformanceAgent({ model: this.config.model }),
        dimension: ReviewDimension.Performance,
      },
      {
        agent: new MaintainabilityAgent({ model: this.config.model }),
        dimension: ReviewDimension.Maintainability,
      },
      {
        agent: new EdgeCaseAgent({ model: this.config.model }),
        dimension: ReviewDimension.EdgeCases,
      },
    ];

    this.adversaryAgent = new AdversaryAgent({
      model: this.config.model,
    });
  }

  /**
   * 执行完整的代码审查流程
   */
  async run(request: ReviewRequest): Promise<ReviewReport> {
    const context: OrchestrationContext = {
      startTime: Date.now(),
      dimensionAgentResults: [],
    };

    try {
      // 步骤 1: 收集文件列表和上下文
      const { files, contextString } = await this.prepareReviewContext(request);

      // 步骤 2: 并行执行维度审查
      await this.executeDimensionAgents(files, contextString, request, context);

      // 步骤 3: 执行对抗审查
      if (this.config.enableAdversary) {
        await this.executeAdversaryReview(files, contextString, context);
      }

      // 步骤 4: 应用校准和去重
      const finalIssues = await this.calibrateResults(context);

      // 步骤 5: 生成报告
      const report = this.generateReport(finalIssues, context);

      return report;
    } catch (error) {
      throw new Error(`Orchestration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 准备审查所需的文件列表和上下文
   */
  private async prepareReviewContext(
    request: ReviewRequest
  ): Promise<{ files: string[]; contextString: string }> {
    const files = request.files.map((f) => f.path);

    // 构建上下文字符串：包含文件内容和 diff
    const contextParts: string[] = [];

    // 添加文件内容
    for (const file of request.files) {
      if (file.content) {
        contextParts.push(`\n--- File: ${file.path} ---\n${file.content}`);
      }
      if (file.diff) {
        contextParts.push(`\n--- Diff: ${file.path} ---\n${file.diff}`);
      }
    }

    // 添加全局 diff
    if (request.diff) {
      contextParts.push(`\n--- Global Diff ---\n${request.diff}`);
    }

    const contextString = contextParts.join('\n');
    return { files, contextString };
  }

  /**
   * 并行执行所有维度的审查 Agent
   */
  private async executeDimensionAgents(
    files: string[],
    contextString: string,
    request: ReviewRequest,
    orchestrationContext: OrchestrationContext
  ): Promise<void> {
    // 过滤要执行的维度（如果指定了特定维度）
    const agentsToRun = request.dimensions
      ? this.dimensionAgents.filter((a) => request.dimensions!.includes(a.dimension))
      : this.dimensionAgents;

    // 创建 Promise 数组
    const promises = agentsToRun.map((item) =>
      this.executeAgentWithTimeout(
        item.agent.review(files, contextString),
        item.dimension,
        this.config.agentTimeout
      )
    );

    // 并行执行所有 Agent
    const results = await Promise.all(promises);

    // 收集结果
    for (const result of results) {
      orchestrationContext.dimensionAgentResults.push(result);
    }
  }

  /**
   * 执行对抗审查
   */
  private async executeAdversaryReview(
    files: string[],
    contextString: string,
    orchestrationContext: OrchestrationContext
  ): Promise<void> {
    // 收集所有已有的问题
    const existingIssues: ReviewIssue[] = [];
    for (const result of orchestrationContext.dimensionAgentResults) {
      existingIssues.push(...result.issues);
    }

    // 执行对抗审查
    const adversaryResult = await this.executeAgentWithTimeout(
      this.adversaryAgent.challenge(files, contextString, existingIssues),
      'adversary',
      this.config.agentTimeout
    );

    orchestrationContext.adversaryResult = adversaryResult;
  }

  /**
   * 执行 Agent 并应用超时控制
   */
  private executeAgentWithTimeout<T>(
    promise: Promise<T>,
    agentId: string | ReviewDimension,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Agent ${agentId} timeout after ${timeout}ms`)),
          timeout
        )
      ),
    ]);
  }

  /**
   * 校准和合并结果
   */
  private async calibrateResults(context: OrchestrationContext): Promise<ReviewIssue[]> {
    // 收集所有维度 Agent 的问题
    const allIssues: ReviewIssue[] = [];
    for (const result of context.dimensionAgentResults) {
      allIssues.push(...result.issues);
    }

    // 如果有对抗审查结果，应用校准
    if (context.adversaryResult) {
      return this.calibrator.calibrate(allIssues, context.adversaryResult);
    }

    // 否则仅进行排序和去重
    return allIssues;
  }

  /**
   * 生成最终报告
   */
  private generateReport(issues: ReviewIssue[], context: OrchestrationContext): ReviewReport {
    const summary = this.generateSummary(issues);
    const metadata = this.generateMetadata(context);

    return {
      issues,
      summary,
      metadata,
    };
  }

  /**
   * 生成统计摘要
   */
  private generateSummary(issues: ReviewIssue[]): ReviewSummary {
    const bySeverity: SeverityCount = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    const byDimension: Record<ReviewDimension, number> = {
      [ReviewDimension.Logic]: 0,
      [ReviewDimension.Security]: 0,
      [ReviewDimension.Performance]: 0,
      [ReviewDimension.Maintainability]: 0,
      [ReviewDimension.EdgeCases]: 0,
    };

    for (const issue of issues) {
      bySeverity[issue.severity]++;
      byDimension[issue.dimension]++;
    }

    return {
      bySeverity,
      byDimension,
      totalIssues: issues.length,
    };
  }

  /**
   * 生成元数据
   */
  private generateMetadata(context: OrchestrationContext): ReviewMetadata {
    const endTime = Date.now();
    const durationMs = endTime - context.startTime;

    // 聚合所有 Agent 的 token 使用情况
    let totalTokenInput = 0;
    let totalTokenOutput = 0;

    for (const result of context.dimensionAgentResults) {
      totalTokenInput += result.tokenUsage.input;
      totalTokenOutput += result.tokenUsage.output;
    }

    if (context.adversaryResult) {
      totalTokenInput += context.adversaryResult.tokenUsage.input;
      totalTokenOutput += context.adversaryResult.tokenUsage.output;
    }

    // 收集参与审查的 Agent ID
    const agents = context.dimensionAgentResults.map((r) => r.agentId);
    if (context.adversaryResult) {
      agents.push(context.adversaryResult.agentId);
    }

    return {
      durationMs,
      tokenUsage: {
        input: totalTokenInput,
        output: totalTokenOutput,
        total: totalTokenInput + totalTokenOutput,
      },
      startedAt: new Date(context.startTime).toISOString(),
      completedAt: new Date(endTime).toISOString(),
      agents,
    };
  }

  /**
   * 获取配置
   */
  getConfig(): Required<OrchestratorConfig> {
    return this.config;
  }
}
