/**
 * server.ts - MCP Server 核心模块
 *
 * 创建并配置 Inquisitor MCP Server 实例，注册工具:
 * - review_diff: 审查 git diff
 * - review_files: 审查指定文件
 * - configure: 查看/修改运行时配置
 * - prompt_versioning: Prompt 版本管理和 A/B 测试
 * - config_versioning: 配置版本管理和回滚
 * - health: 服务器健康检查
 * - stats: 审查统计与监控
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  reviewDiffSchema,
  handleReviewDiff,
  reviewFilesSchema,
  handleReviewFiles,
  configureSchema,
  handleConfigure,
  promptVersioningSchema,
  handlePromptVersioning,
  healthSchema,
  handleHealth,
  statsSchema,
  handleStats,
  configVersioningSchema,
  handleConfigVersioning,
} from './tools';

/**
 * 创建 MCP Server 实例的工厂函数
 * 可被外部程序以库的形式集成
 *
 * @returns 配置好的 McpServer 实例
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: 'inquisitor',
    version: '0.1.0',
  });

  // 注册 review_diff 工具
  server.tool(
    'review_diff',
    '审查 git diff - 对代码变更执行多维度对抗式深度审查',
    reviewDiffSchema,
    async (args) => {
      return handleReviewDiff(args);
    }
  );

  // 注册 review_files 工具
  server.tool(
    'review_files',
    '审查指定文件 - 对文件执行多维度对抗式深度审查',
    reviewFilesSchema,
    async (args) => {
      return handleReviewFiles(args);
    }
  );

  // 注册 configure 工具
  server.tool(
    'configure',
    '查看或修改 Inquisitor 运行时审查配置',
    configureSchema,
    async (args) => {
      return handleConfigure(args);
    }
  );

  // 注册 prompt_versioning 工具
  server.tool(
    'prompt_versioning',
    'Prompt 版本管理和 A/B 测试 - 列出版本、查看历史、对比差异、回滚、启动/查看 A/B 测试',
    promptVersioningSchema,
    async (args) => {
      return handlePromptVersioning(args);
    }
  );

  // 注册 config_versioning 工具
  server.tool(
    'config_versioning',
    '配置版本管理和回滚 - 自动版本快照、历史记录、版本比较、一键回滚',
    configVersioningSchema,
    async (args) => {
      return handleConfigVersioning(args);
    }
  );

  // 注册 health 工具
  server.tool(
    'health',
    '服务器健康检查 - 返回运行时间、内存使用、版本等状态信息',
    healthSchema,
    async (args) => {
      return handleHealth(args);
    }
  );

  // 注册 stats 工具
  server.tool(
    'stats',
    '审查统计与监控 - 查看审查统计、重置数据、导出 Prometheus/JSON 格式指标',
    statsSchema,
    async (args) => {
      return handleStats(args);
    }
  );

  return server;
}
