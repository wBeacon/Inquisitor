/**
 * review-command.test.ts - /review 命令参数解析器测试
 */
import { parseReviewArgs } from '../../src/skill/review-command';

describe('parseReviewArgs', () => {
  // 默认模式：空参数 -> diff
  test('空参数默认为 diff 模式', () => {
    const r = parseReviewArgs('');
    expect(r.mode).toBe('diff');
    expect(r.enableAdversary).toBe(true);
    expect(r.path).toBeUndefined();
  });

  // 文件模式：裸路径
  test('裸路径识别为 file 模式', () => {
    const r = parseReviewArgs('src/foo.ts');
    expect(r.mode).toBe('file');
    expect(r.path).toBe('src/foo.ts');
    expect(r.enableAdversary).toBe(true);
  });

  // 目录模式：--full
  test('--full 标志设置 directory 模式', () => {
    const r = parseReviewArgs('--full src/');
    expect(r.mode).toBe('directory');
    expect(r.path).toBe('src/');
  });

  // 快速模式：--fast
  test('--fast 标志禁用对抗审查', () => {
    const r = parseReviewArgs('--fast');
    expect(r.mode).toBe('diff');
    expect(r.enableAdversary).toBe(false);
  });

  // 格式参数
  test('--formats 解析格式字符串', () => {
    const r = parseReviewArgs('--formats json,markdown');
    expect(r.formats).toBe('json,markdown');
  });

  // 维度参数
  test('--dimensions 解析维度字符串', () => {
    const r = parseReviewArgs('--dimensions logic,security');
    expect(r.dimensions).toBe('logic,security');
  });

  // 组合使用
  test('多参数组合: --fast --formats json,markdown src/foo.ts', () => {
    const r = parseReviewArgs('--fast --formats json,markdown src/foo.ts');
    expect(r.enableAdversary).toBe(false);
    expect(r.formats).toBe('json,markdown');
    expect(r.path).toBe('src/foo.ts');
    expect(r.mode).toBe('file');
  });

  // --full 和路径组合
  test('--full 和 --fast 组合', () => {
    const r = parseReviewArgs('--fast --full src/');
    expect(r.mode).toBe('directory');
    expect(r.enableAdversary).toBe(false);
    expect(r.path).toBe('src/');
  });

  // 纯空白字符串
  test('空白字符串视为空参数', () => {
    const r = parseReviewArgs('   ');
    expect(r.mode).toBe('diff');
  });

  // 未知标志被忽略
  test('未知标志被跳过', () => {
    const r = parseReviewArgs('--unknown src/foo.ts');
    expect(r.mode).toBe('file');
    expect(r.path).toBe('src/foo.ts');
  });
});
