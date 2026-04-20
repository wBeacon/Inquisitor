/**
 * health.ts - MCP 工具: 服务器健康检查
 *
 * 返回服务器运行状态信息，包括:
 * - uptime: 服务器运行时间（秒）
 * - memoryUsage: 内存使用信息（heapUsed、heapTotal、rss）
 * - nodeVersion: Node.js 版本
 * - serverVersion: 服务器版本
 * - status: 运行状态
 */

import { z } from 'zod';

/** 服务器启动时间戳（毫秒） */
const startTime = Date.now();

/**
 * health 工具的 inputSchema 定义（zod shape）
 * 无需任何输入参数
 */
export const healthSchema = {};

/**
 * 健康检查返回数据接口
 */
export interface HealthInfo {
  status: 'ok';
  uptime: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
  nodeVersion: string;
  serverVersion: string;
  timestamp: string;
}

/**
 * 获取服务器版本号
 * 从 package.json 的 version 字段读取
 */
function getServerVersion(): string {
  try {
    const pkg = require('../../../package.json');
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * 构建健康检查信息
 */
export function buildHealthInfo(): HealthInfo {
  const mem = process.memoryUsage();
  return {
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    memoryUsage: {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
    },
    nodeVersion: process.version,
    serverVersion: getServerVersion(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * 处理 health 工具调用
 * 返回服务器健康状态信息
 */
export async function handleHealth(
  _args: Record<string, never>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const info = buildHealthInfo();

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(info, null, 2),
      },
    ],
  };
}
