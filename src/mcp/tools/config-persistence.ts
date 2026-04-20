/**
 * config-persistence.ts - MCP 配置持久化模块
 *
 * 负责将运行时配置持久化到项目根目录的 .inquisitor-mcp.json 文件，
 * 以及在 Server 启动时从文件加载持久化配置。
 *
 * 与 configure.ts 解耦，通过导入使用。
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { OrchestratorConfig } from '../../orchestrator';

/** 持久化配置文件名 */
export const CONFIG_FILE_NAME = '.inquisitor-mcp.json';

/**
 * 用于校验导入配置的 zod schema
 * 与 configureSchema.config 保持一致
 */
export const importConfigSchema = z.object({
  model: z.string().optional(),
  maxParallel: z.number().int().min(1).max(10).optional(),
  agentTimeout: z.number().int().min(10000).optional(),
  enableAdversary: z.boolean().optional(),
  enableMetaReview: z.boolean().optional(),
  maxAdversaryRounds: z.number().int().min(1).max(5).optional(),
  severityThreshold: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  provider: z
    .object({
      type: z.enum(['anthropic']),
      model: z.string().optional(),
      baseUrl: z.string().optional(),
      apiKey: z.string().optional(),
    })
    .optional(),
});

/**
 * 获取配置文件的完整路径
 * @param basePath 项目根目录路径，默认 process.cwd()
 */
export function getConfigFilePath(basePath?: string): string {
  return path.join(basePath ?? process.cwd(), CONFIG_FILE_NAME);
}

/**
 * 异步写入配置到持久化文件（非阻塞）
 * @param config 要持久化的配置对象
 * @param basePath 项目根目录路径
 */
export function persistConfig(
  config: Partial<OrchestratorConfig>,
  basePath?: string
): void {
  const filePath = getConfigFilePath(basePath);
  const content = JSON.stringify(config, null, 2);
  // 使用异步写入，不阻塞调用方
  fs.writeFile(filePath, content, 'utf-8', (err) => {
    if (err) {
      console.error(`[inquisitor] 配置持久化失败: ${err.message}`);
    }
  });
}

/**
 * 从持久化文件加载配置
 * 文件不存在或内容非法时返回空对象，不抛异常
 * @param basePath 项目根目录路径
 * @returns 加载的配置对象，失败时返回空对象
 */
export function loadPersistedConfig(
  basePath?: string
): Partial<OrchestratorConfig> {
  const filePath = getConfigFilePath(basePath);
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    return parsed as Partial<OrchestratorConfig>;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[inquisitor] 加载持久化配置失败，回退到默认配置: ${msg}`);
    return {};
  }
}

/**
 * 校验导入的配置内容
 * @param config 待校验的配置对象
 * @returns 校验结果，成功时返回解析后的数据
 */
export function validateImportConfig(
  config: unknown
): { success: true; data: Partial<OrchestratorConfig> } | { success: false; error: string } {
  const result = importConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data as Partial<OrchestratorConfig> };
  }
  // 格式化 zod 错误信息
  const errors = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  return { success: false, error: errors };
}

/**
 * 同步写入配置到持久化文件（仅供 import 操作使用，需要确保写入完成）
 * @param config 要持久化的配置对象
 * @param basePath 项目根目录路径
 */
export function persistConfigSync(
  config: Partial<OrchestratorConfig>,
  basePath?: string
): void {
  const filePath = getConfigFilePath(basePath);
  const content = JSON.stringify(config, null, 2);
  fs.writeFileSync(filePath, content, 'utf-8');
}
