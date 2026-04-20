import { ReviewDimension, Severity } from '../types';
import { ProviderConfig } from '../providers';

/** 合法的 severityThreshold 值 */
export const VALID_SEVERITY_THRESHOLDS: Severity[] = ['critical', 'high', 'medium', 'low'];

/**
 * 编排器配置接口 - 定义 Orchestrator 的运行参数
 */
export interface OrchestratorConfig {
  /** 使用的 AI 模型 */
  model?: string;
  /** 最大并行 Agent 数 */
  maxParallel?: number;
  /** 单个 Agent 超时时间（毫秒），默认 5 分钟 */
  agentTimeout?: number;
  /** 总体超时时间（毫秒） */
  totalTimeout?: number;
  /** 是否启用对抗审查 */
  enableAdversary?: boolean;
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 是否启用元审查 */
  enableMetaReview?: boolean;
  /** 跳过的审查维度列表 */
  skipDimensions?: ReviewDimension[];
  /** 最低严重程度阈值，低于此阈值的问题将被过滤。仅接受 'critical'|'high'|'medium'|'low'，非法值等同于不设阈值 */
  severityThreshold?: string;
  /** LLM Provider 配置（默认使用 Anthropic） */
  provider?: ProviderConfig;
  /** 对抗审查最大轮数（默认1，硬上限5） */
  maxAdversaryRounds?: number;
}

/**
 * 解析后的完整配置（所有字段必填）
 */
export interface ResolvedOrchestratorConfig {
  /** 使用的 AI 模型；undefined 时由 AgentRunner 回退到 provider.defaultModel */
  model?: string;
  maxParallel: number;
  agentTimeout: number;
  totalTimeout: number;
  enableAdversary: boolean;
  enableCache: boolean;
  enableMetaReview: boolean;
  skipDimensions: ReviewDimension[];
  /** 已校验的严重程度阈值，undefined 表示不过滤 */
  severityThreshold?: Severity;
  /** LLM Provider 配置 */
  provider?: ProviderConfig;
  /** 对抗审查最大轮数（默认1，硬上限5） */
  maxAdversaryRounds: number;
}

// 默认值常量 - 集中管理
/**
 * 默认模型：undefined 表示委托给 provider.defaultModel，
 * 这样切换 Provider 时模型名会自动匹配对应 Provider。
 */
export const DEFAULT_MODEL: string | undefined = undefined;
/** 默认 Provider 类型 */
export const DEFAULT_PROVIDER_TYPE: 'anthropic' = 'anthropic';
/** 默认最大并行数 */
export const DEFAULT_MAX_PARALLEL = 5;
/** 默认单 Agent 超时（5 分钟） */
export const DEFAULT_AGENT_TIMEOUT = 300000;
/** 默认总超时（10 分钟） */
export const DEFAULT_TOTAL_TIMEOUT = 600000;
/** 默认启用对抗审查 */
export const DEFAULT_ENABLE_ADVERSARY = true;
/** 默认禁用元审查 */
export const DEFAULT_ENABLE_META_REVIEW = false;
/** 默认禁用缓存 */
export const DEFAULT_ENABLE_CACHE = false;
/** 默认不跳过任何维度 */
export const DEFAULT_SKIP_DIMENSIONS: ReviewDimension[] = [];
/** 默认对抗审查轮数 */
export const DEFAULT_MAX_ADVERSARY_ROUNDS = 1;
/** 对抗审查轮数硬上限 */
export const MAX_ADVERSARY_ROUNDS_LIMIT = 5;

/**
 * 仅当值为有限正整数时采用，否则返回默认值。
 * 用于挡住 NaN / Infinity / 负数 / 0 / 非数字等非法输入；
 * `??` 只对 null/undefined 短路，NaN 会穿透导致后续并行调度 / 超时逻辑异常。
 */
function resolvePositiveInt(value: unknown, defaultValue: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : defaultValue;
}

/**
 * 将用户配置与默认值合并，返回完整配置
 * severityThreshold 经过校验，非法值会被忽略（等同于不设阈值）
 * @param config 用户传入的可选配置
 * @returns 解析后的完整配置
 */
export function resolveConfig(config?: OrchestratorConfig): ResolvedOrchestratorConfig {
  // 校验 severityThreshold：仅接受合法值
  let resolvedThreshold: Severity | undefined = undefined;
  if (config?.severityThreshold && VALID_SEVERITY_THRESHOLDS.includes(config.severityThreshold as Severity)) {
    resolvedThreshold = config.severityThreshold as Severity;
  }

  // 校验 maxAdversaryRounds：限制在 1~MAX_ADVERSARY_ROUNDS_LIMIT 范围内
  let resolvedMaxRounds = config?.maxAdversaryRounds ?? DEFAULT_MAX_ADVERSARY_ROUNDS;
  resolvedMaxRounds = Math.max(1, Math.min(MAX_ADVERSARY_ROUNDS_LIMIT, Math.floor(resolvedMaxRounds)));

  return {
    model: config?.model,
    maxParallel: resolvePositiveInt(config?.maxParallel, DEFAULT_MAX_PARALLEL),
    agentTimeout: resolvePositiveInt(config?.agentTimeout, DEFAULT_AGENT_TIMEOUT),
    totalTimeout: resolvePositiveInt(config?.totalTimeout, DEFAULT_TOTAL_TIMEOUT),
    enableAdversary: config?.enableAdversary ?? DEFAULT_ENABLE_ADVERSARY,
    enableCache: config?.enableCache ?? DEFAULT_ENABLE_CACHE,
    enableMetaReview: config?.enableMetaReview ?? DEFAULT_ENABLE_META_REVIEW,
    skipDimensions: config?.skipDimensions ?? [...DEFAULT_SKIP_DIMENSIONS],
    severityThreshold: resolvedThreshold,
    provider: config?.provider,
    maxAdversaryRounds: resolvedMaxRounds,
  };
}
