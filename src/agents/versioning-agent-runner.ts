/**
 * VersioningAgentRunner - 扩展 AgentRunner 以支持 Prompt 版本控制
 *
 * 功能：
 * 1. 集成 PromptVersioningManager 进行版本管理
 * 2. 集成 VersionSelector 进行版本选择
 * 3. 在 callLLM 中选择适当的版本
 * 4. 追踪使用的版本信息在 AgentResult 中
 * 5. 记录 Prompt 快照用于后续分析和对比
 */

import { AgentConfig, AgentResult, ReviewIssue, ReviewDimension, PromptVersionInfo } from '../types';
import { LLMProvider } from '../providers';
import { AgentRunner } from './agent-runner';
import { PromptVersioningManager } from './prompts/versioning/prompt-versioning-manager';
import { ABTestManager } from './prompts/versioning/ab-test-manager';
import { VersionSelector } from './prompts/versioning/version-selector';
import { PromptArchive, PromptSnapshot } from './prompts/versioning/prompt-archive';
import { createHash } from 'crypto';

/**
 * VersioningAgentRunner - 支持 Prompt 版本控制的 Agent 运行器
 *
 * 扩展 AgentRunner，添加版本选择和管理功能
 */
export abstract class VersioningAgentRunner extends AgentRunner {
  protected versioningManager: PromptVersioningManager;
  protected abTestManager: ABTestManager;
  protected versionSelector: VersionSelector;
  protected promptArchive: PromptArchive;
  protected _selectedVersion?: string;
  protected _selectedVersionInfo?: PromptVersionInfo;
  protected _lastSystemPrompt?: string;
  protected _lastUserMessage?: string;

  constructor(
    config: AgentConfig,
    timeout: number = 300000,
    provider?: LLMProvider,
    versioningManager?: PromptVersioningManager,
    abTestManager?: ABTestManager,
    promptArchive?: PromptArchive,
  ) {
    super(config, timeout, provider);
    this.versioningManager = versioningManager || new PromptVersioningManager();
    this.abTestManager = abTestManager || new ABTestManager(this.versioningManager);
    this.versionSelector = new VersionSelector(this.versioningManager, this.abTestManager);
    this.promptArchive = promptArchive || new PromptArchive();
  }

  /**
   * 覆盖 review 方法以追踪版本信息和记录快照
   */
  async review(files: string[], context: string, userId?: string): Promise<AgentResult> {
    // 调用父类的 review 方法
    const result = await super.review(files, context);

    // 添加版本信息
    if (this._selectedVersionInfo) {
      result.promptVersionInfo = this._selectedVersionInfo;
    }

    // 记录 Prompt 快照
    if (this._selectedVersion && this.config.dimension) {
      try {
        await this.recordPromptSnapshot({
          result,
          userId,
          userMessage: context,
        });
      } catch (error) {
        console.warn(
          `[${this.config.id}] Failed to record prompt snapshot: ` +
          `${error instanceof Error ? error.message : String(error)}`,
        );
        // 不抛出错误，快照记录失败不应中断审查流程
      }
    }

    return result;
  }

  /**
   * 获取当前选中的版本号
   */
  getSelectedVersion(): string | undefined {
    return this._selectedVersion;
  }

  /**
   * 获取当前选中的版本信息
   */
  getSelectedVersionInfo(): PromptVersionInfo | undefined {
    return this._selectedVersionInfo;
  }

  /**
   * 选择并返回系统 prompt
   */
  protected async selectSystemPrompt(userId?: string): Promise<string> {
    // 如果没有启用版本控制，使用配置中的默认 prompt
    if (!this.config.promptVersioning?.enabled) {
      this._selectedVersion = 'default';
      this._lastSystemPrompt = this.config.systemPrompt;
      return this.config.systemPrompt;
    }

    // 选择版本
    const versioningConfig = this.config.promptVersioning;
    const dimension = this.config.dimension;

    if (!dimension) {
      // 无维度信息，使用默认 prompt
      this._lastSystemPrompt = this.config.systemPrompt;
      return this.config.systemPrompt;
    }

    try {
      const selection = await this.versionSelector.selectVersion(
        dimension,
        versioningConfig,
        userId,
      );

      this._selectedVersion = selection.selectedVersion;
      this._selectedVersionInfo = {
        version: selection.selectedVersion,
        strategy: selection.strategy,
        isABTestVariant: selection.isABTestVariant,
        abTestGroup: selection.abTestGroup,
      };

      // 如果选中的是版本，从存储中获取内容
      if (selection.selectedVersion !== 'default') {
        const versionedContent = await this.versionSelector.getVersionContent(
          dimension,
          selection.selectedVersion,
        );

        if (versionedContent) {
          console.info(
            `[${this.config.id}] Using versioned prompt: ${selection.selectedVersion} ` +
            `(strategy: ${selection.strategy}, reason: ${selection.reason})`,
          );
          this._lastSystemPrompt = versionedContent;
          return versionedContent;
        }
      }

      // 降级到默认 prompt
      console.warn(
        `[${this.config.id}] Failed to load version ${selection.selectedVersion}, ` +
        `falling back to default prompt`,
      );
      this._lastSystemPrompt = this.config.systemPrompt;
      return this.config.systemPrompt;
    } catch (error) {
      console.error(
        `[${this.config.id}] Version selection error: ${error instanceof Error ? error.message : String(error)}`,
      );
      // 错误时使用默认 prompt
      this._lastSystemPrompt = this.config.systemPrompt;
      return this.config.systemPrompt;
    }
  }

  /**
   * 记录 Prompt 快照
   */
  protected async recordPromptSnapshot(options: {
    result: AgentResult;
    userId?: string;
    userMessage?: string;
  }): Promise<PromptSnapshot | null> {
    try {
      const { result, userId, userMessage } = options;
      const dimension = this.config.dimension;

      if (!dimension) {
        return null;
      }

      const systemPrompt = this._lastSystemPrompt || this.config.systemPrompt;
      const userMsg = userMessage || '';

      // 计算哈希值
      const systemPromptHash = this.hashContent(systemPrompt);
      const userMessageHash = this.hashContent(userMsg);

      // 获取 A/B 测试信息
      const abTestId = this._selectedVersionInfo?.isABTestVariant
        ? undefined // 这需要从配置中获取
        : undefined;

      const snapshot = await this.promptArchive.recordSnapshot({
        timestamp: new Date().toISOString(),
        dimension,
        promptVersion: this._selectedVersion || 'default',
        systemPromptHash,
        userMessageHash,
        abTestId,
        abTestGroup: this._selectedVersionInfo?.abTestGroup,
        selectionStrategy: this._selectedVersionInfo?.strategy,
        metrics: {
          inputTokens: result.tokenUsage.input,
          outputTokens: result.tokenUsage.output,
          durationMs: result.durationMs,
          issueCount: result.issues.length,
          averageConfidence: this.calculateAverageConfidence(result.issues),
          maxSeverity: this.findMaxSeverity(result.issues),
        },
        success: result.success,
        error: result.error,
      });

      console.debug(
        `[${this.config.id}] Recorded prompt snapshot: ${snapshot.id} ` +
        `(version: ${snapshot.promptVersion}, issues: ${snapshot.metrics.issueCount})`,
      );

      return snapshot;
    } catch (error) {
      console.error(
        `[${this.config.id}] Error recording prompt snapshot: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * 记录 A/B 测试观察 (供子类调用)
   */
  protected recordABTestObservation(
    testId: string,
    group: 'A' | 'B',
    version: string,
    issueCount: number,
    userId?: string,
  ): void {
    try {
      this.abTestManager.recordObservation({
        testId,
        group,
        version,
        agentId: this.config.id,
        userId: userId || 'unknown',
        timestamp: new Date().toISOString(),
        issueCount,
        averageConfidence: this._lastTokenUsage.output > 0 ? 0.5 : 0,
        executionTimeMs: 0, // 应由子类设置
        tokenUsage: this._lastTokenUsage,
      });
    } catch (error) {
      console.warn(
        `[${this.config.id}] Failed to record A/B test observation: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 私有辅助方法
   */

  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private calculateAverageConfidence(issues: ReviewIssue[]): number {
    if (issues.length === 0) return 0;
    const sum = issues.reduce((acc, issue) => acc + issue.confidence, 0);
    return sum / issues.length;
  }

  private findMaxSeverity(issues: ReviewIssue[]): string | undefined {
    if (issues.length === 0) return undefined;

    const severityOrder = ['critical', 'error', 'warning', 'info', 'note'];
    let maxSeverity = issues[0].severity;

    for (const issue of issues) {
      const currentIdx = severityOrder.indexOf(issue.severity);
      const maxIdx = severityOrder.indexOf(maxSeverity);
      if (currentIdx < maxIdx) {
        maxSeverity = issue.severity;
      }
    }

    return maxSeverity;
  }

  /**
   * 由子类实现的实际审查逻辑 (不变)
   */
  protected abstract performReview(
    files: string[],
    context: string,
  ): Promise<ReviewIssue[]>;
}
