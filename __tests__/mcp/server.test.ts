/**
 * server.test.ts - MCP Server 初始化和工具注册测试
 */

import { createServer } from '../../src/mcp/server';

// mock MCP SDK 避免实际启动 server
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  // 模拟注册的工具列表
  const registeredTools: Array<{ name: string; description: string; schema: unknown }> = [];

  class MockMcpServer {
    tool(name: string, description: string, schema: unknown, handler: unknown) {
      registeredTools.push({ name, description, schema });
    }

    async connect() {
      // 不执行实际连接
    }

    async close() {
      // 不执行实际关闭
    }
  }

  return {
    McpServer: MockMcpServer,
    __registeredTools: registeredTools,
  };
});

describe('MCP Server', () => {
  beforeEach(() => {
    // 清空注册的工具
    const sdk = require('@modelcontextprotocol/sdk/server/mcp.js');
    sdk.__registeredTools.length = 0;
  });

  describe('createServer', () => {
    it('应该创建 MCP Server 实例', () => {
      const server = createServer();
      expect(server).toBeDefined();
    });

    it('应该注册七个工具: review_diff, review_files, configure, prompt_versioning, config_versioning, health, stats', () => {
      createServer();
      const sdk = require('@modelcontextprotocol/sdk/server/mcp.js');
      const tools = sdk.__registeredTools;

      expect(tools).toHaveLength(7);

      const names = tools.map((t: { name: string }) => t.name).sort();
      expect(names).toEqual(['config_versioning', 'configure', 'health', 'prompt_versioning', 'review_diff', 'review_files', 'stats']);
    });

    it('每个工具都应该有描述信息', () => {
      createServer();
      const sdk = require('@modelcontextprotocol/sdk/server/mcp.js');
      const tools = sdk.__registeredTools;

      for (const tool of tools) {
        expect(tool.description).toBeTruthy();
        expect(typeof tool.description).toBe('string');
      }
    });

    it('每个工具都应该有 schema 定义', () => {
      createServer();
      const sdk = require('@modelcontextprotocol/sdk/server/mcp.js');
      const tools = sdk.__registeredTools;

      for (const tool of tools) {
        expect(tool.schema).toBeDefined();
        expect(typeof tool.schema).toBe('object');
      }
    });

    it('多次调用 createServer 应该创建独立实例', () => {
      const server1 = createServer();
      const sdk = require('@modelcontextprotocol/sdk/server/mcp.js');
      const count1 = sdk.__registeredTools.length;

      const server2 = createServer();
      const count2 = sdk.__registeredTools.length;

      // 每次 createServer 都会注册新的工具（7 个工具）
      expect(count2).toBe(count1 + 7);
      expect(server1).not.toBe(server2);
    });
  });

  describe('错误恢复', () => {
    it('Server 创建不应抛出异常', () => {
      expect(() => createServer()).not.toThrow();
    });
  });
});
