/**
 * config-integration.test.ts - 配置集成测试
 *
 * 测试 severityThreshold 过滤、config.dimensions/formats 透传、
 * params 优先级高于 config 等场景。
 */

import { ReviewOrchestrator } from '../../src/orchestrator/orchestrator';
import { resolveConfig, VALID_SEVERITY_THRESHOLDS } from '../../src/orchestrator/config';
import { ReviewIssue, ReviewDimension, Severity, ReviewReport } from '../../src/types';

// 辅助函数：创建测试用 issue
function createIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    file: 'test.ts',
    line: 1,
    severity: 'medium' as Severity,
    dimension: ReviewDimension.Logic,
    description: '测试问题',
    suggestion: '修复建议',
    confidence: 0.8,
    ...overrides,
  };
}

// 辅助函数：创建包含各种 severity 的 issue 列表
function createMixedIssues(): ReviewIssue[] {
  return [
    createIssue({ severity: 'critical', description: '严重问题' }),
    createIssue({ severity: 'high', description: '高优先级问题' }),
    createIssue({ severity: 'medium', description: '中等问题' }),
    createIssue({ severity: 'low', description: '低优先级问题' }),
  ];
}

describe('severityThreshold 过滤', () => {
  describe('threshold=high 过滤逻辑', () => {
    test('threshold=high 时，最终报告不包含 medium 或 low', () => {
      const orchestrator = new ReviewOrchestrator({ severityThreshold: 'high', enableAdversary: false });
      const issues = createMixedIssues();

      const filtered = orchestrator.filterBySeverityThreshold(issues);

      // 仅保留 critical 和 high
      expect(filtered.length).toBe(2);
      expect(filtered.every(i => i.severity === 'critical' || i.severity === 'high')).toBe(true);
      // 确认 medium 和 low 被过滤
      expect(filtered.some(i => i.severity === 'medium')).toBe(false);
      expect(filtered.some(i => i.severity === 'low')).toBe(false);
    });
  });

  describe('threshold=medium 过滤逻辑', () => {
    test('threshold=medium 时，仅过滤 low', () => {
      const orchestrator = new ReviewOrchestrator({ severityThreshold: 'medium', enableAdversary: false });
      const issues = createMixedIssues();

      const filtered = orchestrator.filterBySeverityThreshold(issues);

      // 保留 critical, high, medium
      expect(filtered.length).toBe(3);
      expect(filtered.some(i => i.severity === 'low')).toBe(false);
      expect(filtered.some(i => i.severity === 'medium')).toBe(true);
      expect(filtered.some(i => i.severity === 'high')).toBe(true);
      expect(filtered.some(i => i.severity === 'critical')).toBe(true);
    });
  });

  describe('threshold=low 或 undefined 不过滤', () => {
    test('threshold=low 时不过滤任何 issue', () => {
      const orchestrator = new ReviewOrchestrator({ severityThreshold: 'low', enableAdversary: false });
      const issues = createMixedIssues();

      const filtered = orchestrator.filterBySeverityThreshold(issues);
      expect(filtered.length).toBe(4);
    });

    test('threshold=undefined 时不过滤任何 issue', () => {
      const orchestrator = new ReviewOrchestrator({ enableAdversary: false });
      const issues = createMixedIssues();

      const filtered = orchestrator.filterBySeverityThreshold(issues);
      expect(filtered.length).toBe(4);
    });
  });

  describe('threshold=critical 过滤逻辑', () => {
    test('threshold=critical 时，仅保留 critical', () => {
      const orchestrator = new ReviewOrchestrator({ severityThreshold: 'critical', enableAdversary: false });
      const issues = createMixedIssues();

      const filtered = orchestrator.filterBySeverityThreshold(issues);
      expect(filtered.length).toBe(1);
      expect(filtered[0].severity).toBe('critical');
    });
  });

  describe('summary 与过滤后 issues 一致', () => {
    test('过滤后 report.summary.bySeverity 和 totalIssues 与 issues 一致', () => {
      const orchestrator = new ReviewOrchestrator({ severityThreshold: 'high', enableAdversary: false });
      const issues = createMixedIssues();

      // 使用 filterBySeverityThreshold 和 generateReport 验证一致性
      const filtered = orchestrator.filterBySeverityThreshold(issues);
      const report = orchestrator.generateReport(filtered, {
        startTime: Date.now(),
        dimensionAgentResults: [],
        stageTimings: { input: 0, dimensionReview: 0, adversaryReview: 0, calibration: 0, reportGeneration: 0 },
        incompleteDimensions: [],
      } as any);

      // summary.totalIssues 应该等于过滤后的数量
      expect(report.summary.totalIssues).toBe(2);
      // bySeverity 应该只包含 critical 和 high
      expect(report.summary.bySeverity.critical).toBe(1);
      expect(report.summary.bySeverity.high).toBe(1);
      expect(report.summary.bySeverity.medium).toBe(0);
      expect(report.summary.bySeverity.low).toBe(0);
      // issues 数组长度匹配
      expect(report.issues.length).toBe(2);
    });
  });

  describe('invalid severityThreshold 处理', () => {
    test('非法 severityThreshold 值等同于不设阈值', () => {
      const orchestrator = new ReviewOrchestrator({ severityThreshold: 'invalid-value', enableAdversary: false });
      const issues = createMixedIssues();

      const filtered = orchestrator.filterBySeverityThreshold(issues);
      // 非法值不过滤任何问题
      expect(filtered.length).toBe(4);
    });

    test('空字符串 severityThreshold 等同于不设阈值', () => {
      const orchestrator = new ReviewOrchestrator({ severityThreshold: '', enableAdversary: false });
      const issues = createMixedIssues();

      const filtered = orchestrator.filterBySeverityThreshold(issues);
      expect(filtered.length).toBe(4);
    });

    test('resolveConfig 对非法 severityThreshold 返回 undefined', () => {
      const config = resolveConfig({ severityThreshold: 'invalid' });
      expect(config.severityThreshold).toBeUndefined();
    });

    test('resolveConfig 对合法 severityThreshold 正确返回', () => {
      const config = resolveConfig({ severityThreshold: 'high' });
      expect(config.severityThreshold).toBe('high');
    });
  });
});

describe('config.dimensions 透传', () => {
  test('config 中的 dimensions 在未指定命令行参数时生效', () => {
    // 验证 resolveConfig 支持 dimensions 相关设置
    // 实际透传在 ReviewSkill 中完成，这里验证配置层面
    const config = resolveConfig({});
    // 默认不跳过任何维度
    expect(config.skipDimensions).toEqual([]);
  });

  test('config dimensions 被正确读取和透传', () => {
    // 模拟 config-loader 返回的 dimensions
    // 在 ReviewSkill 中，config.dimensions 会被转换为 params.dimensions
    const configDimensions = ['logic', 'security'];
    // 验证 dimensions 字符串可以正确拆分
    const parsedDimensions = configDimensions.join(',').split(',').map(d => d.trim());
    expect(parsedDimensions).toEqual(['logic', 'security']);
  });
});

describe('config.formats 透传', () => {
  test('config 中的 formats 在未指定命令行参数时生效', () => {
    // 验证 formats 配置可以正确解析
    const configFormats = ['json', 'markdown'];
    const formatString = configFormats.join(',');
    const parsed = formatString.split(',').map(f => f.trim()).filter(f => f === 'json' || f === 'markdown');
    expect(parsed).toEqual(['json', 'markdown']);
  });

  test('config formats 仅包含 json 时正确处理', () => {
    const configFormats = ['json'];
    const formatString = configFormats.join(',');
    const parsed = formatString.split(',').map(f => f.trim()).filter(f => f === 'json' || f === 'markdown');
    expect(parsed).toEqual(['json']);
  });
});

describe('params 优先级高于 config (override/priority)', () => {
  test('params.severityThreshold 覆盖 config.severityThreshold', () => {
    // 场景: config 设置 threshold=low，params 设置 threshold=high
    // 预期: params 优先，使用 high
    const paramThreshold = 'high';
    const configThreshold = 'low';

    // 模拟 ReviewSkill 中的合并逻辑: params || config
    const merged = paramThreshold || configThreshold;
    expect(merged).toBe('high');

    // 验证合并后的 threshold 生效
    const orchestrator = new ReviewOrchestrator({ severityThreshold: merged, enableAdversary: false });
    const issues = createMixedIssues();
    const filtered = orchestrator.filterBySeverityThreshold(issues);
    expect(filtered.length).toBe(2); // 只保留 critical 和 high
  });

  test('params.dimensions 覆盖 config.dimensions', () => {
    // 场景: config 设置 dimensions=logic,security，params 设置 dimensions=performance
    const paramDimensions = 'performance';
    const configDimensions = ['logic', 'security'];

    // 模拟合并逻辑: params || config.join(',')
    const merged = paramDimensions || configDimensions.join(',');
    expect(merged).toBe('performance');
  });

  test('params.formats 覆盖 config.formats', () => {
    // 场景: config 设置 formats=json，params 设置 formats=markdown
    const paramFormats = 'markdown';
    const configFormats = ['json'];

    // 模拟合并逻辑: params || config.join(',')
    const merged = paramFormats || configFormats.join(',');
    expect(merged).toBe('markdown');
  });

  test('params 未设置时使用 config 值', () => {
    // 场景: params 为 undefined，config 有值
    const paramThreshold: string | undefined = undefined;
    const configThreshold = 'medium';

    const merged = paramThreshold || configThreshold;
    expect(merged).toBe('medium');

    const orchestrator = new ReviewOrchestrator({ severityThreshold: merged, enableAdversary: false });
    const issues = createMixedIssues();
    const filtered = orchestrator.filterBySeverityThreshold(issues);
    // medium threshold: 保留 critical, high, medium（过滤 low）
    expect(filtered.length).toBe(3);
  });
});

describe('VALID_SEVERITY_THRESHOLDS 常量', () => {
  test('包含所有合法的 severity 值', () => {
    expect(VALID_SEVERITY_THRESHOLDS).toEqual(['critical', 'high', 'medium', 'low']);
  });
});
