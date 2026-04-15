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
  TokenUsage,
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
import { OrchestratorConfig, ResolvedOrchestratorConfig, resolveConfig } from './config';
import { ParallelScheduler, ScheduledTask } from './parallel-scheduler';
import { ResultMerger } from './result-merger';

/**
 * 各阶段耗时记录
 */
export interface StageTimings {
  input: number;
  dimensionReview: number;
  adversaryReview: number;
  calibration: number;
  reportGeneration: number;
}

/**
 * 扩展的报告元数据，包含各阶段耗时和 per-agent token 统计
 */
export interface ExtendedReviewMetadata extends ReviewMetadata {
  /** 各阶段独立耗时（毫秒） */
  stages: StageTimings;
  /** 各 Agent 独立的 token 消耗 */
  agentTokenUsage: Record<string, TokenUsage>;
  /** 标记为 incomplete 的维度（超时或失败） */
  incompleteDimensions: string[];
}

/**
 * 编排器执行中间上下文
 */
interface OrchestrationContext {
  startTime: number;
  dimensionAgentResults: AgentResult[];
  adversaryResult?: AdversaryResult;
  stageTimings: StageTimings;
  incompleteDimensions: string[];
}

/**
 * ReviewOrchestrator - 代码审查流程编排器
 * 负责整个审查流程的协调：
 * 1. 准备审查上下文（prepareReviewContext）
 * 2. 并行执行维度审查（executeDimensionAgents）
 * 3. 执行对抗审查（executeAdversaryReview）
 * 4. 校准合并结果（calibrateResults）
 * 5. 生成最终报告（generateReport）
 */
export class ReviewOrchestrator {
  private config: ResolvedOrchestratorConfig;
  private calibrator: IssueCalibrator;
  private merger: ResultMerger;
  private dimensionAgents: Array<{
    agent: LogicAgent | SecurityAgent | PerformanceAgent | MaintainabilityAgent | EdgeCaseAgent;
    dimension: ReviewDimension;
  }>;
  private adversaryAgent: AdversaryAgent;

  constructor(config?: OrchestratorConfig) {
    this.config = resolveConfig(config);
    this.calibrator = new IssueCalibrator();
    this.merger = new ResultMerger();

    // 初始化所有维度 Agent
    this.dimensionAgents = [
      { agent: new LogicAgent({ model: this.config.model }), dimension: ReviewDimension.Logic },
      { agent: new SecurityAgent({ model: this.config.model }), dimension: ReviewDimension.Security },
      { agent: new PerformanceAgent({ model: this.config.model }), dimension: ReviewDimension.Performance },
      { agent: new MaintainabilityAgent({ model: this.config.model }), dimension: ReviewDimension.Maintainability },
      { agent: new EdgeCaseAgent({ model: this.config.model }), dimension: ReviewDimension.EdgeCases },
    ];

    this.adversaryAgent = new AdversaryAgent({ model: this.config.model });
  }

  /**
   * 执行完整的代码审查流程
   */
  async run(request: ReviewRequest): Promise<ReviewReport> {
    const context: OrchestrationContext = {
      startTime: Date.now(),
      dimensionAgentResults: [],
      stageTimings: {
        input: 0,
        dimensionReview: 0,
        adversaryReview: 0,
        calibration: 0,
        reportGeneration: 0,
      },
      incompleteDimensions: [],
    };

    // 阶段 1: 输入采集
    let files: string[];
    let contextString: string;
    try {
      const stageStart = Date.now();
      const prepared = await this.prepareReviewContext(request);
      files = prepared.files;
      contextString = prepared.contextString;
      context.stageTimings.input = Date.now() - stageStart;
    } catch (error) {
      throw new Error(`Stage [input] failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 阶段 2: 并行维度审查
    try {
      const stageStart = Date.now();
      await this.executeDimensionAgents(files, contextString, request, context);
      context.stageTimings.dimensionReview = Date.now() - stageStart;
    } catch (error) {
      throw new Error(`Stage [dimensionReview] failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 阶段 3: 对抗审查（可选）
    if (this.config.enableAdversary) {
      try {
        const stageStart = Date.now();
        await this.executeAdversaryReview(files, contextString, context);
        context.stageTimings.adversaryReview = Date.now() - stageStart;
      } catch (error) {
        throw new Error(`Stage [adversaryReview] failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 阶段 4: 结果校准
    let finalIssues: ReviewIssue[];
    try {
      const stageStart = Date.now();
      finalIssues = await this.calibrateResults(context);
      context.stageTimings.calibration = Date.now() - stageStart;
    } catch (error) {
      throw new Error(`Stage [calibration] failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 阶段 5: 生成报告
    try {
      const stageStart = Date.now();
      const report = this.generateReport(finalIssues, context);
      context.stageTimings.reportGeneration = Date.now() - stageStart;
      // 更新报告中的 reportGeneration 时间
      (report.metadata as ExtendedReviewMetadata).stages.reportGeneration = context.stageTimings.reportGeneration;
      return report;
    } catch (error) {
      throw new Error(`Stage [reportGeneration] failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 准备审查所需的文件列表和上下文
   */
  async prepareReviewContext(
    request: ReviewRequest
  ): Promise<{ files: string[]; contextString: string }> {
    const files = request.files.map((f) => f.path);
    const contextParts: string[] = [];

    for (const file of request.files) {
      if (file.content) {
        contextParts.push(`\n--- File: ${file.path} ---\n${file.content}`);
      }
      if (file.diff) {
        contextParts.push(`\n--- Diff: ${file.path} ---\n${file.diff}`);
      }
    }

    if (request.diff) {
      contextParts.push(`\n--- Global Diff ---\n${request.diff}`);
    }

    return { files, contextString: contextParts.join('\n') };
  }

  /**
   * 并行执行所有维度的审查 Agent
   * 支持 skipDimensions 和 request.dimensions 过滤
   * 超时的 Agent 返回 success:false，标记该维度为 incomplete
   */
  async executeDimensionAgents(
    files: string[],
    contextString: string,
    request: ReviewRequest,
    orchestrationContext: OrchestrationContext
  ): Promise<void> {
    // 根据 skipDimensions 和 request.dimensions 过滤
    const skipSet = new Set(this.config.skipDimensions);
    let agentsToRun = this.dimensionAgents.filter((a) => !skipSet.has(a.dimension));

    if (request.dimensions) {
      agentsToRun = agentsToRun.filter((a) => request.dimensions!.includes(a.dimension));
    }

    // 构建调度任务
    const tasks: ScheduledTask<AgentResult>[] = agentsToRun.map((item) => ({
      id: item.agent.getId(),
      execute: () => item.agent.review(files, contextString),
    }));

    // 使用 ParallelScheduler 执行
    const scheduler = new ParallelScheduler({
      maxParallel: this.config.maxParallel,
      taskTimeout: this.config.agentTimeout,
    });

    const results = await scheduler.executeAll(tasks);

    // 检查失败/超时的 Agent，标记为 incomplete
    for (const result of results) {
      orchestrationContext.dimensionAgentResults.push(result);
      if (!result.success) {
        orchestrationContext.incompleteDimensions.push(result.agentId);
      }
    }
  }

  /**
   * 执行对抗审查
   */
  async executeAdversaryReview(
    files: string[],
    contextString: string,
    orchestrationContext: OrchestrationContext
  ): Promise<void> {
    const existingIssues = this.merger.collectIssues(orchestrationContext.dimensionAgentResults);

    // 使用 ParallelScheduler 执行（单任务），以获得超时保护
    const scheduler = new ParallelScheduler({
      maxParallel: 1,
      taskTimeout: this.config.agentTimeout,
    });

    const tasks: ScheduledTask<AgentResult>[] = [{
      id: this.adversaryAgent.getId(),
      execute: () => this.adversaryAgent.challenge(files, contextString, existingIssues),
    }];

    const results = await scheduler.executeAll(tasks);

    if (results.length > 0) {
      orchestrationContext.adversaryResult = results[0] as AdversaryResult;
    }
  }

  /**
   * 校准和合并结果
   */
  async calibrateResults(context: OrchestrationContext): Promise<ReviewIssue[]> {
    const allIssues = this.merger.collectIssues(context.dimensionAgentResults);

    if (context.adversaryResult && context.adversaryResult.success) {
      return this.calibrator.calibrate(allIssues, context.adversaryResult);
    }

    // 无对抗结果时仅去重排序
    return this.merger.sort(this.merger.dedup(allIssues));
  }

  /**
   * 生成最终报告
   */
  generateReport(issues: ReviewIssue[], context: OrchestrationContext): ReviewReport {
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
    const bySeverity: SeverityCount = { critical: 0, high: 0, medium: 0, low: 0 };
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

    return { bySeverity, byDimension, totalIssues: issues.length };
  }

  /**
   * 生成扩展元数据：含各阶段耗时和 per-agent token 统计
   */
  private generateMetadata(context: OrchestrationContext): ExtendedReviewMetadata {
    const endTime = Date.now();
    const durationMs = endTime - context.startTime;

    // 收集所有 Agent 结果（包括对抗 Agent）
    const allResults: AgentResult[] = [...context.dimensionAgentResults];
    if (context.adversaryResult) {
      allResults.push(context.adversaryResult);
    }

    // Per-agent token 使用
    const agentTokenUsage = this.merger.aggregateTokenUsage(allResults);
    // 总 token 使用
    const tokenUsage = this.merger.totalTokenUsage(allResults);

    // Agent ID 列表
    const agents = allResults.map((r) => r.agentId);

    return {
      durationMs,
      tokenUsage,
      startedAt: new Date(context.startTime).toISOString(),
      completedAt: new Date(endTime).toISOString(),
      agents,
      stages: { ...context.stageTimings },
      agentTokenUsage,
      incompleteDimensions: [...context.incompleteDimensions],
    };
  }

  /**
   * 获取配置
   */
  getConfig(): ResolvedOrchestratorConfig {
    return { ...this.config };
  }
}
