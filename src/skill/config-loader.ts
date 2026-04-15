/**
 * config-loader.ts - 项目级配置加载器
 *
 * 从项目根目录加载 .inquisitor.json 配置文件。
 * 配置文件不存在时返回默认配置，不会抛出错误。
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

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

    // 合并用户配置和默认配置
    return {
      ignore: Array.isArray(parsed.ignore) ? parsed.ignore : defaults.ignore,
      rules: parsed.rules && typeof parsed.rules === 'object' ? parsed.rules : defaults.rules,
      severityThreshold: typeof parsed.severityThreshold === 'string'
        ? parsed.severityThreshold
        : defaults.severityThreshold,
      dimensions: Array.isArray(parsed.dimensions) ? parsed.dimensions : defaults.dimensions,
      formats: Array.isArray(parsed.formats) ? parsed.formats : defaults.formats,
    };
  } catch {
    // JSON 解析失败或其他 IO 错误时返回默认配置
    return defaults;
  }
}
