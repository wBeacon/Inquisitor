/**
 * Agent System Prompts - 为各维度审查 Agent 定义详细的审查指导
 *
 * 设计原则：
 * 1. 每个 prompt 定义在独立文件中，便于维护和测试
 * 2. 公共指令抽取到 shared-instructions.ts，避免重复（DRY 原则）
 * 3. 每个 prompt 包含 CoT 推理链、Few-shot 示例、反面约束
 * 4. 明确输出格式要求（JSON ReviewIssue 格式）
 * 5. 鼓励 Agent 以"证明代码是错的"为目标
 */

// 从独立文件导入各维度 prompt
export { LOGIC_AGENT_PROMPT } from './logic-prompt';
export { SECURITY_AGENT_PROMPT } from './security-prompt';
export { PERFORMANCE_AGENT_PROMPT } from './performance-prompt';
export { MAINTAINABILITY_AGENT_PROMPT } from './maintainability-prompt';
export { EDGE_CASE_AGENT_PROMPT } from './edge-case-prompt';

// 对抗审查 Agent 的 prompt 从独立文件 re-export
export { ADVERSARY_AGENT_PROMPT } from './adversary-prompt';

// 元审查 Agent 的 prompt 从独立文件 re-export
export { META_REVIEWER_AGENT_PROMPT } from './meta-reviewer-prompt';

// 公共指令 re-export（供外部使用或测试）
export {
  SHARED_COT_INSTRUCTIONS,
  SHARED_JSON_FORMAT,
  SHARED_CONFIDENCE_GUIDE,
  SHARED_REVIEW_PRINCIPLES,
  SHARED_FALSE_POSITIVE_CONSTRAINTS,
  SHARED_INSTRUCTIONS_FULL,
} from './shared-instructions';

// 引入各 prompt 用于构建映射表
import { LOGIC_AGENT_PROMPT as _LOGIC } from './logic-prompt';
import { SECURITY_AGENT_PROMPT as _SECURITY } from './security-prompt';
import { PERFORMANCE_AGENT_PROMPT as _PERFORMANCE } from './performance-prompt';
import { MAINTAINABILITY_AGENT_PROMPT as _MAINTAINABILITY } from './maintainability-prompt';
import { EDGE_CASE_AGENT_PROMPT as _EDGE_CASE } from './edge-case-prompt';
import { ADVERSARY_AGENT_PROMPT as _ADVERSARY_PROMPT } from './adversary-prompt';
import { META_REVIEWER_AGENT_PROMPT as _META_REVIEWER_PROMPT } from './meta-reviewer-prompt';

/**
 * 5 个维度 Agent 的 prompt 映射
 */
export const AGENT_PROMPTS = {
  logic: _LOGIC,
  security: _SECURITY,
  performance: _PERFORMANCE,
  maintainability: _MAINTAINABILITY,
  edge_cases: _EDGE_CASE,
} as const;

export type AgentPromptKey = keyof typeof AGENT_PROMPTS;

/**
 * 5 个维度 + 对抗 Agent 的 prompt 映射
 */
export const AGENT_PROMPTS_WITH_ADVERSARY = {
  ...AGENT_PROMPTS,
  adversary: _ADVERSARY_PROMPT,
} as const;

export type AgentPromptKeyWithAdversary = keyof typeof AGENT_PROMPTS_WITH_ADVERSARY;

/**
 * 5 个维度 + 对抗 + 元审查 Agent 的完整 prompt 映射
 */
export const AGENT_PROMPTS_WITH_META_REVIEWER = {
  ...AGENT_PROMPTS_WITH_ADVERSARY,
  metaReviewer: _META_REVIEWER_PROMPT,
} as const;

export type AgentPromptKeyWithMetaReviewer = keyof typeof AGENT_PROMPTS_WITH_META_REVIEWER;

// Token 管理与 Prompt 优化
export {
  TokenManager,
  MODEL_CONFIGS,
  DEFAULT_MODEL_CONFIG,
  type ModelTokenConfig,
  type AgentTokenEstimate,
  type TokenCostReport,
} from './token-manager';

export {
  PromptOptimizer,
  type OptimizedPrompt,
} from './prompt-optimizer';

// Prompt 版本控制
export {
  PromptVersioningManager,
  VersionedPrompt,
  PromptVersionMetadata,
  PromptVersionMetrics,
  PromptVersionListItem,
  VersionSelectionStrategy,
  VersionSelectionResult,
  VersionComparison,
  VersionRollbackRequest,
  VersionRollbackResult,
  VersionQueryOptions,
  VersionQueryResult,
  VersionedPromptRegistry,
  PromptVersioningConfig,
} from './versioning';

export {
  ABTestConfig,
  ABTestAssignment,
  ABTestObservation,
  ABTestStatistics,
  VersionPerformanceReport,
  ABTestManager,
} from './versioning';

export {
  PromptSnapshot,
  SnapshotQueryOptions,
  SnapshotQueryResult,
  PerformanceAggregation,
  PromptArchive,
} from './versioning';

export { VersionSelector } from './versioning';
