/**
 * progress-reporter.test.ts - 进度报告器测试
 */
import { ProgressReporter, ReviewPhase } from '../../src/skill/progress-reporter';

describe('ProgressReporter', () => {
  test('所有阶段都能正常调用 onPhase', () => {
    const p = new ProgressReporter();
    // 不应抛出异常
    p.onPhase('collecting');
    p.onPhase('reviewing');
    p.onPhase('adversary');
    p.onPhase('reporting');
    p.onPhase('done');
  });

  test('自定义回调接收到正确的阶段和消息', () => {
    const received: Array<{ phase: ReviewPhase; message: string }> = [];
    const p = new ProgressReporter((phase, message) => {
      received.push({ phase, message });
    });

    p.onPhase('collecting');
    p.onPhase('reviewing');
    p.onPhase('adversary');
    p.onPhase('reporting');
    p.onPhase('done');

    expect(received.length).toBe(5);
    expect(received[0].phase).toBe('collecting');
    expect(received[0].message).toContain('分析输入');
    expect(received[1].phase).toBe('reviewing');
    expect(received[1].message).toContain('审查');
    expect(received[2].phase).toBe('adversary');
    expect(received[2].message).toContain('对抗');
    expect(received[3].phase).toBe('reporting');
    expect(received[3].message).toContain('报告');
    expect(received[4].phase).toBe('done');
    expect(received[4].message).toContain('完成');
  });

  test('默认回调使用 console.log', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    const p = new ProgressReporter();
    p.onPhase('collecting');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('collecting'));
    spy.mockRestore();
  });
});
