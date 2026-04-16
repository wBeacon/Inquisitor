import { ParallelScheduler, ScheduledTask } from '../../src/orchestrator/parallel-scheduler';
import { AgentResult } from '../../src/types';

/**
 * 创建一个模拟 Agent 任务
 */
function createMockTask(
  id: string,
  delayMs: number,
  issues: AgentResult['issues'] = [],
  shouldFail = false
): ScheduledTask<AgentResult> {
  return {
    id,
    execute: () =>
      new Promise((resolve, reject) => {
        setTimeout(() => {
          if (shouldFail) {
            reject(new Error(`Agent ${id} execution failed`));
          } else {
            resolve({
              agentId: id,
              issues,
              durationMs: delayMs,
              tokenUsage: { input: 100, output: 50, total: 150 },
              success: true,
            });
          }
        }, delayMs);
      }),
  };
}

describe('ParallelScheduler', () => {
  describe('basic execution', () => {
    it('should execute all tasks and return results', async () => {
      const scheduler = new ParallelScheduler({ maxParallel: 5, taskTimeout: 5000 });
      const tasks = [
        createMockTask('agent-1', 10),
        createMockTask('agent-2', 10),
        createMockTask('agent-3', 10),
      ];

      const results = await scheduler.executeAll(tasks);
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should return empty array for no tasks', async () => {
      const scheduler = new ParallelScheduler({ maxParallel: 5, taskTimeout: 5000 });
      const results = await scheduler.executeAll([]);
      expect(results).toEqual([]);
    });

    it('should preserve task order in results', async () => {
      const scheduler = new ParallelScheduler({ maxParallel: 5, taskTimeout: 5000 });
      const tasks = [
        createMockTask('agent-a', 30),
        createMockTask('agent-b', 10),
        createMockTask('agent-c', 20),
      ];

      const results = await scheduler.executeAll(tasks);
      expect(results[0].agentId).toBe('agent-a');
      expect(results[1].agentId).toBe('agent-b');
      expect(results[2].agentId).toBe('agent-c');
    });
  });

  describe('concurrency / maxParallel', () => {
    it('should respect maxParallel concurrency limit', async () => {
      // 使用 maxParallel=2，5 个任务应该分 3 批
      const scheduler = new ParallelScheduler({ maxParallel: 2, taskTimeout: 5000 });
      let concurrentCount = 0;
      let maxConcurrent = 0;

      const tasks: ScheduledTask<AgentResult>[] = Array.from({ length: 5 }, (_, i) => ({
        id: `agent-${i}`,
        execute: () =>
          new Promise<AgentResult>((resolve) => {
            concurrentCount++;
            maxConcurrent = Math.max(maxConcurrent, concurrentCount);
            setTimeout(() => {
              concurrentCount--;
              resolve({
                agentId: `agent-${i}`,
                issues: [],
                durationMs: 10,
                tokenUsage: { input: 0, output: 0, total: 0 },
                success: true,
              });
            }, 20);
          }),
      }));

      const results = await scheduler.executeAll(tasks);
      expect(results).toHaveLength(5);
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('graceful timeout handling', () => {
    it('should return success:false for timed out tasks without blocking others', async () => {
      const scheduler = new ParallelScheduler({ maxParallel: 5, taskTimeout: 50 });
      const tasks = [
        createMockTask('fast-agent', 10),
        createMockTask('slow-agent', 5000), // 远超超时
        createMockTask('normal-agent', 10),
      ];

      const results = await scheduler.executeAll(tasks);
      expect(results).toHaveLength(3);

      // 快速的应该成功
      expect(results[0].success).toBe(true);
      expect(results[0].agentId).toBe('fast-agent');

      // 超时的应该标记为 incomplete / failed
      expect(results[1].success).toBe(false);
      expect(results[1].agentId).toBe('slow-agent');
      expect(results[1].error).toContain('timeout');

      // 另一个快速的也应该成功
      expect(results[2].success).toBe(true);
    });

    it('should include timeout duration in error message', async () => {
      const scheduler = new ParallelScheduler({ maxParallel: 1, taskTimeout: 30 });
      const tasks = [createMockTask('timeout-agent', 5000)];

      const results = await scheduler.executeAll(tasks);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('30ms');
    });
  });

  describe('timer cleanup', () => {
    it('should clearTimeout after task completes normally to avoid Timer leaks', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const scheduler = new ParallelScheduler({ maxParallel: 5, taskTimeout: 5000 });
      const tasks = [
        createMockTask('agent-1', 10),
        createMockTask('agent-2', 10),
      ];

      const results = await scheduler.executeAll(tasks);

      // 每个任务完成后都应该调用 clearTimeout 清理超时定时器
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
      expect(results.every((r) => r.success)).toBe(true);
      expect(results[0].agentId).toBe('agent-1');
      expect(results[1].agentId).toBe('agent-2');

      clearTimeoutSpy.mockRestore();
    });

    it('should clearTimeout after task times out (no residual Timer handles)', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      // 超时设置为 50ms，任务需要 5000ms -> 触发超时
      const scheduler = new ParallelScheduler({ maxParallel: 5, taskTimeout: 50 });
      const tasks = [createMockTask('slow-agent', 5000)];

      const results = await scheduler.executeAll(tasks);

      // 超时后也应该清理定时器
      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('timeout');

      clearTimeoutSpy.mockRestore();
    });

    it('should clearTimeout even when task throws an error', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const scheduler = new ParallelScheduler({ maxParallel: 5, taskTimeout: 5000 });
      const tasks = [createMockTask('error-agent', 10, [], true)];

      const results = await scheduler.executeAll(tasks);

      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(results[0].success).toBe(false);

      clearTimeoutSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should catch task execution errors and return failure result', async () => {
      const scheduler = new ParallelScheduler({ maxParallel: 5, taskTimeout: 5000 });
      const tasks = [
        createMockTask('ok-agent', 10),
        createMockTask('error-agent', 10, [], true),
      ];

      const results = await scheduler.executeAll(tasks);
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain('execution failed');
    });
  });
});
