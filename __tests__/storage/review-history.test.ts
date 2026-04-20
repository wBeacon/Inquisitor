import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ReviewHistory } from '../../src/storage/review-history';
import { ReviewReport, ReviewDimension } from '../../src/types/review';

/**
 * 创建最小可用的 ReviewReport 测试数据
 */
function createTestReport(overrides?: Partial<ReviewReport>): ReviewReport {
  return {
    issues: overrides?.issues ?? [
      {
        file: 'src/index.ts',
        line: 10,
        severity: 'high',
        dimension: ReviewDimension.Logic,
        description: '逻辑错误：条件判断有误',
        suggestion: '修改条件判断',
        confidence: 0.9,
      },
    ],
    summary: overrides?.summary ?? {
      bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
      byDimension: { [ReviewDimension.Logic]: 1 } as any,
      totalIssues: 1,
    },
    metadata: overrides?.metadata ?? {
      durationMs: 5000,
      tokenUsage: { input: 1000, output: 500, total: 1500 },
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: '2024-01-01T00:00:05Z',
      agents: ['logic-agent'],
    },
    metaReview: overrides?.metaReview ?? {
      qualityGrade: 'B',
      rootCauses: ['根因分析'],
      verdict: 'request_changes',
      dismissedIssueIndices: [],
    },
  };
}

/**
 * 创建唯一临时目录
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'inquisitor-test-'));
}

describe('ReviewHistory', () => {
  let tempDir: string;
  let history: ReviewHistory;

  beforeEach(() => {
    tempDir = createTempDir();
    history = new ReviewHistory({ storagePath: tempDir });
  });

  afterEach(() => {
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('目录自动创建', () => {
    it('save 时自动创建不存在的目录', () => {
      const nestedDir = path.join(tempDir, 'nested', 'deep', 'history');
      const h = new ReviewHistory({ storagePath: nestedDir });
      const report = createTestReport();
      h.save(report, { projectId: 'test-project' });

      expect(fs.existsSync(nestedDir)).toBe(true);
    });

    it('list 时自动创建不存在的目录', () => {
      const newDir = path.join(tempDir, 'new-dir');
      const h = new ReviewHistory({ storagePath: newDir });
      const result = h.list();

      expect(result).toEqual([]);
      expect(fs.existsSync(newDir)).toBe(true);
    });
  });

  describe('save', () => {
    it('保存报告并返回 ID', () => {
      const report = createTestReport();
      const id = history.save(report, { projectId: 'my-project' });

      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('保存包含完整元数据的记录', () => {
      const report = createTestReport();
      const id = history.save(report, {
        projectId: 'my-project',
        commitHash: 'abc123',
        branch: 'main',
        files: ['src/index.ts'],
        tags: ['v1.0'],
      });

      const record = history.load(id);
      expect(record).not.toBeNull();
      expect(record!.projectId).toBe('my-project');
      expect(record!.commitHash).toBe('abc123');
      expect(record!.branch).toBe('main');
      expect(record!.files).toEqual(['src/index.ts']);
      expect(record!.tags).toEqual(['v1.0']);
    });

    it('保存的记录包含时间戳', () => {
      const report = createTestReport();
      const id = history.save(report, { projectId: 'test' });
      const record = history.load(id);

      expect(record!.timestamp).toBeTruthy();
      // 验证是有效的 ISO 日期
      expect(new Date(record!.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('load', () => {
    it('加载已保存的记录', () => {
      const report = createTestReport();
      const id = history.save(report, { projectId: 'test' });
      const record = history.load(id);

      expect(record).not.toBeNull();
      expect(record!.id).toBe(id);
      expect(record!.report.issues).toHaveLength(1);
      expect(record!.report.summary.totalIssues).toBe(1);
    });

    it('不存在的 ID 返回 null', () => {
      const result = history.load('nonexistent-id');
      expect(result).toBeNull();
    });

    it('损坏数据返回 null（容错）', () => {
      // 手动写入损坏的 JSON 文件
      const fakeId = 'corrupted-record';
      const filePath = path.join(tempDir, `${fakeId}.json`);
      fs.writeFileSync(filePath, '{invalid json!!!', 'utf-8');

      const result = history.load(fakeId);
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('删除已存在的记录', () => {
      const report = createTestReport();
      const id = history.save(report, { projectId: 'test' });
      expect(history.load(id)).not.toBeNull();

      const deleted = history.delete(id);
      expect(deleted).toBe(true);
      expect(history.load(id)).toBeNull();
    });

    it('删除不存在的记录返回 false', () => {
      const result = history.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('list 和 filter', () => {
    beforeEach(() => {
      // 准备测试数据
      const reportA = createTestReport({
        metaReview: {
          qualityGrade: 'A',
          rootCauses: [],
          verdict: 'approve',
          dismissedIssueIndices: [],
        },
      });
      const reportB = createTestReport({
        metaReview: {
          qualityGrade: 'C',
          rootCauses: [],
          verdict: 'request_changes',
          dismissedIssueIndices: [],
        },
      });

      history.save(reportA, {
        projectId: 'project-alpha',
        branch: 'main',
        tags: ['release'],
      });
      history.save(reportB, {
        projectId: 'project-beta',
        branch: 'dev',
        tags: ['wip'],
      });
      history.save(reportA, {
        projectId: 'project-alpha',
        branch: 'feature-x',
        tags: ['release', 'hotfix'],
      });
    });

    it('list 不带过滤返回所有记录', () => {
      const all = history.list();
      expect(all).toHaveLength(3);
    });

    it('list 返回的是摘要信息，不含完整 issues', () => {
      const all = history.list();
      const summary = all[0];
      expect(summary.id).toBeTruthy();
      expect(summary.projectId).toBeTruthy();
      expect(summary.totalIssues).toBeDefined();
      expect(summary.severityCounts).toBeDefined();
      // 摘要不应有 report 字段
      expect((summary as any).report).toBeUndefined();
    });

    it('filter 按 projectId 过滤', () => {
      const filtered = history.list({ projectId: 'project-alpha' });
      expect(filtered).toHaveLength(2);
      filtered.forEach((s: any) => expect(s.projectId).toBe('project-alpha'));
    });

    it('filter 按 qualityGrade 过滤', () => {
      const filtered = history.list({ qualityGrade: 'C' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].qualityGrade).toBe('C');
    });

    it('filter 按 branch 过滤', () => {
      const filtered = history.list({ branch: 'main' });
      expect(filtered).toHaveLength(1);
    });

    it('filter 按标签过滤', () => {
      const filtered = history.list({ tags: ['release'] });
      expect(filtered).toHaveLength(2);
    });

    it('filter 按时间范围过滤', () => {
      // 所有记录都是刚创建的，用一个未来的截止时间
      const filtered = history.list({
        startDate: new Date(Date.now() - 60000).toISOString(),
        endDate: new Date(Date.now() + 60000).toISOString(),
      });
      expect(filtered).toHaveLength(3);

      // 用一个过去的时间范围，不应有结果
      const emptyFiltered = history.list({
        startDate: '2020-01-01T00:00:00Z',
        endDate: '2020-01-02T00:00:00Z',
      });
      expect(emptyFiltered).toHaveLength(0);
    });

    it('list 返回结果按时间倒序', () => {
      const all = history.list();
      for (let i = 1; i < all.length; i++) {
        const prevTime = new Date(all[i - 1].timestamp).getTime();
        const currTime = new Date(all[i].timestamp).getTime();
        expect(prevTime).toBeGreaterThanOrEqual(currTime);
      }
    });
  });

  describe('并发写入安全', () => {
    it('多次同时 save 不会互相覆盖', () => {
      const report = createTestReport();
      const ids: string[] = [];

      // 模拟并发写入（同步但快速连续）
      for (let i = 0; i < 10; i++) {
        const id = history.save(report, { projectId: `project-${i}` });
        ids.push(id);
      }

      // 每个 ID 应该唯一
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);

      // 每条记录都应该可以正确加载
      for (const id of ids) {
        const record = history.load(id);
        expect(record).not.toBeNull();
      }

      // list 应该返回全部 10 条
      const all = history.list();
      expect(all).toHaveLength(10);
    });
  });

  describe('损坏数据容错', () => {
    it('list 跳过损坏的文件', () => {
      // 先保存一条正常记录
      const report = createTestReport();
      history.save(report, { projectId: 'good' });

      // 手动写入一个损坏的文件
      fs.writeFileSync(path.join(tempDir, 'bad-record.json'), 'NOT JSON', 'utf-8');

      // list 应该只返回正常的那条
      const all = history.list();
      expect(all).toHaveLength(1);
      expect(all[0].projectId).toBe('good');
    });

    it('空 JSON 文件不会导致崩溃', () => {
      fs.writeFileSync(path.join(tempDir, 'empty.json'), '', 'utf-8');
      const all = history.list();
      expect(all).toHaveLength(0);
    });
  });

  describe('自定义存储路径', () => {
    it('支持通过配置自定义路径', () => {
      const customDir = path.join(tempDir, 'custom-storage');
      const h = new ReviewHistory({ storagePath: customDir });

      expect(h.getStoragePath()).toBe(customDir);

      const report = createTestReport();
      h.save(report, { projectId: 'test' });

      expect(fs.existsSync(customDir)).toBe(true);
      const files = fs.readdirSync(customDir);
      expect(files.length).toBe(1);
    });
  });
});
