/**
 * health.test.ts - health 工具单元测试
 *
 * 测试健康检查功能：uptime、内存使用、版本信息等
 */

import { handleHealth, buildHealthInfo, HealthInfo } from '../../../src/mcp/tools/health';

describe('health 工具', () => {
  describe('buildHealthInfo', () => {
    it('应该返回包含所有必要字段的健康信息', () => {
      const info = buildHealthInfo();

      expect(info).toHaveProperty('status', 'ok');
      expect(info).toHaveProperty('uptime');
      expect(info).toHaveProperty('memoryUsage');
      expect(info).toHaveProperty('nodeVersion');
      expect(info).toHaveProperty('serverVersion');
      expect(info).toHaveProperty('timestamp');
    });

    it('uptime 应该是大于等于 0 的数值（秒）', () => {
      const info = buildHealthInfo();

      expect(typeof info.uptime).toBe('number');
      expect(info.uptime).toBeGreaterThanOrEqual(0);
    });

    it('memoryUsage 应该包含 heapUsed、heapTotal、rss，值为正整数', () => {
      const info = buildHealthInfo();
      const mem = info.memoryUsage;

      expect(mem).toHaveProperty('heapUsed');
      expect(mem).toHaveProperty('heapTotal');
      expect(mem).toHaveProperty('rss');

      expect(typeof mem.heapUsed).toBe('number');
      expect(typeof mem.heapTotal).toBe('number');
      expect(typeof mem.rss).toBe('number');

      expect(mem.heapUsed).toBeGreaterThan(0);
      expect(mem.heapTotal).toBeGreaterThan(0);
      expect(mem.rss).toBeGreaterThan(0);

      // 应该是整数（字节数）
      expect(Number.isInteger(mem.heapUsed)).toBe(true);
      expect(Number.isInteger(mem.heapTotal)).toBe(true);
      expect(Number.isInteger(mem.rss)).toBe(true);
    });

    it('nodeVersion 应该是以 v 开头的版本字符串', () => {
      const info = buildHealthInfo();

      expect(typeof info.nodeVersion).toBe('string');
      expect(info.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
      expect(info.nodeVersion).toBe(process.version);
    });

    it('serverVersion 应该是有效的版本字符串', () => {
      const info = buildHealthInfo();

      expect(typeof info.serverVersion).toBe('string');
      expect(info.serverVersion).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('timestamp 应该是有效的 ISO 日期字符串', () => {
      const info = buildHealthInfo();

      expect(typeof info.timestamp).toBe('string');
      const parsed = new Date(info.timestamp);
      expect(parsed.toISOString()).toBe(info.timestamp);
    });

    it('status 应该固定为 ok', () => {
      const info = buildHealthInfo();
      expect(info.status).toBe('ok');
    });
  });

  describe('handleHealth', () => {
    it('应该返回包含 content 数组的响应', async () => {
      const result = await handleHealth({});

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
    });

    it('content 类型应该为 text', async () => {
      const result = await handleHealth({});

      expect(result.content[0].type).toBe('text');
    });

    it('content 文本应该是有效的 JSON', async () => {
      const result = await handleHealth({});
      const parsed = JSON.parse(result.content[0].text) as HealthInfo;

      expect(parsed).toHaveProperty('status', 'ok');
      expect(parsed).toHaveProperty('uptime');
      expect(parsed).toHaveProperty('memoryUsage');
      expect(parsed).toHaveProperty('nodeVersion');
      expect(parsed).toHaveProperty('serverVersion');
    });

    it('返回的 JSON 中 uptime 应该大于等于 0', async () => {
      const result = await handleHealth({});
      const parsed = JSON.parse(result.content[0].text) as HealthInfo;

      expect(parsed.uptime).toBeGreaterThanOrEqual(0);
    });

    it('返回的 JSON 中内存数据应该是正整数字节数', async () => {
      const result = await handleHealth({});
      const parsed = JSON.parse(result.content[0].text) as HealthInfo;

      expect(parsed.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(parsed.memoryUsage.heapTotal).toBeGreaterThan(0);
      expect(parsed.memoryUsage.rss).toBeGreaterThan(0);
    });
  });
});
