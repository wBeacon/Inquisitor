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
  MetaReviewReport,
  MetaReviewResult,
  AgentFailureInfo,
} from '../types';
import {
  LogicAgent,
  SecurityAgent,
  PerformanceAgent,
  MaintainabilityAgent,
  EdgeCaseAgent,
  AdversaryAgent,
  IssueCalibrator,
  MetaReviewerAgent,
} from '../agents';
import { OrchestratorConfig, ResolvedOrchestratorConfig, resolveConfig, VALID_SEVERITY_THRESHOLDS } from './config';
import { ParallelScheduler, ScheduledTask } from './parallel-scheduler';
import { ResultMerger } from './result-merger';
import { LLMProvider, createProvider } from '../providers';
import { ProjectContextCollector } from '../input';

/**
 * 各阶段耗时记录
 */
export interface StageTimings {
  input: number;
  dimensionReview: number;
  adversaryReview: number;
  calibration: number;
  metaReview: number;
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
  /**
   * 标记为 incomplete 的维度 agentId 列表
   * @deprecated 信息量不足，只保留做历史兼容；请优先读 incompleteAgents（ReviewMetadata 上的基础字段）
   */
  incompleteDimensions: string[];
  /** 元审查结果（如果启用） */
  metaReviewResult?: MetaReviewReport;
}

/**
 * 编排器执行中间上下文
 */
interface OrchestrationContext {
  startTime: number;
  dimensionAgentResults: AgentResult[];
  adversaryResult?: AdversaryResult;
  /** 多轮对抗审查的各轮结果 */
  adversaryRoundResults: AdversaryResult[];
  metaReviewResult?: MetaReviewReport;
  stageTimings: StageTimings;
  /** 失败的维度 agentId 列表（兼容历史字段） */
  incompleteDimensions: string[];
  /** 所有失败 Agent 的完整信息（维度 + 对抗） */
  agentFailures: AgentFailureInfo[];
}

/**
 * ReviewOrchestrator - 代码审查流程编排器
 * 负责整个审查流程的协调：
 * 1. 准备审查上下文（prepareReviewContext）
 * 2. 并行执行维度审查（executeDimensionAgents）
 * 3. 执行对抗审查（executeAdversaryReview）
 * 4. 校准合并结果（calibrateResults）
 * 5. 执行元审查（executeMetaReview）
 * 6. 生成最终报告（generateReport）
 */
export class ReviewOrchestrator {
  private config: ResolvedOrchestratorConfig;
  private provider: LLMProvider;
  private calibrator: IssueCalibrator;
  private merger: ResultMerger;
  private dimensionAgents: Array<{
    agent: LogicAgent | SecurityAgent | PerformanceAgent | MaintainabilityAgent | EdgeCaseAgent;
    dimension: ReviewDimension;
  }>;
  private adversaryAgent: AdversaryAgent;
  private metaReviewerAgent?: MetaReviewerAgent;

  constructor(config?: OrchestratorConfig) {
    this.config = resolveConfig(config);
    this.provider = createProvider(this.config.provider);
    this.calibrator = new IssueCalibrator();
    this.merger = new ResultMerger();

    // 初始化所有维度 Agent，注入共享的 LLM Provider
    this.dimensionAgents = [
      { agent: new LogicAgent({ model: this.config.model }, undefined, this.provider), dimension: ReviewDimension.Logic },
      { agent: new SecurityAgent({ model: this.config.model }, undefined, this.provider), dimension: ReviewDimension.Security },
      { agent: new PerformanceAgent({ model: this.config.model }, undefined, this.provider), dimension: ReviewDimension.Performance },
      { agent: new MaintainabilityAgent({ model: this.config.model }, undefined, this.provider), dimension: ReviewDimension.Maintainability },
      { agent: new EdgeCaseAgent({ model: this.config.model }, undefined, this.provider), dimension: ReviewDimension.EdgeCases },
    ];

    this.adversaryAgent = new AdversaryAgent({ model: this.config.model }, this.provider);

    // enableMetaReview=false 时不创建 MetaReviewerAgent 实例，不执行 LLM 调用
    if (this.config.enableMetaReview) {
      this.metaReviewerAgent = new MetaReviewerAgent({ model: this.config.model }, this.provider);
    }
  }

  /**
   * 执行完整的代码审查流程
   */
  async run(request: ReviewRequest): Promise<ReviewReport> {
    const context: OrchestrationContext = {
      startTime: Date.now(),
      dimensionAgentResults: [],
      adversaryRoundResults: [],
      stageTimings: {
        input: 0,
        dimensionReview: 0,
        adversaryReview: 0,
        calibration: 0,
        metaReview: 0,
        reportGeneration: 0,
      },
      incompleteDimensions: [],
      agentFailures: [],
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

    // 根据 severityThreshold 过滤低于阈值的问题
    let filteredIssues = this.filterBySeverityThreshold(finalIssues);

    // 阶段 5: 元审查（可选）- enableMetaReview=false 时跳过
    if (this.config.enableMetaReview) {
      const metaStageStart = Date.now();
      try {
        const report = this.generateReport(filteredIssues, context);
        // agentId 为 'meta-reviewer'，由 MetaReviewerAgent 执行 LLM 调用
        context.metaReviewResult = await this.executeMetaReview(report, files, contextString);
        context.stageTimings.metaReview = Date.now() - metaStageStart;

        // 根据 dismissedIssueIndices 移除被终审驳回的 issues
        if (context.metaReviewResult?.verdict?.dismissedIssueIndices?.length) {
          const dismissedSet = new Set(
            context.metaReviewResult.verdict.dismissedIssueIndices.filter(
              (idx: number) => idx >= 0 && idx < filteredIssues.length
            )
          );
          filteredIssues = filteredIssues.filter((_, idx) => !dismissedSet.has(idx));
        }
      } catch (error) {
        // 元审查失败不应该中断整个流程
        console.warn(`Stage [metaReview] failed: ${error instanceof Error ? error.message : String(error)}`);
        context.stageTimings.metaReview = Date.now() - metaStageStart;
      }
    }

    // 阶段 6: 生成报告
    try {
      const stageStart = Date.now();
      const report = this.generateReport(filteredIssues, context);
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

    // 采集项目级上下文（如 eslint/tsconfig/editorconfig 等配置文件）
    if (request.context?.projectRoot) {
      try {
        const projectContextCollector = new ProjectContextCollector();
        const projectContext = projectContextCollector.collect(request.context.projectRoot);
        const serialized = ProjectContextCollector.serialize(projectContext);
        if (serialized) {
          contextParts.push(serialized);
        }
      } catch (error) {
        // 采集失败不中断审查流程，但必须记录，否则调用方会误以为上下文被包含
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[orchestrator] 项目上下文采集失败，本次审查不包含项目配置: ${msg}`);
      }
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

    // 空数组视为"不过滤"而非"全部跳过"，后者会让审查静默跑空却报告 0 问题，
    // 让用户误以为代码没问题。
    if (request.dimensions && request.dimensions.length > 0) {
      agentsToRun = agentsToRun.filter((a) => request.dimensions!.includes(a.dimension));
    } else if (request.dimensions) {
      console.warn('[orchestrator] request.dimensions 传入空数组，视为不过滤（默认启用所有维度）');
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
    // 同时写入 agentFailures（带 error/durationMs 的完整信息），供报告层展示
    for (const result of results) {
      orchestrationContext.dimensionAgentResults.push(result);
      if (!result.success) {
        orchestrationContext.incompleteDimensions.push(result.agentId);
        orchestrationContext.agentFailures.push({
          agentId: result.agentId,
          error: result.error ?? 'unknown error',
          durationMs: result.durationMs,
        });
      }
    }
  }

  /**
   * 执行多轮迭代对抗审查
   * 三重收敛条件：
   * 1. 达到 maxAdversaryRounds 上限
   * 2. 某轮未发现新 issues 且无新 false_positive 标记
   * 3. API 调用失败（该轮结果丢弃，使用前几轮累积结果）
   */
  async executeAdversaryReview(
    files: string[],
    contextString: string,
    orchestrationContext: OrchestrationContext
  ): Promise<void> {
    const baseIssues = this.merger.collectIssues(orchestrationContext.dimensionAgentResults);
    const maxRounds = this.config.maxAdversaryRounds;

    // 累积的前轮新发现
    let accumulatedNewIssues: ReviewIssue[] = [];

    for (let round = 1; round <= maxRounds; round++) {
      // 每轮传给 challenge 的 existingIssues = 原始维度 issues + 前轮累积的 newIssues
      const existingIssues = [...baseIssues, ...accumulatedNewIssues];

      const result = await this.adversaryAgent.challenge(files, contextString, existingIssues);

      // 覆盖 agentId 为带轮次的标识，用于 token 统计
      // 当 maxRounds=1 时保持原始 agentId（向后兼容）
      if (maxRounds > 1) {
        result.agentId = `adversary-agent-round-${round}`;
      }

      orchestrationContext.adversaryRoundResults.push(result);

      // 收敛条件 3: API 调用失败，终止循环
      // 同时把该失败 round 记入 agentFailures，避免对抗失败被静默吞掉
      if (!result.success) {
        orchestrationContext.agentFailures.push({
          agentId: result.agentId,
          error: result.error ?? 'unknown error',
          durationMs: result.durationMs,
        });
        break;
      }

      // 累积本轮新发现的 issues
      accumulatedNewIssues = [...accumulatedNewIssues, ...result.issues];

      // 收敛条件 2: 本轮无新发现且无新 false_positive
      const hasNewIssues = result.issues.length > 0;
      const hasFalsePositives = result.falsePositives.length > 0;
      if (!hasNewIssues && !hasFalsePositives) {
        break;
      }
    }

    // 合并多轮结果为单个 AdversaryResult，供 calibrateResults 使用
    orchestrationContext.adversaryResult = this.mergeAdversaryRoundResults(
      orchestrationContext.adversaryRoundResults,
      baseIssues.length
    );
  }

  /**
   * 将多轮对抗审查结果合并为单个 AdversaryResult
   * 合并策略：
   * - issues: 所有轮次的新发现合并
   * - falsePositives: 所有轮次的 falsePositive 标记合并（去重）
   * - confidenceAdjustments: 后轮覆盖前轮的相同 issueIndex 调整
   * - judgments: 后轮覆盖前轮的相同 existingIssueIndex 判断
   * - tokenUsage: 所有轮次累加
   */
  private mergeAdversaryRoundResults(
    roundResults: AdversaryResult[],
    baseIssueCount: number
  ): AdversaryResult {
    if (roundResults.length === 0) {
      // 无结果时返回空的失败结果
      return {
        agentId: 'adversary-agent',
        issues: [],
        durationMs: 0,
        tokenUsage: { input: 0, output: 0, total: 0 },
        success: false,
        error: 'No adversary rounds executed',
        falsePositives: [],
        confidenceAdjustments: [],
      };
    }

    // 单轮时直接返回（向后兼容）
    if (roundResults.length === 1) {
      return roundResults[0];
    }

    // 合并所有新发现的 issues
    const allNewIssues: ReviewIssue[] = [];
    // 用 Map 确保 falsePositives 去重
    const falsePositiveSet = new Set<number>();
    // 后轮覆盖前轮的 confidenceAdjustments
    const confidenceMap = new Map<number, { issueIndex: number; newConfidence: number; reason: string }>();
    // 后轮覆盖前轮的 judgments（仅针对原始 baseIssueCount 范围内的索引）
    const judgmentMap = new Map<number, import('../types').IssueJudgment>();
    // 累计 token 和耗时
    let totalInput = 0;
    let totalOutput = 0;
    let totalDuration = 0;
    let anySuccess = false;

    for (const result of roundResults) {
      if (result.success) {
        anySuccess = true;
      }

      allNewIssues.push(...result.issues);
      totalInput += result.tokenUsage.input;
      totalOutput += result.tokenUsage.output;
      totalDuration += result.durationMs;

      // 注意: 每轮的 falsePositives 索引是相对于该轮 existingIssues 的
      // 只有指向原始 baseIssues 范围内的索引才是有效的 falsePositive
      for (const idx of result.falsePositives) {
        if (idx < baseIssueCount) {
          falsePositiveSet.add(idx);
        }
      }

      for (const adj of result.confidenceAdjustments) {
        if (adj.issueIndex < baseIssueCount) {
          confidenceMap.set(adj.issueIndex, adj);
        }
      }

      if (result.judgments) {
        for (const j of result.judgments) {
          if (j.existingIssueIndex < baseIssueCount) {
            judgmentMap.set(j.existingIssueIndex, j);
          }
        }
      }
    }

    return {
      agentId: 'adversary-agent',
      issues: allNewIssues,
      durationMs: totalDuration,
      tokenUsage: {
        input: totalInput,
        output: totalOutput,
        total: totalInput + totalOutput,
      },
      success: anySuccess,
      falsePositives: Array.from(falsePositiveSet),
      confidenceAdjustments: Array.from(confidenceMap.values()),
      judgments: Array.from(judgmentMap.values()),
    };
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
   * 根据 severityThreshold 过滤低于阈值的问题
   * severity 优先级: critical > high > medium > low
   * 例如 threshold='high' 时，仅保留 critical 和 high
   */
  filterBySeverityThreshold(issues: ReviewIssue[]): ReviewIssue[] {
    const threshold = this.config.severityThreshold;
    if (!threshold) {
      return issues;
    }

    // severity 优先级映射（数值越大优先级越高）
    const severityOrder: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    const thresholdLevel = severityOrder[threshold];
    if (thresholdLevel === undefined) {
      return issues;
    }

    return issues.filter((issue) => {
      const issueLevel = severityOrder[issue.severity] ?? 0;
      return issueLevel >= thresholdLevel;
    });
  }

  /**
   * 执行元审查（可选）
   * 从整体视角评估审查报告的质量
   */
  async executeMetaReview(
    report: ReviewReport,
    files: string[],
    contextString: string
  ): Promise<MetaReviewReport> {
    return this.metaReviewerAgent!.analyze(report, files, contextString);
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
      [ReviewDimension.AdversaryFound]: 0,
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

    // 收集所有 Agent 结果（维度 Agent + 对抗各轮结果）
    const allResults: AgentResult[] = [...context.dimensionAgentResults];

    // 多轮对抗时，各轮独立记录 token（agentId 已带轮次后缀）
    if (context.adversaryRoundResults) {
      for (const roundResult of context.adversaryRoundResults) {
        allResults.push(roundResult);
      }
    }

    // 如果有元审查结果，也添加到统计中
    if (context.metaReviewResult) {
      allResults.push(context.metaReviewResult);
    }

    // Per-agent token 使用
    const agentTokenUsage = this.merger.aggregateTokenUsage(allResults);
    // 总 token 使用
    const tokenUsage = this.merger.totalTokenUsage(allResults);

    // Agent ID 列表
    const agents = allResults.map((r) => r.agentId);

    const metadata: ExtendedReviewMetadata = {
      durationMs,
      tokenUsage,
      startedAt: new Date(context.startTime).toISOString(),
      completedAt: new Date(endTime).toISOString(),
      agents,
      stages: { ...context.stageTimings },
      agentTokenUsage,
      incompleteDimensions: [...context.incompleteDimensions],
      // 基础类型 ReviewMetadata 上的字段；仅在存在失败时写入，便于消费方以 ?.length 判断
      // 使用可选链兼容历史测试里 `as any` 强转但未传 agentFailures 的 context
      incompleteAgents:
        (context.agentFailures?.length ?? 0) > 0
          ? context.agentFailures.map((f) => ({ ...f }))
          : undefined,
      metaReviewResult: context.metaReviewResult,
    };

    return metadata;
  }

  /**
   * 获取配置
   */
  getConfig(): ResolvedOrchestratorConfig {
    return { ...this.config };
  }
}
