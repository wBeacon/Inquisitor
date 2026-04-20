/**
 * ABTestManager - A/B 测试框架实现
 *
 * 设计原则：
 * 1. 确定性流量分配 - 基于 userId 哈希一致性分配
 * 2. 版本对比分析 - 追踪 A/B 版本的性能指标
 * 3. 统计学意义 - 支持分布式追踪和聚合分析
 * 4. 灵活配置 - 支持动态流量调整和版本更新
 */

import { ReviewDimension } from '../../../types';
import { PromptVersioningManager } from './prompt-versioning-manager';
import {
  VersionedPrompt,
  PromptVersionMetrics,
} from './types';

/**
 * A/B 测试配置
 */
export interface ABTestConfig {
  /** 测试标识 */
  testId: string;
  /** 所属维度 */
  dimension: ReviewDimension;
  /** A 版本 */
  versionA: string;
  /** B 版本 */
  versionB: string;
  /** A 版本的流量百分比 (0-100) */
  trafficSplitPercentage: number;
  /** 测试开始时间 */
  startedAt: string;
  /** 测试结束时间 (可选，null 表示进行中) */
  endedAt?: string;
  /** 测试状态 */
  status: 'active' | 'paused' | 'completed';
  /** 描述 */
  description?: string;
  /** 标签 */
  tags?: string[];
  /** 是否为 sticky 分配 (同一用户总是分配到同一版本) */
  stickyAssignment?: boolean;
}

/**
 * A/B 测试分配结果
 */
export interface ABTestAssignment {
  /** 测试标识 */
  testId: string;
  /** 分配到的版本 */
  version: string;
  /** 分组 (A 或 B) */
  group: 'A' | 'B';
  /** 用户 ID 哈希值 */
  userIdHash: number;
  /** 分配百分比 */
  assignedPercentage: number;
}

/**
 * A/B 测试观察结果 - 单次审查的观察
 */
export interface ABTestObservation {
  /** 测试标识 */
  testId: string;
  /** 分组 */
  group: 'A' | 'B';
  /** 使用的版本 */
  version: string;
  /** Agent ID */
  agentId: string;
  /** 用户/会话 ID */
  userId: string;
  /** 时间戳 */
  timestamp: string;
  /** 发现的问题数 */
  issueCount: number;
  /** 平均置信度 */
  averageConfidence: number;
  /** 执行时间 (毫秒) */
  executionTimeMs: number;
  /** Token 使用量 */
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  /** 自定义指标 */
  metrics?: Record<string, number>;
}

/**
 * A/B 测试统计
 */
export interface ABTestStatistics {
  /** 测试标识 */
  testId: string;
  /** A 版本的统计 */
  groupA: {
    version: string;
    observationCount: number;
    averageIssueCount: number;
    averageConfidence: number;
    averageExecutionTimeMs: number;
    totalTokens: number;
    metrics?: Record<string, number>;
  };
  /** B 版本的统计 */
  groupB: {
    version: string;
    observationCount: number;
    averageIssueCount: number;
    averageConfidence: number;
    averageExecutionTimeMs: number;
    totalTokens: number;
    metrics?: Record<string, number>;
  };
  /** 对比结果 */
  comparison: {
    issueCountDiff: number;
    confidenceDiff: number;
    executionTimeDiff: number;
    tokenUsageDiff: number;
    winner?: 'A' | 'B' | 'tie';
    significance?: number; // 0-1，1 表示高度显著
  };
  /** 计算时间 */
  calculatedAt: string;
}

/**
 * 版本性能对比报告
 */
export interface VersionPerformanceReport {
  /** 版本 A */
  versionA: string;
  /** 版本 B */
  versionB: string;
  /** 测试周期 */
  period: {
    startedAt: string;
    endedAt?: string;
  };
  /** 各版本的指标 */
  metrics: {
    versionA: PromptVersionMetrics & { sampleSize: number };
    versionB: PromptVersionMetrics & { sampleSize: number };
  };
  /** 改进指标 */
  improvements: {
    accuracyImprovement: number; // 百分比
    confidenceImprovement: number;
    tokenEfficiency: number;
    speedImprovement: number;
  };
  /** 建议 */
  recommendation: 'promote_to_production' | 'keep_testing' | 'rollback' | 'no_clear_winner';
  /** 推理理由 */
  reasoning: string;
}

/**
 * ABTestManager - 管理 A/B 测试
 */
export class ABTestManager {
  private versioningManager: PromptVersioningManager;
  private testConfigs: Map<string, ABTestConfig> = new Map();
  private observations: ABTestObservation[] = [];
  private configStorageFile: string;

  constructor(
    versioningManager: PromptVersioningManager,
    configStorageFile: string = '.inquisitor/ab-tests.json',
  ) {
    this.versioningManager = versioningManager;
    this.configStorageFile = configStorageFile;
    this.loadConfigs();
  }

  /**
   * 创建 A/B 测试
   */
  async createTest(config: ABTestConfig): Promise<void> {
    if (this.testConfigs.has(config.testId)) {
      throw new Error(`Test ${config.testId} already exists`);
    }

    // 验证版本存在
    const versionA = await this.versioningManager.getVersion(
      config.dimension,
      config.versionA,
    );
    const versionB = await this.versioningManager.getVersion(
      config.dimension,
      config.versionB,
    );

    if (!versionA || !versionB) {
      throw new Error('One or both versions not found');
    }

    // 验证流量分配
    if (config.trafficSplitPercentage < 0 || config.trafficSplitPercentage > 100) {
      throw new Error('Traffic split percentage must be between 0 and 100');
    }

    this.testConfigs.set(config.testId, {
      ...config,
      stickyAssignment: config.stickyAssignment !== false,
    });
    this.saveConfigs();
  }

  /**
   * 获取 A/B 测试配置
   */
  getTestConfig(testId: string): ABTestConfig | null {
    return this.testConfigs.get(testId) || null;
  }

  /**
   * 获取所有活跃的 A/B 测试
   */
  getActiveTests(dimension?: ReviewDimension): ABTestConfig[] {
    return Array.from(this.testConfigs.values()).filter((test) => {
      const isActive = test.status === 'active';
      const matchesDimension = !dimension || test.dimension === dimension;
      return isActive && matchesDimension;
    });
  }

  /**
   * 为用户分配版本 (确定性分配)
   */
  assignVersion(testId: string, userId: string): ABTestAssignment {
    const config = this.testConfigs.get(testId);
    if (!config) {
      throw new Error(`Test ${testId} not found`);
    }

    // 计算 userId 的哈希值
    const userIdHash = this.hashUserId(userId);
    const percentage = userIdHash % 100;

    // 根据流量分配确定版本
    const isGroupA = percentage < config.trafficSplitPercentage;

    return {
      testId,
      version: isGroupA ? config.versionA : config.versionB,
      group: isGroupA ? 'A' : 'B',
      userIdHash,
      assignedPercentage: config.trafficSplitPercentage,
    };
  }

  /**
   * 记录观察
   */
  recordObservation(observation: ABTestObservation): void {
    // 验证测试存在且活跃
    const config = this.testConfigs.get(observation.testId);
    if (!config) {
      throw new Error(`Test ${observation.testId} not found`);
    }

    if (config.status !== 'active') {
      throw new Error(`Test ${observation.testId} is not active`);
    }

    this.observations.push(observation);
  }

  /**
   * 获取测试的统计信息
   */
  getStatistics(testId: string): ABTestStatistics {
    const config = this.testConfigs.get(testId);
    if (!config) {
      throw new Error(`Test ${testId} not found`);
    }

    const testObservations = this.observations.filter((o) => o.testId === testId);

    const groupAObs = testObservations.filter((o) => o.group === 'A');
    const groupBObs = testObservations.filter((o) => o.group === 'B');

    const groupAStats = this.calculateGroupStats(groupAObs, config.versionA);
    const groupBStats = this.calculateGroupStats(groupBObs, config.versionB);

    const issueCountDiff = groupBStats.averageIssueCount - groupAStats.averageIssueCount;
    const confidenceDiff = groupBStats.averageConfidence - groupAStats.averageConfidence;
    const executionTimeDiff = groupBStats.averageExecutionTimeMs - groupAStats.averageExecutionTimeMs;
    const tokenUsageDiff = groupBStats.totalTokens - groupAStats.totalTokens;

    return {
      testId,
      groupA: groupAStats,
      groupB: groupBStats,
      comparison: {
        issueCountDiff,
        confidenceDiff,
        executionTimeDiff,
        tokenUsageDiff,
        winner: this.determineWinner(groupAStats, groupBStats),
        significance: this.calculateSignificance(groupAObs.length, groupBObs.length),
      },
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * 生成性能对比报告
   */
  async generatePerformanceReport(
    testId: string,
  ): Promise<VersionPerformanceReport> {
    const config = this.testConfigs.get(testId);
    if (!config) {
      throw new Error(`Test ${testId} not found`);
    }

    const versionA = await this.versioningManager.getVersion(config.dimension, config.versionA);
    const versionB = await this.versioningManager.getVersion(config.dimension, config.versionB);

    if (!versionA || !versionB) {
      throw new Error('One or both versions not found');
    }

    const stats = this.getStatistics(testId);

    // 计算改进指标
    const accuracyImprovement =
      stats.groupA.averageIssueCount > 0
        ? ((stats.groupB.averageIssueCount - stats.groupA.averageIssueCount) / stats.groupA.averageIssueCount) * 100
        : 0;

    const confidenceImprovement =
      stats.groupA.averageConfidence > 0
        ? ((stats.groupB.averageConfidence - stats.groupA.averageConfidence) / stats.groupA.averageConfidence) * 100
        : 0;

    const tokenEfficiency =
      stats.groupA.totalTokens > 0
        ? (stats.groupA.totalTokens - stats.groupB.totalTokens) / stats.groupA.totalTokens
        : 0;

    const speedImprovement =
      stats.groupA.averageExecutionTimeMs > 0
        ? ((stats.groupA.averageExecutionTimeMs - stats.groupB.averageExecutionTimeMs) /
          stats.groupA.averageExecutionTimeMs) *
          100
        : 0;

    // 确定建议
    const recommendation = this.makeRecommendation(
      stats,
      accuracyImprovement,
      confidenceImprovement,
      speedImprovement,
    );

    const reasoning = this.generateReasoning(
      stats,
      accuracyImprovement,
      confidenceImprovement,
      speedImprovement,
    );

    return {
      versionA: config.versionA,
      versionB: config.versionB,
      period: {
        startedAt: config.startedAt,
        endedAt: config.endedAt,
      },
      metrics: {
        versionA: {
          ...versionA.metrics,
          sampleSize: stats.groupA.observationCount,
        } as any,
        versionB: {
          ...versionB.metrics,
          sampleSize: stats.groupB.observationCount,
        } as any,
      },
      improvements: {
        accuracyImprovement,
        confidenceImprovement,
        tokenEfficiency,
        speedImprovement,
      },
      recommendation,
      reasoning,
    };
  }

  /**
   * 更新测试状态
   */
  async updateTestStatus(
    testId: string,
    status: 'active' | 'paused' | 'completed',
  ): Promise<void> {
    const config = this.testConfigs.get(testId);
    if (!config) {
      throw new Error(`Test ${testId} not found`);
    }

    config.status = status;
    if (status === 'completed') {
      config.endedAt = new Date().toISOString();
    }

    this.testConfigs.set(testId, config);
    this.saveConfigs();
  }

  /**
   * 根据测试结果提升版本到生产
   */
  async promoteVersionToProduction(
    testId: string,
    versionToPromote: 'A' | 'B',
  ): Promise<void> {
    const config = this.testConfigs.get(testId);
    if (!config) {
      throw new Error(`Test ${testId} not found`);
    }

    const version = versionToPromote === 'A' ? config.versionA : config.versionB;
    const otherVersion = versionToPromote === 'A' ? config.versionB : config.versionA;

    // 标记提升的版本为生产稳定
    await this.versioningManager.updateVersion(config.dimension, version, {
      metadata: {
        tags: ['production'],
        description: `Promoted to production from A/B test ${testId}`,
      },
    });

    // 标记另一个版本为已弃用
    await this.versioningManager.updateVersion(config.dimension, otherVersion, {
      metadata: {
        tags: [],
        deprecated: true,
        description: `Deprecated after A/B test ${testId} in favor of ${version}`,
      },
    });

    // 标记测试完成
    await this.updateTestStatus(testId, 'completed');
  }

  // ========== 辅助方法 ==========

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private calculateGroupStats(
    observations: ABTestObservation[],
    version: string,
  ): {
    version: string;
    observationCount: number;
    averageIssueCount: number;
    averageConfidence: number;
    averageExecutionTimeMs: number;
    totalTokens: number;
    metrics?: Record<string, number>;
  } {
    if (observations.length === 0) {
      return {
        version,
        observationCount: 0,
        averageIssueCount: 0,
        averageConfidence: 0,
        averageExecutionTimeMs: 0,
        totalTokens: 0,
      };
    }

    const totalIssues = observations.reduce((sum, o) => sum + o.issueCount, 0);
    const totalConfidence = observations.reduce((sum, o) => sum + o.averageConfidence, 0);
    const totalExecutionTime = observations.reduce((sum, o) => sum + o.executionTimeMs, 0);
    const totalTokens = observations.reduce((sum, o) => sum + o.tokenUsage.total, 0);

    return {
      version,
      observationCount: observations.length,
      averageIssueCount: totalIssues / observations.length,
      averageConfidence: totalConfidence / observations.length,
      averageExecutionTimeMs: totalExecutionTime / observations.length,
      totalTokens,
    };
  }

  private determineWinner(
    groupA: any,
    groupB: any,
  ): 'A' | 'B' | 'tie' {
    // 综合考虑多个指标
    let scoreA = 0;
    let scoreB = 0;

    // 准确度 (低问题数更好)
    if (groupA.averageIssueCount < groupB.averageIssueCount) scoreA++;
    else if (groupB.averageIssueCount < groupA.averageIssueCount) scoreB++;

    // 置信度 (高置信度更好)
    if (groupA.averageConfidence > groupB.averageConfidence) scoreA++;
    else if (groupB.averageConfidence > groupA.averageConfidence) scoreB++;

    // 性能 (低执行时间更好)
    if (groupA.averageExecutionTimeMs < groupB.averageExecutionTimeMs) scoreA++;
    else if (groupB.averageExecutionTimeMs < groupA.averageExecutionTimeMs) scoreB++;

    if (scoreA > scoreB) return 'A';
    if (scoreB > scoreA) return 'B';
    return 'tie';
  }

  private calculateSignificance(sampleSizeA: number, sampleSizeB: number): number {
    // 简单的样本大小相关函数
    const totalSamples = sampleSizeA + sampleSizeB;
    if (totalSamples < 10) return 0;
    if (totalSamples < 50) return 0.3;
    if (totalSamples < 200) return 0.6;
    return Math.min(0.95, 0.6 + (totalSamples - 200) / 1000);
  }

  private makeRecommendation(
    stats: ABTestStatistics,
    accuracyImprovement: number,
    confidenceImprovement: number,
    speedImprovement: number,
  ): 'promote_to_production' | 'keep_testing' | 'rollback' | 'no_clear_winner' {
    const winner = stats.comparison.winner;
    const significance = stats.comparison.significance || 0;

    if (winner === 'tie' || significance < 0.5) {
      return 'keep_testing';
    }

    if (winner === 'B' && (accuracyImprovement > 5 || confidenceImprovement > 10)) {
      return 'promote_to_production';
    }

    if (winner === 'A' && (accuracyImprovement < -10 || confidenceImprovement < -15)) {
      return 'rollback';
    }

    return 'keep_testing';
  }

  private generateReasoning(
    stats: ABTestStatistics,
    accuracyImprovement: number,
    confidenceImprovement: number,
    speedImprovement: number,
  ): string {
    const parts: string[] = [];

    parts.push(
      `样本量：Group A ${stats.groupA.observationCount}, Group B ${stats.groupB.observationCount}`,
    );
    parts.push(
      `准确度: Group A 平均 ${stats.groupA.averageIssueCount.toFixed(2)} issues, ` +
      `Group B ${stats.groupB.averageIssueCount.toFixed(2)} issues (${accuracyImprovement > 0 ? '+' : ''}${accuracyImprovement.toFixed(1)}%)`,
    );
    parts.push(
      `置信度: Group A ${(stats.groupA.averageConfidence * 100).toFixed(1)}%, ` +
      `Group B ${(stats.groupB.averageConfidence * 100).toFixed(1)}% (${confidenceImprovement > 0 ? '+' : ''}${confidenceImprovement.toFixed(1)}%)`,
    );
    parts.push(
      `性能: ${speedImprovement > 0 ? '+' : ''}${speedImprovement.toFixed(1)}% 速度改进`,
    );

    return parts.join('\n');
  }

  private loadConfigs(): void {
    const fs = require('fs');
    if (fs.existsSync(this.configStorageFile)) {
      const data = fs.readFileSync(this.configStorageFile, 'utf-8');
      const configs = JSON.parse(data) as ABTestConfig[];
      configs.forEach((config) => this.testConfigs.set(config.testId, config));
    }
  }

  private saveConfigs(): void {
    const fs = require('fs');
    const configs = Array.from(this.testConfigs.values());
    const dir = require('path').dirname(this.configStorageFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configStorageFile, JSON.stringify(configs, null, 2), 'utf-8');
  }
}
