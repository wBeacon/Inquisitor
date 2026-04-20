/**
 * configure.ts - MCP 工具: 查看/修改运行时审查配置
 *
 * 支持四种操作：
 * - action: 'get' - 返回当前完整配置 JSON
 * - action: 'set' - 接收 config 对象并合并到运行时配置，同时异步持久化
 * - action: 'export' - 导出当前完整配置的 JSON 字符串
 * - action: 'import' - 导入完整配置 JSON，覆盖当前配置并持久化
 */

import { z } from 'zod';
import { OrchestratorConfig } from '../../orchestrator';
import { resolveConfig } from '../../orchestrator/config';
import {
  persistConfig,
  loadPersistedConfig,
  validateImportConfig,
  persistConfigSync,
} from './config-persistence';

/**
 * 运行时配置存储（模块级单例）
 */
let runtimeConfig: OrchestratorConfig = {};

/**
 * configure 工具的 inputSchema 定义（zod shape）
 */
export const configureSchema = {
  action: z.enum(['get', 'set', 'export', 'import']).describe('操作类型: get 获取配置, set 修改配置, export 导出配置, import 导入配置'),
  config: z
    .object({
      model: z.string().optional().describe('使用的 AI 模型'),
      maxParallel: z.number().int().min(1).max(10).optional().describe('最大并行 Agent 数'),
      agentTimeout: z.number().int().min(10000).optional().describe('单个 Agent 超时时间（毫秒）'),
      enableAdversary: z.boolean().optional().describe('是否启用对抗审查'),
      enableMetaReview: z.boolean().optional().describe('是否启用元审查终审'),
      maxAdversaryRounds: z.number().int().min(1).max(5).optional().describe('对抗审查最大轮数'),
      severityThreshold: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('最低严重程度阈值'),
      provider: z
        .object({
          type: z.enum(['anthropic']),
          model: z.string().optional(),
          baseUrl: z.string().optional(),
          apiKey: z.string().optional(),
        })
        .optional()
        .describe('LLM Provider 配置（默认 anthropic）'),
    })
    .optional()
    .describe('要设置的配置（action=set 时为部分配置, action=import 时为完整配置）'),
};

/**
 * 获取当前运行时配置（用于测试和外部访问）
 */
export function getRuntimeConfig(): OrchestratorConfig {
  return { ...runtimeConfig };
}

/**
 * 重置运行时配置（用于测试）
 */
export function resetRuntimeConfig(): void {
  runtimeConfig = {};
}

/**
 * 初始化运行时配置（从持久化文件加载）
 * 应在 Server 启动时调用
 * @param basePath 项目根目录路径
 */
export function initRuntimeConfigFromPersisted(basePath?: string): void {
  const persisted = loadPersistedConfig(basePath);
  if (Object.keys(persisted).length > 0) {
    runtimeConfig = { ...persisted };
  }
}

/**
 * configure 工具的处理函数
 */
export async function handleConfigure(args: {
  action: 'get' | 'set' | 'export' | 'import';
  config?: Partial<OrchestratorConfig>;
}): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    if (args.action === 'get') {
      // 返回解析后的完整配置（包含默认值）
      const resolved = resolveConfig(runtimeConfig);
      return {
        content: [{ type: 'text', text: JSON.stringify(resolved, null, 2) }],
      };
    }

    if (args.action === 'set') {
      if (!args.config || Object.keys(args.config).length === 0) {
        return {
          content: [{ type: 'text', text: '错误: set 操作需要提供 config 参数' }],
          isError: true,
        };
      }

      // 合并到运行时配置
      runtimeConfig = { ...runtimeConfig, ...args.config };
      const resolved = resolveConfig(runtimeConfig);

      // 异步持久化，不阻塞响应
      persistConfig(runtimeConfig);

      return {
        content: [{ type: 'text', text: `配置已更新:\n${JSON.stringify(resolved, null, 2)}` }],
      };
    }

    if (args.action === 'export') {
      // 导出当前完整配置（包含默认值）
      const resolved = resolveConfig(runtimeConfig);
      return {
        content: [{ type: 'text', text: JSON.stringify(resolved, null, 2) }],
      };
    }

    if (args.action === 'import') {
      if (!args.config) {
        return {
          content: [{ type: 'text', text: '错误: import 操作需要提供 config 参数' }],
          isError: true,
        };
      }

      // 校验导入的配置
      const validation = validateImportConfig(args.config);
      if (!validation.success) {
        return {
          content: [{ type: 'text', text: `配置导入失败，校验错误: ${validation.error}` }],
          isError: true,
        };
      }

      // 覆盖运行时配置
      runtimeConfig = { ...validation.data };
      const resolved = resolveConfig(runtimeConfig);

      // 同步持久化，确保 import 操作完成后文件已更新
      persistConfigSync(runtimeConfig);

      return {
        content: [{ type: 'text', text: `配置已导入:\n${JSON.stringify(resolved, null, 2)}` }],
      };
    }

    return {
      content: [{ type: 'text', text: `未知操作: ${args.action}` }],
      isError: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `配置操作失败: ${errorMessage}` }],
      isError: true,
    };
  }
}
