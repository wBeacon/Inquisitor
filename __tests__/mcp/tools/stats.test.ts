/**
 * stats.test.ts - stats 工具单元测试
 *
 * 测试审查统计功能：记录、查询、重置、持久化、导出等
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  handleStats,
  getStats,
  resetStatsInternal,
  setStatsFilePath,
  loadStatsFromDisk,
  saveStatsToDisk,
  getStatsFilePath,
  STATS_FILE_NAME,
  ReviewStats,
} from '../../../src/mcp/tools/stats';

describe('stats 工具', () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(() => {
    // 使用临时目录避免污染项目
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inquisitor-stats-'));
    tmpFile = path.join(tmpDir, STATS_FILE_NAME);
    setStatsFilePath(tmpFile);
    resetStatsInternal();
  });

  afterEach(() => {
    // 清理临时文件
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('get 操作', () => {
    it('初始状态下应该返回零值统计', async () => {
      const result = await handleStats({ action: 'get' });
      const stats = JSON.parse(result.content[0].text) as ReviewStats;

      expect(stats.totalReviews).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(0);
      expect(stats.averageDurationMs).toBe(0);
      expect(stats.totalDurationMs).toBe(0);
      expect(stats.issuesByDimension).toEqual({});
      expect(stats.issuesBySeverity).toEqual({});
      expect(stats.lastReviewAt).toBeNull();
    });

    it('应该返回包含所有必要字段的统计数据', async () => {
      const result = await handleStats({ action: 'get' });
      const stats = JSON.parse(result.content[0].text) as ReviewStats;

      expect(stats).toHaveProperty('totalReviews');
      expect(stats).toHaveProperty('successCount');
      expect(stats).toHaveProperty('failureCount');
      expect(stats).toHaveProperty('averageDurationMs');
      expect(stats).toHaveProperty('issuesByDimension');
      expect(stats).toHaveProperty('issuesBySeverity');
    });
  });

  describe('record 操作', () => {
    it('应该正确记录成功的审查', async () => {
      await handleStats({
        action: 'record',
        reviewResult: {
          success: true,
          durationMs: 1000,
          issuesByDimension: { logic: 2, security: 1 },
          issuesBySeverity: { high: 1, medium: 2 },
        },
      });

      const stats = getStats();
      expect(stats.totalReviews).toBe(1);
      expect(stats.successCount).toBe(1);
      expect(stats.failureCount).toBe(0);
      expect(stats.averageDurationMs).toBe(1000);
      expect(stats.issuesByDimension).toEqual({ logic: 2, security: 1 });
      expect(stats.issuesBySeverity).toEqual({ high: 1, medium: 2 });
    });

    it('应该正确记录失败的审查', async () => {
      await handleStats({
        action: 'record',
        reviewResult: {
          success: false,
          durationMs: 500,
        },
      });

      const stats = getStats();
      expect(stats.totalReviews).toBe(1);
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(1);
    });

    it('多次记录应该正确累加统计', async () => {
      // 第一次审查
      await handleStats({
        action: 'record',
        reviewResult: {
          success: true,
          durationMs: 1000,
          issuesByDimension: { logic: 2 },
          issuesBySeverity: { high: 1 },
        },
      });

      // 第二次审查
      await handleStats({
        action: 'record',
        reviewResult: {
          success: true,
          durationMs: 3000,
          issuesByDimension: { logic: 3, security: 1 },
          issuesBySeverity: { high: 2, low: 1 },
        },
      });

      const stats = getStats();
      expect(stats.totalReviews).toBe(2);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(0);
      expect(stats.averageDurationMs).toBe(2000); // (1000+3000)/2
      expect(stats.issuesByDimension).toEqual({ logic: 5, security: 1 });
      expect(stats.issuesBySeverity).toEqual({ high: 3, low: 1 });
    });

    it('无审查记录时 averageDurationMs 应该为 0', () => {
      const stats = getStats();
      expect(stats.averageDurationMs).toBe(0);
    });

    it('缺少 reviewResult 参数时应该返回错误', async () => {
      const result = await handleStats({ action: 'record' });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBeDefined();
    });
  });

  describe('reset 操作', () => {
    it('reset 后所有计数应该归零', async () => {
      // 先记录一些数据
      await handleStats({
        action: 'record',
        reviewResult: {
          success: true,
          durationMs: 1000,
          issuesByDimension: { logic: 5 },
          issuesBySeverity: { critical: 2 },
        },
      });

      // 确认有数据
      let stats = getStats();
      expect(stats.totalReviews).toBe(1);

      // 重置
      await handleStats({ action: 'reset' });

      // 验证所有数据归零
      stats = getStats();
      expect(stats.totalReviews).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(0);
      expect(stats.averageDurationMs).toBe(0);
      expect(stats.totalDurationMs).toBe(0);
      expect(stats.issuesByDimension).toEqual({});
      expect(stats.issuesBySeverity).toEqual({});
      expect(stats.lastReviewAt).toBeNull();
    });

    it('reset 应该同时清除持久化文件中的数据', async () => {
      await handleStats({
        action: 'record',
        reviewResult: { success: true, durationMs: 500 },
      });
      await handleStats({ action: 'reset' });

      // 从磁盘重新加载
      resetStatsInternal();
      loadStatsFromDisk();

      const stats = getStats();
      expect(stats.totalReviews).toBe(0);
    });
  });

  describe('export 操作', () => {
    beforeEach(async () => {
      // 添加一些测试数据
      await handleStats({
        action: 'record',
        reviewResult: {
          success: true,
          durationMs: 2000,
          issuesByDimension: { logic: 3, security: 1 },
          issuesBySeverity: { high: 2, medium: 2 },
        },
      });
    });

    it('默认应该导出 Prometheus 格式', async () => {
      const result = await handleStats({ action: 'export' });
      const text = result.content[0].text;

      expect(text).toContain('inquisitor_reviews_total');
      expect(text).toContain('inquisitor_reviews_success_total');
      expect(text).toContain('inquisitor_reviews_failure_total');
      expect(text).toContain('inquisitor_review_duration_ms_avg');
      expect(text).toContain('# TYPE');
      expect(text).toContain('# HELP');
    });

    it('Prometheus 格式应该包含维度和严重程度标签', async () => {
      const result = await handleStats({ action: 'export' });
      const text = result.content[0].text;

      expect(text).toContain('inquisitor_issues_by_dimension{dimension="logic"} 3');
      expect(text).toContain('inquisitor_issues_by_dimension{dimension="security"} 1');
      expect(text).toContain('inquisitor_issues_by_severity{severity="high"} 2');
      expect(text).toContain('inquisitor_issues_by_severity{severity="medium"} 2');
    });

    it('指定 json 格式应该返回结构化 JSON', async () => {
      const result = await handleStats({ action: 'export', format: 'json' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.inquisitor_reviews_total).toBe(1);
      expect(parsed.inquisitor_reviews_success_total).toBe(1);
      expect(parsed.inquisitor_reviews_failure_total).toBe(0);
      expect(parsed.inquisitor_review_duration_ms_avg).toBe(2000);
      expect(parsed.inquisitor_issues_by_dimension).toEqual({ logic: 3, security: 1 });
      expect(parsed.inquisitor_issues_by_severity).toEqual({ high: 2, medium: 2 });
    });

    it('指定 prometheus 格式应该返回文本指标', async () => {
      const result = await handleStats({ action: 'export', format: 'prometheus' });
      const text = result.content[0].text;

      expect(text).toContain('inquisitor_reviews_total 1');
    });
  });

  describe('持久化', () => {
    it('record 后应该自动写入持久化文件', async () => {
      await handleStats({
        action: 'record',
        reviewResult: { success: true, durationMs: 1500 },
      });

      expect(fs.existsSync(tmpFile)).toBe(true);
      const raw = fs.readFileSync(tmpFile, 'utf-8');
      const persisted = JSON.parse(raw);
      expect(persisted.totalReviews).toBe(1);
    });

    it('重启后应该能恢复统计数据', async () => {
      // 记录数据
      await handleStats({
        action: 'record',
        reviewResult: {
          success: true,
          durationMs: 2000,
          issuesByDimension: { logic: 5 },
          issuesBySeverity: { critical: 1 },
        },
      });

      // 模拟重启：重置内存数据
      resetStatsInternal();
      const beforeLoad = getStats();
      expect(beforeLoad.totalReviews).toBe(0);

      // 从磁盘加载
      const loaded = loadStatsFromDisk();
      expect(loaded).toBe(true);

      // 验证恢复的数据
      const stats = getStats();
      expect(stats.totalReviews).toBe(1);
      expect(stats.successCount).toBe(1);
      expect(stats.averageDurationMs).toBe(2000);
      expect(stats.issuesByDimension).toEqual({ logic: 5 });
      expect(stats.issuesBySeverity).toEqual({ critical: 1 });
    });

    it('持久化文件不存在时 loadStatsFromDisk 应该返回 false', () => {
      const loaded = loadStatsFromDisk();
      expect(loaded).toBe(false);
    });

    it('持久化文件损坏时应该优雅处理', () => {
      fs.writeFileSync(tmpFile, 'invalid json{{{', 'utf-8');
      const loaded = loadStatsFromDisk();
      expect(loaded).toBe(false);

      // 内存数据应该保持为空
      const stats = getStats();
      expect(stats.totalReviews).toBe(0);
    });

    it('saveStatsToDisk 应该正确写入文件', () => {
      const saved = saveStatsToDisk();
      expect(saved).toBe(true);
      expect(fs.existsSync(tmpFile)).toBe(true);
    });

    it('STATS_FILE_NAME 应该是 .inquisitor-stats.json', () => {
      expect(STATS_FILE_NAME).toBe('.inquisitor-stats.json');
    });
  });

  describe('getStats 返回副本', () => {
    it('修改返回值不应影响内部数据', async () => {
      await handleStats({
        action: 'record',
        reviewResult: {
          success: true,
          durationMs: 1000,
          issuesByDimension: { logic: 1 },
        },
      });

      const stats1 = getStats();
      stats1.totalReviews = 999;
      stats1.issuesByDimension.logic = 999;

      const stats2 = getStats();
      expect(stats2.totalReviews).toBe(1);
      expect(stats2.issuesByDimension.logic).toBe(1);
    });
  });
});
