/**
 * progress-reporter.ts - 审查进度反馈
 *
 * 在审查流程的关键阶段输出状态信息，让用户了解当前进度。
 * 支持以下阶段：collecting（采集输入）、reviewing（维度审查中）、
 * adversary（对抗审查中）、reporting（生成报告中）、done（完成）。
 */

/**
 * 审查阶段枚举
 */
export type ReviewPhase = 'collecting' | 'reviewing' | 'adversary' | 'reporting' | 'done';

/**
 * 阶段对应的中文描述
 */
const PHASE_MESSAGES: Record<ReviewPhase, string> = {
  collecting: '正在分析输入，采集待审查代码...',
  reviewing: '正在并行执行多维度代码审查...',
  adversary: '正在执行对抗式交叉验证...',
  reporting: '正在生成审查报告...',
  done: '审查完成。',
};

/**
 * 进度回调函数类型
 */
export type ProgressCallback = (phase: ReviewPhase, message: string) => void;

/**
 * ProgressReporter - 审查进度报告器
 *
 * 在审查的各个关键阶段输出进度信息。
 * 支持自定义回调以适配不同的输出方式（控制台、UI、日志等）。
 */
export class ProgressReporter {
  private callback: ProgressCallback;

  /**
   * @param callback - 进度回调函数，默认使用 console.log 输出
   */
  constructor(callback?: ProgressCallback) {
    this.callback = callback ?? ((phase: ReviewPhase, message: string) => {
      console.log(`[${phase}] ${message}`);
    });
  }

  /**
   * 报告进入某个审查阶段
   *
   * @param phase - 当前阶段
   *
   * @example
   * const reporter = new ProgressReporter();
   * reporter.onPhase('collecting');  // 输出: [collecting] 正在分析输入，采集待审查代码...
   * reporter.onPhase('reviewing');   // 输出: [reviewing] 正在并行执行多维度代码审查...
   * reporter.onPhase('done');        // 输出: [done] 审查完成。
   */
  onPhase(phase: ReviewPhase): void {
    const message = PHASE_MESSAGES[phase] ?? `阶段: ${phase}`;
    this.callback(phase, message);
  }
}
