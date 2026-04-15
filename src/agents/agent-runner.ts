import { AgentConfig, AgentResult, ReviewIssue } from '../types';
import { ReviewDimension } from '../types';

/**
 * AgentRunner - 执行代码审查 Agent 的基础类
 * 每个 Agent 在隔离上下文中运行，确保不同 Agent 之间没有相互影响
 */
export abstract class AgentRunner {
  protected config: AgentConfig;
  protected timeout: number;

  constructor(config: AgentConfig, timeout: number = 300000) {
    // 5分钟默认超时
    this.config = config;
    this.timeout = timeout;
  }

  /**
   * 执行审查
   * @param files 要审查的文件路径列表
   * @param context 审查上下文（包含代码内容等）
   * @returns 审查结果
   */
  async review(files: string[], context: string): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      // 调用子类实现的审查逻辑
      const issues = await this.performReview(files, context);

      const durationMs = Date.now() - startTime;

      return {
        agentId: this.config.id,
        issues,
        durationMs,
        tokenUsage: {
          input: 0, // 在实际实现中，这些将由 API 返回
          output: 0,
          total: 0,
        },
        success: true,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      return {
        agentId: this.config.id,
        issues: [],
        durationMs,
        tokenUsage: {
          input: 0,
          output: 0,
          total: 0,
        },
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 由子类实现的实际审查逻辑
   */
  protected abstract performReview(
    files: string[],
    context: string
  ): Promise<ReviewIssue[]>;

  /**
   * 获取 Agent 配置
   */
  getConfig(): AgentConfig {
    return this.config;
  }

  /**
   * 获取 Agent ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * 获取 Agent 名称
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * 获取审查维度
   */
  getDimension(): ReviewDimension | undefined {
    return this.config.dimension;
  }

  /**
   * 格式化输出为 JSON
   */
  protected formatIssuesAsJson(issues: ReviewIssue[]): string {
    return JSON.stringify(issues, null, 2);
  }

  /**
   * 解析 JSON 审查结果
   */
  protected parseJsonIssues(jsonStr: string): ReviewIssue[] {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch (error) {
      console.error('Failed to parse JSON issues:', error);
      return [];
    }
  }
}
