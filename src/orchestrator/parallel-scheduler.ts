import { AgentResult, TokenUsage } from '../types';

/**
 * 并行调度任务定义 - 描述一个需要被调度执行的 Agent 任务
 */
export interface ScheduledTask<T = AgentResult> {
  /** 任务唯一标识 */
  id: string;
  /** 执行任务的异步函数 */
  execute: () => Promise<T>;
}

/**
 * 并行调度配置
 */
export interface ParallelSchedulerConfig {
  /** 最大并行数（并发限制） */
  maxParallel: number;
  /** 单个任务超时时间（毫秒） */
  taskTimeout: number;
}

/**
 * ParallelScheduler - 并行任务调度器
 * 负责并行执行多个 Agent 任务，支持并发限制和单任务超时
 * 单个任务超时不阻塞整体流程，返回 success:false 的结果
 */
export class ParallelScheduler {
  private readonly maxParallel: number;
  private readonly taskTimeout: number;

  constructor(config: ParallelSchedulerConfig) {
    this.maxParallel = config.maxParallel;
    this.taskTimeout = config.taskTimeout;
  }

  /**
   * 并行执行所有任务，支持并发限制和超时控制
   * 单个任务失败或超时不影响其他任务
   * @param tasks 待执行的任务列表
   * @returns 所有任务的结果列表（与输入顺序一致）
   */
  async executeAll(tasks: ScheduledTask<AgentResult>[]): Promise<AgentResult[]> {
    if (tasks.length === 0) {
      return [];
    }

    // 如果任务数不超过并发限制，直接全部并行
    if (tasks.length <= this.maxParallel) {
      return Promise.all(tasks.map((task) => this.executeWithTimeout(task)));
    }

    // 分批执行，每批最多 maxParallel 个
    const results: AgentResult[] = [];
    for (let i = 0; i < tasks.length; i += this.maxParallel) {
      const batch = tasks.slice(i, i + this.maxParallel);
      const batchResults = await Promise.all(
        batch.map((task) => this.executeWithTimeout(task))
      );
      results.push(...batchResults);
    }
    return results;
  }

  /**
   * 执行单个任务并应用超时控制
   * 超时时返回 success:false 的 AgentResult 而非抛出异常
   */
  private async executeWithTimeout(task: ScheduledTask<AgentResult>): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        task.execute(),
        this.createTimeoutPromise(task.id),
      ]);
      return result;
    } catch (error) {
      // 捕获任何未预期的异常，返回失败结果
      const durationMs = Date.now() - startTime;
      return this.createFailureResult(
        task.id,
        durationMs,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 创建超时 Promise
   * 超时时返回一个标记为失败的 AgentResult 而非 reject
   */
  private createTimeoutPromise(taskId: string): Promise<AgentResult> {
    return new Promise<AgentResult>((resolve) => {
      setTimeout(() => {
        resolve(this.createFailureResult(
          taskId,
          this.taskTimeout,
          `Agent ${taskId} timeout after ${this.taskTimeout}ms`
        ));
      }, this.taskTimeout);
    });
  }

  /**
   * 创建失败结果
   */
  private createFailureResult(
    agentId: string,
    durationMs: number,
    error: string
  ): AgentResult {
    return {
      agentId,
      issues: [],
      durationMs,
      tokenUsage: { input: 0, output: 0, total: 0 },
      success: false,
      error,
    };
  }
}
