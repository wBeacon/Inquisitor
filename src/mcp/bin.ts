#!/usr/bin/env node

/**
 * bin.ts - Inquisitor MCP Server 入口
 *
 * 通过 npx inquisitor-mcp 或 node dist/mcp/bin.js 启动 stdio MCP Server。
 * 使用 StdioServerTransport 与客户端通信。
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';

// MCP stdio 模式下 stdout 被 JSON-RPC 协议独占，任何非协议输出都会被客户端
// 视为非法消息（例："Unexpected token 'l', '[logic-agen'... is not valid JSON"）。
// 业务代码散落着大量 console.info/log（Agent 运行时日志、版本管理日志等），
// 统一在入口处把它们重定向到 stderr，避免污染协议通道，同时仍保留日志可观测性。
console.log = console.error;
console.info = console.error;

/**
 * 启动 MCP Server
 */
async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  // 在 stderr 输出 ready 信息（不干扰 stdio JSON-RPC 通信）
  process.stderr.write('Inquisitor MCP Server ready\n');

  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`MCP Server 启动失败: ${error}\n`);
  process.exit(1);
});
