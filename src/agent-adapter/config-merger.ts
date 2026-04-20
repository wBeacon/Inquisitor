import { OrchestratorConfig, VALID_SEVERITY_THRESHOLDS, ResolvedOrchestratorConfig } from '../orchestrator/config';
import { Severity } from '../types';

/**
 * 合并配置的验证结果
 */
export interface MergedConfigValidation {
  severityThresholdValid: boolean;
  providerValid: boolean;
  errorMessage?: string;
}

/**
 * 合并 Agent 配置和基础配置
 *
 * 优先级：Agent 配置 > 基础配置
 * 对 severityThreshold 进行校验，不合法的值将被拒绝
 *
 * @param agentConfig Agent 提供的配置
 * @param baseConfig 基础 Orchestrator 配置
 * @returns 合并后的配置
 * @throws 当 severityThreshold 非法时抛出错误
 */
export function mergeAgentConfig(
  agentConfig: Partial<OrchestratorConfig>,
  baseConfig: ResolvedOrchestratorConfig
): OrchestratorConfig {
  // 验证 severityThreshold（如果提供）
  let validatedThreshold: Severity | undefined = undefined;
  if (agentConfig.severityThreshold !== undefined && agentConfig.severityThreshold !== null) {
    const threshold = agentConfig.severityThreshold;
    if (VALID_SEVERITY_THRESHOLDS.includes(threshold as Severity)) {
      validatedThreshold = threshold as Severity;
    } else {
      throw new Error(
        `Invalid severityThreshold: "${threshold}". ` +
        `Must be one of: ${VALID_SEVERITY_THRESHOLDS.join(', ')}`
      );
    }
  }

  // 合并配置：Agent 配置优先级更高
  return {
    model: agentConfig.model ?? baseConfig.model,
    maxParallel: agentConfig.maxParallel ?? baseConfig.maxParallel,
    agentTimeout: agentConfig.agentTimeout ?? baseConfig.agentTimeout,
    totalTimeout: agentConfig.totalTimeout ?? baseConfig.totalTimeout,
    enableAdversary: agentConfig.enableAdversary ?? baseConfig.enableAdversary,
    enableCache: agentConfig.enableCache ?? baseConfig.enableCache,
    enableMetaReview: agentConfig.enableMetaReview ?? baseConfig.enableMetaReview,
    skipDimensions: agentConfig.skipDimensions ?? baseConfig.skipDimensions,
    severityThreshold: validatedThreshold ?? baseConfig.severityThreshold,
    provider: agentConfig.provider ?? baseConfig.provider,
    maxAdversaryRounds: agentConfig.maxAdversaryRounds ?? baseConfig.maxAdversaryRounds,
  };
}
