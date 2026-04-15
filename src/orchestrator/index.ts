/**
 * 编排器模块 - 协调完整的代码审查流程
 *
 * 核心类：
 * - ReviewOrchestrator: 主编排器，负责流程协调
 * - ParallelScheduler: 并行任务调度器
 * - ResultMerger: 结果合并去重器
 *
 * 使用方式：
 * ```typescript
 * const orchestrator = new ReviewOrchestrator({ enableAdversary: true });
 * const report = await orchestrator.run(reviewRequest);
 * ```
 */

// 主编排器（新实现，从 orchestrator.ts 导出）
export { ReviewOrchestrator, StageTimings, ExtendedReviewMetadata } from './orchestrator';

// 配置模块
export {
  OrchestratorConfig,
  ResolvedOrchestratorConfig,
  resolveConfig,
  DEFAULT_MODEL,
  DEFAULT_MAX_PARALLEL,
  DEFAULT_AGENT_TIMEOUT,
  DEFAULT_TOTAL_TIMEOUT,
  DEFAULT_ENABLE_ADVERSARY,
  DEFAULT_ENABLE_CACHE,
  DEFAULT_SKIP_DIMENSIONS,
} from './config';

// 并行调度器
export { ParallelScheduler, ScheduledTask, ParallelSchedulerConfig } from './parallel-scheduler';

// 结果合并器
export { ResultMerger, MergerConfig } from './result-merger';
