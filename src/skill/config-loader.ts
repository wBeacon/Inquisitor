/**
 * config-loader.ts - 项目级配置加载器
 *
 * 从项目根目录加载 .inquisitor.json 配置文件。
 * 配置文件不存在时返回默认配置，不会抛出错误。
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { ReviewDimension } from '../types';

/**
 * A/B 测试配置
 */
export interface ABTestConfig {
  /** 测试 ID */
  testId: string;
  /** 测试维度 */
  dimension: ReviewDimension;
  /** 版本 A */
  versionA: string;
  /** 版本 B */
  versionB: string;
  /** 流量分配百分比 (0-100) */
  trafficSplitPercentage: number;
  /** 测试开始时间 (ISO 8601) */
  startedAt: string;
  /** 测试结束时间 (ISO 8601, 可选) */
  endedAt?: string;
  /** 测试状态 */
  status: 'active' | 'paused' | 'completed';
}

/**
 * Prompt 版本管理配置
 */
export interface PromptVersioningConfigOptions {
  /** 是否启用版本控制 */
  enabled?: boolean;
  /** 版本选择模式 */
  versionMode?: 'auto' | 'explicit' | 'latest' | 'stable';
  /** 维度级别的配置 */
  [key: string]: {
    /** 指定版本 */
    version?: string;
    /** 是否启用 A/B 测试 */
    enableABTest?: boolean;
    /** A/B 测试 ID */
    abTestId?: string;
  } | boolean | string | undefined;
}

/**
 * Inquisitor 配置结构
 */
export interface InquisitorConfig {
  /** 忽略的文件/目录模式（glob 格式） */
  ignore: string[];
  /** 自定义规则 */
  rules: Record<string, unknown>;
  /** 最低严重程度阈值，低于此阈值的问题不报告 */
  severityThreshold?: string;
  /** 指定启用的审查维度 */
  dimensions?: string[];
  /** 输出格式 */
  formats?: string[];
  /** LLM Provider 配置 */
  provider?: {
    type?: string;
    model?: string;
    baseUrl?: string;
  };
  /** 项目上下文采集配置 */
  projectContext?: {
    /** 是否启用项目上下文采集（默认 true） */
    enabled?: boolean;
  };
  /** Prompt 版本控制配置 */
  prompts?: PromptVersioningConfigOptions;
  /** A/B 测试配置列表 */
  abTests?: ABTestConfig[];
}

/** 配置文件名 */
const CONFIG_FILE_NAME = '.inquisitor.json';

/**
 * 返回默认配置
 */
function getDefaultConfig(): InquisitorConfig {
  return {
    ignore: [],
    rules: {},
  };
}

/**
 * 验证 A/B 测试配置
 */
function validateABTestConfig(config: unknown): config is ABTestConfig {
  if (!config || typeof config !== 'object') return false;

  const c = config as Record<string, unknown>;

  return (
    typeof c.testId === 'string' &&
    typeof c.dimension === 'string' &&
    typeof c.versionA === 'string' &&
    typeof c.versionB === 'string' &&
    typeof c.trafficSplitPercentage === 'number' &&
    c.trafficSplitPercentage >= 0 &&
    c.trafficSplitPercentage <= 100 &&
    typeof c.startedAt === 'string' &&
    (typeof c.status === 'string' && ['active', 'paused', 'completed'].includes(c.status))
  );
}

/**
 * 从指定目录加载 .inquisitor.json 配置文件
 *
 * @param projectRoot - 项目根目录路径
 * @returns 合并后的配置对象（用户配置覆盖默认配置）
 *
 * @example
 * // 项目根目录下有 .inquisitor.json
 * const config = loadConfig('/path/to/project');
 * console.log(config.ignore); // ["**\/*.test.ts", "node_modules/**"]
 *
 * @example
 * // 配置文件不存在时返回默认配置
 * const config = loadConfig('/nonexistent');
 * console.log(config.ignore); // []
 */
export function loadConfig(projectRoot: string): InquisitorConfig {
  const defaults = getDefaultConfig();

  try {
    const configPath = resolve(projectRoot, CONFIG_FILE_NAME);

    if (!existsSync(configPath)) {
      return defaults;
    }

    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);

    // 验证和处理 A/B 测试配置
    const abTests: ABTestConfig[] = [];
    if (Array.isArray(parsed.abTests)) {
      for (const test of parsed.abTests) {
        if (validateABTestConfig(test)) {
          abTests.push(test);
        }
      }
    }

    // 处理 prompt 版本控制配置
    const prompts = parsed.prompts && typeof parsed.prompts === 'object'
      ? parsed.prompts as PromptVersioningConfigOptions
      : undefined;

    // 合并用户配置和默认配置
    return {
      ignore: Array.isArray(parsed.ignore) ? parsed.ignore : defaults.ignore,
      rules: parsed.rules && typeof parsed.rules === 'object' ? parsed.rules : defaults.rules,
      severityThreshold: typeof parsed.severityThreshold === 'string'
        ? parsed.severityThreshold
        : defaults.severityThreshold,
      dimensions: Array.isArray(parsed.dimensions) ? parsed.dimensions : defaults.dimensions,
      formats: Array.isArray(parsed.formats) ? parsed.formats : defaults.formats,
      provider: parsed.provider && typeof parsed.provider === 'object'
        ? {
            type: typeof parsed.provider.type === 'string' ? parsed.provider.type : undefined,
            model: typeof parsed.provider.model === 'string' ? parsed.provider.model : undefined,
            baseUrl: typeof parsed.provider.baseUrl === 'string' ? parsed.provider.baseUrl : undefined,
          }
        : defaults.provider,
      projectContext: parsed.projectContext && typeof parsed.projectContext === 'object'
        ? {
            enabled: typeof parsed.projectContext.enabled === 'boolean'
              ? parsed.projectContext.enabled
              : undefined,
          }
        : defaults.projectContext,
      prompts,
      abTests: abTests.length > 0 ? abTests : undefined,
    };
  } catch {
    // JSON 解析失败或其他 IO 错误时返回默认配置
    return defaults;
  }
}
