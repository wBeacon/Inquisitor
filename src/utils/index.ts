// Utility exports

// Language utilities
export { inferLanguage } from './language-util';

// Comparison utilities  
export { compareReports, computeTrend, computeEfficiencyMetrics } from './comparison-util';

// Token management utilities - TokenCounter
export { 
  TokenCounter, 
  countTokens, 
  countPromptTokens, 
  estimateOutputTokens,
  type TokenCount,
  type PromptTokenCount
} from './token-counter';

// Token management utilities - TokenEstimator
export { 
  TokenEstimator, 
  estimate, 
  validateTokens,
  KNOWN_CONTEXT_WINDOWS,
  DEFAULT_CONTEXT_WINDOW,
  type TokenEstimate,
  type TokenStatus,
  type ContextWindow
} from './token-estimator';

// Prompt optimization utilities
export {
  PromptOptimizer,
  optimizePrompt,
  compareOptimizationLevels,
  type OptimizationLevel,
  type PromptComponent,
  type CompressionStrategy,
  type OptimizationResult
} from './prompt-optimizer';

// Token budget management utilities
export {
  TokenBudgetManager,
  createBudgetManager,
  type ReviewMode,
  type AllocationStrategy,
  type AgentConfig,
  type AgentEstimate,
  type BudgetExecutionPlan,
  type BudgetStatistics
} from './token-budget-manager';

// Prompt versioning utilities
export {
  PromptVersioningManager,
  type GitCommit,
  type VersionDiff,
  type RollbackResult
} from './prompt-versioning';
