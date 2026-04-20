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
  TokenMetrics,
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
export {
  ReportGenerator,
  JsonReporter,
  MarkdownReporter,
  SummaryGenerator,
  DashboardReporter,
  DashboardData,
  DashboardMetrics,
  DashboardQualityMetrics,
  DashboardPerformanceMetrics,
  DashboardMetadata,
  generateDashboard,
} from './output';

// Skill 集成
export { ReviewSkill, SkillParams, SkillResult } from './skill';
export { parseReviewArgs, ReviewCommandArgs } from './skill/review-command';
export { loadConfig, InquisitorConfig } from './skill/config-loader';
export { ProgressReporter, ReviewPhase, ProgressCallback } from './skill/progress-reporter';

// LLM Provider
export {
  LLMProvider,
  LLMChatRequest,
  LLMChatResponse,
  ProviderConfig,
  ProviderType,
  AnthropicProvider,
  createProvider,
} from './providers';

// Agent 适配器层
export {
  InquisitorAgent,
  InquisitorAgentConfig,
  InquisitorInput,
  InquisitorOutput,
  AgentSchema,
} from './agent-adapter';

export {
  mergeAgentConfig,
  MergedConfigValidation,
} from './agent-adapter/config-merger';

export {
  ExternalOrchestrator,
  ExternalOrchestratorConfig,
} from './agent-adapter/external-orchestrator';

// 历史追踪与对比
export { ReviewHistory } from './storage';
export {
  HistoryRecord,
  HistoryRecordSummary,
  HistoryFilter,
  HistoryMetadata,
  ReviewHistoryOptions,
  ComparisonResult,
  TrendResult,
  TrendDataPoint,
  EfficiencyMetrics,
  QualityGrade,
} from './types';

export { compareReports, computeTrend, computeEfficiencyMetrics } from './utils/comparison-util';

// 工具库 - Token 管理
export {
  TokenCounter,
  countTokens,
  countPromptTokens,
  estimateOutputTokens,
  type TokenCount,
  type PromptTokenCount,
} from './utils/token-counter';

export {
  TokenEstimator,
  estimate,
  validateTokens,
  KNOWN_CONTEXT_WINDOWS,
  DEFAULT_CONTEXT_WINDOW,
  type TokenEstimate,
  type ContextWindow,
  type TokenStatus,
} from './utils/token-estimator';

// 工具库 - Prompt 优化
export {
  PromptOptimizer,
  optimizePrompt,
  compareOptimizationLevels,
  type OptimizationLevel,
  type PromptComponent,
  type CompressionStrategy,
  type OptimizationResult,
} from './utils/prompt-optimizer';
