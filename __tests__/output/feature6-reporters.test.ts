import { JsonReporter } from '../../src/output/json-reporter';
import { MarkdownReporter } from '../../src/output/markdown-reporter';
import { SummaryGenerator, generateSummary } from '../../src/output/summary-generator';
import { JsonReporter as JsonFromIndex, MarkdownReporter as MdFromIndex, SummaryGenerator as SumFromIndex } from '../../src/output';
import { ReviewReport, ReviewIssue, ReviewDimension } from '../../src/types';

// --- 测试数据 ---

/** 包含多种 severity 和 adversaryVerdict 的完整报告 */
function createMockReport(): ReviewReport {
  const issues: ReviewIssue[] = [
    {
      file: 'src/foo.ts',
      line: 42,
      endLine: 50,
      severity: 'critical',
      dimension: ReviewDimension.Logic,
      description: '空指针引用风险',
      suggestion: '在访问属性前添加空值检查',
      confidence: 0.95,
      foundBy: 'logic-agent',
      codeSnippet: 'const val = obj.prop; // 缺少空值检查',
      adversaryVerdict: 'confirmed',
    },
    {
      file: 'src/bar.ts',
      line: 10,
      severity: 'high',
      dimension: ReviewDimension.Security,
      description: 'SQL 注入漏洞',
      suggestion: '使用参数化查询',
      confidence: 0.88,
      foundBy: 'security-agent',
      adversaryVerdict: 'disputed',
    },
    {
      file: 'src/baz.ts',
      line: 100,
      severity: 'medium',
      dimension: ReviewDimension.Performance,
      description: '低效循环',
      suggestion: '使用 map 替换嵌套循环',
      confidence: 0.7,
      foundBy: 'performance-agent',
      adversaryVerdict: 'false_positive',
    },
    {
      file: 'src/qux.ts',
      line: 5,
      severity: 'low',
      dimension: ReviewDimension.Maintainability,
      description: '变量命名不清晰',
      suggestion: '重命名为有意义的名称',
      confidence: 0.6,
      foundBy: 'maintainability-agent',
    },
    {
      file: 'src/foo.ts',
      line: 80,
      severity: 'critical',
      dimension: ReviewDimension.EdgeCases,
      description: '数组越界访问',
      suggestion: '添加边界检查',
      confidence: 0.92,
      foundBy: 'edge-case-agent',
      codeSnippet: 'arr[i + 1] // 可能越界',
      adversaryVerdict: 'confirmed',
    },
  ];

  return {
    issues,
    summary: {
      totalIssues: 5,
      bySeverity: { critical: 2, high: 1, medium: 1, low: 1 },
      byDimension: {
        [ReviewDimension.Logic]: 1,
        [ReviewDimension.Security]: 1,
        [ReviewDimension.Performance]: 1,
        [ReviewDimension.Maintainability]: 1,
        [ReviewDimension.EdgeCases]: 1,
      },
    },
    metadata: {
      durationMs: 5000,
      tokenUsage: { input: 10000, output: 5000, total: 15000 },
      startedAt: '2026-04-15T10:00:00.000Z',
      completedAt: '2026-04-15T10:00:05.000Z',
      agents: ['logic-agent', 'security-agent', 'performance-agent', 'maintainability-agent', 'edge-case-agent'],
    },
  };
}

/** 空报告 */
function createEmptyReport(): ReviewReport {
  return {
    issues: [],
    summary: {
      totalIssues: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      byDimension: {
        [ReviewDimension.Logic]: 0,
        [ReviewDimension.Security]: 0,
        [ReviewDimension.Performance]: 0,
        [ReviewDimension.Maintainability]: 0,
        [ReviewDimension.EdgeCases]: 0,
      },
    },
    metadata: {
      durationMs: 100,
      tokenUsage: { input: 500, output: 200, total: 700 },
      startedAt: '2026-04-15T10:00:00.000Z',
      completedAt: '2026-04-15T10:00:00.100Z',
      agents: [],
    },
  };
}

// =====================================================
// 验收条件 #1: JSON 报告可通过 JSON.parse 解析，含所有字段和 summary 统计
// =====================================================
describe('JsonReporter', () => {
  it('应生成可被 JSON.parse 解析的 JSON 字符串', () => {
    const report = createMockReport();
    const result = JsonReporter.generate(report);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('应包含所有 ReviewIssue 字段', () => {
    const report = createMockReport();
    const result = JsonReporter.generate(report);
    const parsed = JSON.parse(result);

    // 验证第一个 issue 包含所有必需字段
    const issue = parsed.issues[0];
    expect(issue).toHaveProperty('file');
    expect(issue).toHaveProperty('line');
    expect(issue).toHaveProperty('endLine');
    expect(issue).toHaveProperty('severity');
    expect(issue).toHaveProperty('dimension');
    expect(issue).toHaveProperty('description');
    expect(issue).toHaveProperty('suggestion');
    expect(issue).toHaveProperty('confidence');
    expect(issue).toHaveProperty('foundBy');
    expect(issue).toHaveProperty('codeSnippet');
  });

  it('应包含 summary 统计信息（bySeverity, byDimension, totalIssues）', () => {
    const report = createMockReport();
    const result = JsonReporter.generate(report);
    const parsed = JSON.parse(result);

    expect(parsed.summary).toBeDefined();
    expect(parsed.summary.totalIssues).toBe(5);
    expect(parsed.summary.bySeverity).toEqual({ critical: 2, high: 1, medium: 1, low: 1 });
    expect(parsed.summary.byDimension).toBeDefined();
    expect(typeof parsed.summary.byDimension[ReviewDimension.Logic]).toBe('number');
  });

  // 验收条件 #7: adversaryVerdict 在 JSON 报告中
  it('应包含 adversaryVerdict 字段', () => {
    const report = createMockReport();
    const result = JsonReporter.generate(report);
    const parsed = JSON.parse(result);

    expect(parsed.issues[0].adversaryVerdict).toBe('confirmed');
    expect(parsed.issues[1].adversaryVerdict).toBe('disputed');
    expect(parsed.issues[2].adversaryVerdict).toBe('false_positive');
    // 第四个 issue 没有 adversaryVerdict
    expect(parsed.issues[3].adversaryVerdict).toBeUndefined();
  });
});

// =====================================================
// 验收条件 #5: 0 个问题时 JSON 报告正常
// =====================================================
describe('JsonReporter - 空报告', () => {
  it('应输出 issues:[] 和 totalIssues:0 且不抛异常', () => {
    const emptyReport = createEmptyReport();
    const result = JsonReporter.generate(emptyReport);
    const parsed = JSON.parse(result);

    expect(parsed.issues).toEqual([]);
    expect(parsed.summary.totalIssues).toBe(0);
  });
});

// =====================================================
// 验收条件 #2: Markdown 报告包含概要统计表（合法 Markdown table）
// =====================================================
describe('MarkdownReporter - 统计表格', () => {
  it('应包含 severity 分布表格表头', () => {
    const report = createMockReport();
    const md = MarkdownReporter.generate(report);

    expect(md).toMatch(/\| 级别 \| 数量 \|/);
  });

  it('应包含所有 severity 行', () => {
    const report = createMockReport();
    const md = MarkdownReporter.generate(report);

    expect(md).toContain('| 严重 |');
    expect(md).toContain('| 高 |');
    expect(md).toContain('| 中 |');
    expect(md).toContain('| 低 |');
  });

  it('severity 统计应为非负整数', () => {
    const report = createMockReport();
    const md = MarkdownReporter.generate(report);

    // 匹配 "| 严重 | 2 |" 格式
    const severityPattern = /\| (严重|高|中|低) \| (\d+) \|/g;
    let match;
    let matchCount = 0;
    while ((match = severityPattern.exec(md)) !== null) {
      const count = parseInt(match[2], 10);
      expect(count).toBeGreaterThanOrEqual(0);
      matchCount++;
    }
    expect(matchCount).toBe(4); // 4 个 severity 级别
  });

  it('应包含 dimension 分布表格', () => {
    const report = createMockReport();
    const md = MarkdownReporter.generate(report);

    expect(md).toContain('| 维度 | 数量 |');
    expect(md).toContain('逻辑正确性');
    expect(md).toContain('安全性');
    expect(md).toContain('性能');
  });
});

// =====================================================
// 验收条件 #3: Markdown 按 severity 分组，critical 在 high 之前
// =====================================================
describe('MarkdownReporter - severity 分组排序', () => {
  it('CRITICAL 组应在 HIGH 组之前', () => {
    const report = createMockReport();
    const md = MarkdownReporter.generate(report);

    expect(md.indexOf('CRITICAL')).toBeLessThan(md.indexOf('HIGH'));
  });

  it('HIGH 组应在 MEDIUM 组之前', () => {
    const report = createMockReport();
    const md = MarkdownReporter.generate(report);

    expect(md.indexOf('HIGH')).toBeLessThan(md.indexOf('MEDIUM'));
  });

  it('MEDIUM 组应在 LOW 组之前', () => {
    const report = createMockReport();
    const md = MarkdownReporter.generate(report);

    expect(md.indexOf('MEDIUM')).toBeLessThan(md.indexOf('LOW'));
  });
});

// =====================================================
// 验收条件 #4: 每个 issue 引用文件行号和代码片段
// =====================================================
describe('MarkdownReporter - 行号和代码片段', () => {
  it('应包含文件路径引用', () => {
    const report = createMockReport();
    const md = MarkdownReporter.generate(report);

    expect(md).toContain('`src/foo.ts`');
    expect(md).toContain('`src/bar.ts`');
  });

  it('应包含行号范围 (line-endLine)', () => {
    const report = createMockReport();
    const md = MarkdownReporter.generate(report);

    // src/foo.ts line 42-50
    expect(md).toContain('42-50');
  });

  it('应包含代码块（当有 codeSnippet 时）', () => {
    const report = createMockReport();
    const md = MarkdownReporter.generate(report);

    expect(md).toContain('```');
    expect(md).toContain('缺少空值检查');
  });
});

// =====================================================
// 验收条件 #6: 0 个问题时 Markdown 包含提示文字
// =====================================================
describe('MarkdownReporter - 空报告', () => {
  it('应包含"没有发现问题"提示', () => {
    const emptyReport = createEmptyReport();
    const md = MarkdownReporter.generate(emptyReport);

    expect(md).toContain('没有发现问题');
    expect(md.length).toBeGreaterThan(50);
  });
});

// =====================================================
// 验收条件 #7: adversaryVerdict 在 Markdown 中显示
// =====================================================
describe('MarkdownReporter - adversaryVerdict', () => {
  it('应显示 adversaryVerdict 标签', () => {
    const report = createMockReport();
    const md = MarkdownReporter.generate(report);

    expect(md).toContain('confirmed');
    expect(md).toContain('disputed');
    expect(md).toContain('false_positive');
  });

  it('应包含中文判定标签', () => {
    const report = createMockReport();
    const md = MarkdownReporter.generate(report);

    expect(md).toContain('已确认');
    expect(md).toContain('存疑');
    expect(md).toContain('误报');
  });
});

// =====================================================
// 验收条件 #8: JsonReporter 和 MarkdownReporter 独立可调用
// =====================================================
describe('模块独立性', () => {
  it('JsonReporter 可独立 import 并调用', () => {
    const report = createMockReport();
    const result = JsonReporter.generate(report);
    expect(typeof result).toBe('string');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('MarkdownReporter 可独立 import 并调用', () => {
    const report = createMockReport();
    const result = MarkdownReporter.generate(report);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// =====================================================
// 验收条件 #9: SummaryGenerator 独立可复用
// =====================================================
describe('SummaryGenerator', () => {
  it('应从 ReviewIssue[] 生成正确的 totalIssues', () => {
    const issues = createMockReport().issues;
    const summary = SummaryGenerator.generate(issues);
    expect(summary.totalIssues).toBe(issues.length);
  });

  it('应正确统计 bySeverity', () => {
    const issues = createMockReport().issues;
    const summary = SummaryGenerator.generate(issues);

    expect(summary.bySeverity.critical).toBe(2);
    expect(summary.bySeverity.high).toBe(1);
    expect(summary.bySeverity.medium).toBe(1);
    expect(summary.bySeverity.low).toBe(1);
  });

  it('应正确统计 byDimension', () => {
    const issues = createMockReport().issues;
    const summary = SummaryGenerator.generate(issues);

    expect(summary.byDimension[ReviewDimension.Logic]).toBe(1);
    expect(summary.byDimension[ReviewDimension.Security]).toBe(1);
    expect(summary.byDimension[ReviewDimension.EdgeCases]).toBe(1);
  });

  it('空数组应返回全零', () => {
    const summary = SummaryGenerator.generate([]);
    expect(summary.totalIssues).toBe(0);
    expect(summary.bySeverity.critical).toBe(0);
    expect(summary.bySeverity.high).toBe(0);
  });

  it('generateSummary 便捷函数应等价', () => {
    const issues = createMockReport().issues;
    const s1 = SummaryGenerator.generate(issues);
    const s2 = generateSummary(issues);
    expect(s1).toEqual(s2);
  });
});

// =====================================================
// 验收条件 #10: output/index.ts 统一导出
// =====================================================
describe('output/index.ts 统一导出', () => {
  it('应导出 JsonReporter', () => {
    expect(JsonFromIndex).toBeDefined();
    expect(typeof JsonFromIndex.generate).toBe('function');
  });

  it('应导出 MarkdownReporter', () => {
    expect(MdFromIndex).toBeDefined();
    expect(typeof MdFromIndex.generate).toBe('function');
  });

  it('应导出 SummaryGenerator', () => {
    expect(SumFromIndex).toBeDefined();
    expect(typeof SumFromIndex.generate).toBe('function');
  });

  it('从 index 导出的组件功能正常', () => {
    const report = createMockReport();
    const json = JsonFromIndex.generate(report);
    const md = MdFromIndex.generate(report);
    const summary = SumFromIndex.generate(report.issues);

    expect(() => JSON.parse(json)).not.toThrow();
    expect(md.length).toBeGreaterThan(0);
    expect(summary.totalIssues).toBe(5);
  });
});
