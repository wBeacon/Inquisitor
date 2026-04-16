import { ReviewDimension, Severity } from '../types';

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
  /** 跳过的审查维度列表 */
  skipDimensions?: ReviewDimension[];
  /** 最低严重程度阈值，低于此阈值的问题将被过滤。仅接受 'critical'|'high'|'medium'|'low'，非法值等同于不设阈值 */
  severityThreshold?: string;
}

/**
 * 解析后的完整配置（所有字段必填）
 */
export interface ResolvedOrchestratorConfig {
  model: string;
  maxParallel: number;
  agentTimeout: number;
  totalTimeout: number;
  enableAdversary: boolean;
  enableCache: boolean;
  skipDimensions: ReviewDimension[];
  /** 已校验的严重程度阈值，undefined 表示不过滤 */
  severityThreshold?: Severity;
}

// 默认值常量 - 集中管理
/** 默认模型 */
export const DEFAULT_MODEL = 'claude-opus';
/** 默认最大并行数 */
export const DEFAULT_MAX_PARALLEL = 5;
/** 默认单 Agent 超时（5 分钟） */
export const DEFAULT_AGENT_TIMEOUT = 300000;
/** 默认总超时（10 分钟） */
export const DEFAULT_TOTAL_TIMEOUT = 600000;
/** 默认启用对抗审查 */
export const DEFAULT_ENABLE_ADVERSARY = true;
/** 默认禁用缓存 */
export const DEFAULT_ENABLE_CACHE = false;
/** 默认不跳过任何维度 */
export const DEFAULT_SKIP_DIMENSIONS: ReviewDimension[] = [];

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

  return {
    model: config?.model ?? DEFAULT_MODEL,
    maxParallel: config?.maxParallel ?? DEFAULT_MAX_PARALLEL,
    agentTimeout: config?.agentTimeout ?? DEFAULT_AGENT_TIMEOUT,
    totalTimeout: config?.totalTimeout ?? DEFAULT_TOTAL_TIMEOUT,
    enableAdversary: config?.enableAdversary ?? DEFAULT_ENABLE_ADVERSARY,
    enableCache: config?.enableCache ?? DEFAULT_ENABLE_CACHE,
    skipDimensions: config?.skipDimensions ?? [...DEFAULT_SKIP_DIMENSIONS],
    severityThreshold: resolvedThreshold,
  };
}
