import { ReviewDimension } from '../types';

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
 * @param config 用户传入的可选配置
 * @returns 解析后的完整配置
 */
export function resolveConfig(config?: OrchestratorConfig): ResolvedOrchestratorConfig {
  return {
    model: config?.model ?? DEFAULT_MODEL,
    maxParallel: config?.maxParallel ?? DEFAULT_MAX_PARALLEL,
    agentTimeout: config?.agentTimeout ?? DEFAULT_AGENT_TIMEOUT,
    totalTimeout: config?.totalTimeout ?? DEFAULT_TOTAL_TIMEOUT,
    enableAdversary: config?.enableAdversary ?? DEFAULT_ENABLE_ADVERSARY,
    enableCache: config?.enableCache ?? DEFAULT_ENABLE_CACHE,
    skipDimensions: config?.skipDimensions ?? [...DEFAULT_SKIP_DIMENSIONS],
  };
}
