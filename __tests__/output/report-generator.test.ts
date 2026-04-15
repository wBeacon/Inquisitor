import * as fs from 'fs';
import * as path from 'path';
import { ReportGenerator, GeneratorConfig } from '../../src/output';
import { ReviewReport, ReviewDimension, ReviewIssue } from '../../src/types';

describe('ReportGenerator', () => {
  const mockReport: ReviewReport = {
    issues: [
      {
        file: 'src/test.ts',
        line: 10,
        severity: 'critical',
        dimension: ReviewDimension.Logic,
        description: 'Null pointer exception risk',
        suggestion: 'Add null check before accessing property',
        confidence: 0.95,
        foundBy: 'logic-agent',
        codeSnippet: 'const value = obj.property; // missing null check',
      },
      {
        file: 'src/test.ts',
        line: 20,
        severity: 'high',
        dimension: ReviewDimension.Security,
        description: 'SQL injection vulnerability',
        suggestion: 'Use parameterized queries',
        confidence: 0.88,
        foundBy: 'security-agent',
        codeSnippet: "const query = `SELECT * FROM users WHERE id = ${userId}`;",
      },
      {
        file: 'src/utils.ts',
        line: 5,
        severity: 'medium',
        dimension: ReviewDimension.Performance,
        description: 'Inefficient loop',
        suggestion: 'Use map() instead of nested loops',
        confidence: 0.75,
        foundBy: 'performance-agent',
      },
      {
        file: 'src/utils.ts',
        line: 15,
        severity: 'low',
        dimension: ReviewDimension.Maintainability,
        description: 'Variable name is unclear',
        suggestion: 'Rename x to itemCount',
        confidence: 0.65,
        foundBy: 'maintainability-agent',
      },
    ],
    summary: {
      totalIssues: 4,
      bySeverity: {
        critical: 1,
        high: 1,
        medium: 1,
        low: 1,
      },
      byDimension: {
        [ReviewDimension.Logic]: 1,
        [ReviewDimension.Security]: 1,
        [ReviewDimension.Performance]: 1,
        [ReviewDimension.Maintainability]: 1,
        [ReviewDimension.EdgeCases]: 0,
      },
    },
    metadata: {
      durationMs: 5000,
      tokenUsage: {
        input: 10000,
        output: 5000,
        total: 15000,
      },
      startedAt: new Date(Date.now() - 5000).toISOString(),
      completedAt: new Date().toISOString(),
      agents: ['logic-agent', 'security-agent', 'performance-agent', 'maintainability-agent', 'adversary-agent'],
    },
  };

  const emptyReport: ReviewReport = {
    issues: [],
    summary: {
      totalIssues: 0,
      bySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
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
      tokenUsage: {
        input: 1000,
        output: 500,
        total: 1500,
      },
      startedAt: new Date(Date.now() - 100).toISOString(),
      completedAt: new Date().toISOString(),
      agents: ['logic-agent', 'security-agent'],
    },
  };

  describe('configuration', () => {
    it('should have default configuration', () => {
      const generator = new ReportGenerator();
      const config = generator.getConfig();

      expect(config.formats).toEqual(['markdown']);
      expect(config.theme).toBe('light');
      expect(config.includeCodeSnippets).toBe(true);
    });

    it('should support custom configuration', () => {
      const customConfig: GeneratorConfig = {
        formats: ['json', 'markdown'],
        theme: 'dark',
        includeCodeSnippets: false,
      };

      const generator = new ReportGenerator(customConfig);
      const config = generator.getConfig();

      expect(config.formats).toEqual(['json', 'markdown']);
      expect(config.theme).toBe('dark');
      expect(config.includeCodeSnippets).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should generate valid JSON string', () => {
      const generator = new ReportGenerator();
      const json = generator.toJSON(mockReport);

      expect(typeof json).toBe('string');
      expect(() => JSON.parse(json)).not.toThrow();

      const parsed = JSON.parse(json);
      expect(parsed.issues).toHaveLength(4);
      expect(parsed.summary).toBeDefined();
      expect(parsed.metadata).toBeDefined();
    });

    it('should preserve all report data in JSON', () => {
      const generator = new ReportGenerator();
      const json = generator.toJSON(mockReport);
      const parsed = JSON.parse(json);

      expect(parsed.issues[0]).toEqual(mockReport.issues[0]);
      expect(parsed.summary).toEqual(mockReport.summary);
      expect(parsed.metadata.agents).toEqual(mockReport.metadata.agents);
    });

    it('should handle empty report', () => {
      const generator = new ReportGenerator();
      const json = generator.toJSON(emptyReport);

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.issues).toHaveLength(0);
      expect(parsed.summary.totalIssues).toBe(0);
    });

    it('should use custom JSON indent', () => {
      const generator = new ReportGenerator({
        templates: { jsonIndent: 4 },
      });
      const json = generator.toJSON(mockReport);

      // Check indentation by looking for 4-space indent
      expect(json).toMatch(/\n    /);
    });
  });

  describe('toMarkdown', () => {
    it('should generate Markdown string', () => {
      const generator = new ReportGenerator();
      const markdown = generator.toMarkdown(mockReport);

      expect(typeof markdown).toBe('string');
      expect(markdown.length).toBeGreaterThan(0);
    });

    it('should include title in Markdown', () => {
      const generator = new ReportGenerator();
      const markdown = generator.toMarkdown(mockReport);

      expect(markdown).toContain('# 代码审查报告');
    });

    it('should include executive summary', () => {
      const generator = new ReportGenerator();
      const markdown = generator.toMarkdown(mockReport);

      expect(markdown).toContain('## 执行摘要');
      expect(markdown).toContain('发现问题总数');
      expect(markdown).toContain('严重');
      expect(markdown).toContain('高');
    });

    it('should include statistics section', () => {
      const generator = new ReportGenerator();
      const markdown = generator.toMarkdown(mockReport);

      expect(markdown).toContain('## 统计数据');
      expect(markdown).toContain('按严重程度分布');
      expect(markdown).toContain('按审查维度分布');
    });

    it('should include issues section with severity emoji', () => {
      const generator = new ReportGenerator();
      const markdown = generator.toMarkdown(mockReport);

      expect(markdown).toContain('## 问题详情');
      expect(markdown).toContain('🔴 CRITICAL');
      expect(markdown).toContain('🟠 HIGH');
      expect(markdown).toContain('Null pointer exception risk');
    });

    it('should include code snippets when enabled', () => {
      const generator = new ReportGenerator({ includeCodeSnippets: true });
      const markdown = generator.toMarkdown(mockReport);

      expect(markdown).toContain('missing null check');
      expect(markdown).toContain('```');
    });

    it('should exclude code snippets when disabled', () => {
      const generator = new ReportGenerator({ includeCodeSnippets: false });
      const markdown = generator.toMarkdown(mockReport);

      // Code snippet content should not be included
      expect(markdown).not.toContain('missing null check');
    });

    it('should include metadata section', () => {
      const generator = new ReportGenerator();
      const markdown = generator.toMarkdown(mockReport);

      expect(markdown).toContain('## 审查元数据');
      expect(markdown).toContain('审查开始时间');
      expect(markdown).toContain('审查完成时间');
      expect(markdown).toContain('总耗时');
      expect(markdown).toContain('Token 消耗');
      expect(markdown).toContain('参与的 Agent');
    });

    it('should group issues by dimension', () => {
      const generator = new ReportGenerator();
      const markdown = generator.toMarkdown(mockReport);

      expect(markdown).toContain('## 按维度分类');
      expect(markdown).toContain('逻辑正确性');
      expect(markdown).toContain('安全性');
      expect(markdown).toContain('性能');
      expect(markdown).toContain('可维护性');
    });

    it('should handle empty report', () => {
      const generator = new ReportGenerator();
      const markdown = generator.toMarkdown(emptyReport);

      expect(markdown).toContain('# 代码审查报告');
      expect(markdown).toContain('✅ 没有发现问题');
      expect(markdown).toContain('问题详情');
      expect(markdown).toContain('没有发现问题');
    });

    it('should include custom title', () => {
      const generator = new ReportGenerator({
        templates: { markdownTitle: 'Custom Review Report' },
      });
      const markdown = generator.toMarkdown(mockReport);

      expect(markdown).toContain('# Custom Review Report');
    });

    it('should include confidence scores in issue list', () => {
      const generator = new ReportGenerator();
      const markdown = generator.toMarkdown(mockReport);

      expect(markdown).toContain('95.0%');
      expect(markdown).toContain('88.0%');
      expect(markdown).toContain('75.0%');
    });

    it('should include foundBy agent info', () => {
      const generator = new ReportGenerator();
      const markdown = generator.toMarkdown(mockReport);

      expect(markdown).toContain('logic-agent');
      expect(markdown).toContain('security-agent');
    });
  });

  describe('toFile', () => {
    const testDir = path.join(__dirname, '../../temp-reports');

    beforeEach(() => {
      // Clean up any existing test directory
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
    });

    afterEach(() => {
      // Clean up test directory
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
    });

    it('should create directory if not exists', async () => {
      const generator = new ReportGenerator({ formats: ['json'] });
      await generator.toFile(mockReport, testDir);

      expect(fs.existsSync(testDir)).toBe(true);
    });

    it('should write JSON file when format is json', async () => {
      const generator = new ReportGenerator({ formats: ['json'] });
      await generator.toFile(mockReport, testDir);

      const files = fs.readdirSync(testDir);
      const jsonFile = files.find((f) => f.endsWith('.json'));

      expect(jsonFile).toBeDefined();
      const content = fs.readFileSync(path.join(testDir, jsonFile!), 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should write Markdown file when format is markdown', async () => {
      const generator = new ReportGenerator({ formats: ['markdown'] });
      await generator.toFile(mockReport, testDir);

      const files = fs.readdirSync(testDir);
      const mdFile = files.find((f) => f.endsWith('.md'));

      expect(mdFile).toBeDefined();
      const content = fs.readFileSync(path.join(testDir, mdFile!), 'utf-8');
      expect(content).toContain('# 代码审查报告');
    });

    it('should write both formats when specified', async () => {
      const generator = new ReportGenerator({ formats: ['json', 'markdown'] });
      await generator.toFile(mockReport, testDir);

      const files = fs.readdirSync(testDir);
      expect(files.some((f) => f.endsWith('.json'))).toBe(true);
      expect(files.some((f) => f.endsWith('.md'))).toBe(true);
    });

    it('should use custom prefix', async () => {
      const generator = new ReportGenerator({ formats: ['json'] });
      await generator.toFile(mockReport, testDir, 'custom-review');

      const files = fs.readdirSync(testDir);
      expect(files[0]).toMatch(/^custom-review-/);
    });

    it('should include timestamp in filename', async () => {
      const generator = new ReportGenerator({ formats: ['json'] });
      await generator.toFile(mockReport, testDir);

      const files = fs.readdirSync(testDir);
      // Timestamp format: YYYY-MM-DDTHH-MM-SS.sssZ
      expect(files[0]).toMatch(/review-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
    });

    it('should write empty report successfully', async () => {
      const generator = new ReportGenerator({ formats: ['json', 'markdown'] });
      await generator.toFile(emptyReport, testDir);

      const files = fs.readdirSync(testDir);
      expect(files.length).toBe(2); // json and markdown
    });
  });

  describe('edge cases', () => {
    it('should handle issues without code snippets', () => {
      const reportWithoutSnippets: ReviewReport = {
        ...mockReport,
        issues: [
          {
            file: 'test.ts',
            line: 10,
            severity: 'high',
            dimension: ReviewDimension.Logic,
            description: 'Test issue',
            suggestion: 'Fix it',
            confidence: 0.8,
          },
        ],
      };

      const generator = new ReportGenerator({ includeCodeSnippets: true });
      const markdown = generator.toMarkdown(reportWithoutSnippets);

      expect(markdown).toContain('Test issue');
      expect(() => generator.toJSON(reportWithoutSnippets)).not.toThrow();
    });

    it('should handle issues without foundBy', () => {
      const reportWithoutFoundBy: ReviewReport = {
        ...mockReport,
        issues: [
          {
            file: 'test.ts',
            line: 10,
            severity: 'high',
            dimension: ReviewDimension.Logic,
            description: 'Test issue',
            suggestion: 'Fix it',
            confidence: 0.8,
          },
        ],
      };

      const generator = new ReportGenerator();
      const markdown = generator.toMarkdown(reportWithoutFoundBy);

      expect(markdown).toContain('Test issue');
    });

    it('should handle very long issue descriptions', () => {
      const longDescription =
        'This is a very long description that should be properly handled without breaking the markdown format. ' +
        'It contains multiple sentences and should render correctly in both JSON and Markdown formats.';

      const reportWithLongDescription: ReviewReport = {
        ...mockReport,
        issues: [
          {
            file: 'test.ts',
            line: 10,
            severity: 'high',
            dimension: ReviewDimension.Logic,
            description: longDescription,
            suggestion: 'Fix it',
            confidence: 0.8,
          },
        ],
      };

      const generator = new ReportGenerator();
      const markdown = generator.toMarkdown(reportWithLongDescription);
      const json = generator.toJSON(reportWithLongDescription);

      expect(markdown).toContain(longDescription);
      expect(JSON.parse(json).issues[0].description).toBe(longDescription);
    });
  });
});
