/**
 * Inquisitor - 高强度代码审查引擎
 *
 * 统一入口，导出所有公共 API。
 */

// 类型系统
export {
  ReviewDimension,
  ReviewIssue,
  ReviewReport,
  ReviewRequest,
  ReviewSummary,
  ReviewMetadata,
  Severity,
  SeverityCount,
  TokenUsage,
  FileToReview,
  ContextConfig,
} from './types';

export {
  AgentConfig,
  AgentResult,
  DimensionAgent,
  AdversaryAgent as AdversaryAgentInterface,
  Orchestrator,
  AdversaryResult,
} from './types';

// 输入采集层
export { GitDiffCollector, FileCollector, ContextEnricher } from './input';

// Agent 系统
export {
  AgentRunner,
  LogicAgent,
  SecurityAgent,
  PerformanceAgent,
  MaintainabilityAgent,
  EdgeCaseAgent,
  AdversaryAgent,
  IssueCalibrator,
} from './agents';

// 编排器
export { ReviewOrchestrator, OrchestratorConfig } from './orchestrator';

// 输出层
export { ReportGenerator, JsonReporter, MarkdownReporter, SummaryGenerator } from './output';

// Skill 集成
export { ReviewSkill, SkillParams, SkillResult } from './skill';
export { parseReviewArgs, ReviewCommandArgs } from './skill/review-command';
export { loadConfig, InquisitorConfig } from './skill/config-loader';
export { ProgressReporter, ReviewPhase, ProgressCallback } from './skill/progress-reporter';
