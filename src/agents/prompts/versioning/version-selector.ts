/**
 * VersionSelector - 版本选择器
 *
 * 功能：
 * 1. 根据策略选择版本 (最新、稳定、A/B测试、权重、显式指定)
 * 2. 集成与 ABTestManager 的流量分配
 * 3. 提供可追踪的选择结果，便于审计
 */

import { ReviewDimension } from '../../../types';
import { PromptVersioningManager } from './prompt-versioning-manager';
import { ABTestManager } from './ab-test-manager';
import {
  VersionSelectionStrategy,
  VersionSelectionResult,
  PromptVersioningConfig,
  VersionedPrompt,
} from './types';

/**
 * VersionSelector - 运行时版本选择
 */
export class VersionSelector {
  private versioningManager: PromptVersioningManager;
  private abTestManager: ABTestManager;

  constructor(
    versioningManager: PromptVersioningManager,
    abTestManager: ABTestManager,
  ) {
    this.versioningManager = versioningManager;
    this.abTestManager = abTestManager;
  }

  /**
   * 为 Agent 选择版本
   */
  async selectVersion(
    dimension: ReviewDimension,
    config: PromptVersioningConfig,
    userId?: string,
  ): Promise<VersionSelectionResult> {
    if (!config.enabled) {
      return {
        selectedVersion: 'default',
        strategy: VersionSelectionStrategy.LATEST,
        reason: 'Versioning disabled, using default prompt',
      };
    }

    const strategy = config.strategy;

    switch (strategy) {
      case VersionSelectionStrategy.LATEST:
        return this.selectLatest(dimension);

      case VersionSelectionStrategy.STABLE:
        return this.selectStable(dimension);

      case VersionSelectionStrategy.AB_TEST:
        return this.selectABTest(dimension, config, userId);

      case VersionSelectionStrategy.WEIGHTED:
        return this.selectWeighted(dimension, config, userId);

      case VersionSelectionStrategy.EXPLICIT:
        return this.selectExplicit(dimension, config);

      default:
        return this.selectLatest(dimension);
    }
  }

  /**
   * 获取选定版本的完整内容
   */
  async getVersionContent(
    dimension: ReviewDimension,
    versionNumber: string,
  ): Promise<string | null> {
    if (versionNumber === 'default') {
      // 返回 null，由调用者使用默认 prompt
      return null;
    }

    const prompt = await this.versioningManager.getVersion(dimension, versionNumber);
    return prompt?.content || null;
  }

  // ========== 选择策略实现 ==========

  /**
   * 选择最新版本
   */
  private async selectLatest(dimension: ReviewDimension): Promise<VersionSelectionResult> {
    const latest = await this.versioningManager.getLatestVersion(dimension);

    if (!latest) {
      return {
        selectedVersion: 'default',
        strategy: VersionSelectionStrategy.LATEST,
        reason: 'No versions found, using default prompt',
      };
    }

    return {
      selectedVersion: latest.metadata.version,
      strategy: VersionSelectionStrategy.LATEST,
      reason: `Selected latest version: ${latest.metadata.version}`,
    };
  }

  /**
   * 选择生产稳定版本
   */
  private async selectStable(dimension: ReviewDimension): Promise<VersionSelectionResult> {
    const stable = await this.versioningManager.getStableVersion(dimension);

    if (!stable) {
      // 降级到最新版本
      return this.selectLatest(dimension);
    }

    return {
      selectedVersion: stable.metadata.version,
      strategy: VersionSelectionStrategy.STABLE,
      reason: `Selected stable production version: ${stable.metadata.version}`,
    };
  }

  /**
   * 选择 A/B 测试版本
   */
  private async selectABTest(
    dimension: ReviewDimension,
    config: PromptVersioningConfig,
    userId?: string,
  ): Promise<VersionSelectionResult> {
    const abTestConfig = config.abTestConfig;
    if (!abTestConfig) {
      return {
        selectedVersion: 'default',
        strategy: VersionSelectionStrategy.AB_TEST,
        reason: 'A/B test config not provided, using default prompt',
      };
    }

    // 查找活跃的 A/B 测试
    const activeTests = this.abTestManager.getActiveTests(dimension);
    const testInProgress = activeTests.find(
      (t) =>
        (t.versionA === abTestConfig.versionA && t.versionB === abTestConfig.versionB) ||
        t.testId === abTestConfig.versionA, // 兼容 testId 作为 versionA
    );

    if (!testInProgress) {
      // 没有活跃的 A/B 测试，使用 A 版本（默认版本）
      return {
        selectedVersion: abTestConfig.versionA,
        strategy: VersionSelectionStrategy.AB_TEST,
        reason: 'No active A/B test, using default version A',
        isABTestVariant: false,
      };
    }

    // 为用户分配版本
    if (!userId) {
      // 无用户 ID，随机分配
      return {
        selectedVersion: abTestConfig.versionA,
        strategy: VersionSelectionStrategy.AB_TEST,
        reason: 'No userId provided, using version A',
        isABTestVariant: true,
      };
    }

    const assignment = this.abTestManager.assignVersion(testInProgress.testId, userId);

    return {
      selectedVersion: assignment.version,
      strategy: VersionSelectionStrategy.AB_TEST,
      isABTestVariant: true,
      abTestGroup: assignment.group,
      reason: `A/B test assignment for ${userId}: group ${assignment.group} (${assignment.assignedPercentage}% to A)`,
    };
  }

  /**
   * 选择权重版本
   */
  private async selectWeighted(
    dimension: ReviewDimension,
    config: PromptVersioningConfig,
    userId?: string,
  ): Promise<VersionSelectionResult> {
    const weights = config.weights;
    if (!weights || Object.keys(weights).length === 0) {
      return {
        selectedVersion: 'default',
        strategy: VersionSelectionStrategy.WEIGHTED,
        reason: 'No weights provided, using default prompt',
      };
    }

    // 验证所有版本存在
    for (const version of Object.keys(weights)) {
      const prompt = await this.versioningManager.getVersion(dimension, version);
      if (!prompt) {
        throw new Error(`Weighted version ${version} not found`);
      }
    }

    // 基于权重进行确定性选择
    const seed = userId ? this.hashUserId(userId) : 0;
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    const random = (seed % 100) / 100;
    let accumulated = 0;

    for (const [version, weight] of Object.entries(weights)) {
      accumulated += weight / totalWeight;
      if (random < accumulated) {
        return {
          selectedVersion: version,
          strategy: VersionSelectionStrategy.WEIGHTED,
          reason: `Selected by weight distribution: ${version} (weight: ${weight})`,
        };
      }
    }

    // 降级到第一个版本
    const firstVersion = Object.keys(weights)[0];
    return {
      selectedVersion: firstVersion,
      strategy: VersionSelectionStrategy.WEIGHTED,
      reason: `Selected by weight distribution (fallback): ${firstVersion}`,
    };
  }

  /**
   * 选择显式指定的版本
   */
  private async selectExplicit(
    dimension: ReviewDimension,
    config: PromptVersioningConfig,
  ): Promise<VersionSelectionResult> {
    const explicit = config.explicitVersion;
    if (!explicit) {
      return {
        selectedVersion: 'default',
        strategy: VersionSelectionStrategy.EXPLICIT,
        reason: 'No explicit version provided, using default prompt',
      };
    }

    // 验证版本存在
    const prompt = await this.versioningManager.getVersion(dimension, explicit);
    if (!prompt) {
      throw new Error(`Explicit version ${explicit} not found`);
    }

    return {
      selectedVersion: explicit,
      strategy: VersionSelectionStrategy.EXPLICIT,
      reason: `Using explicitly specified version: ${explicit}`,
    };
  }

  // ========== 辅助方法 ==========

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
