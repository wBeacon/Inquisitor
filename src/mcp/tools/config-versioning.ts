/**
 * config-versioning.ts - MCP 配置版本管理工具
 *
 * 功能特性：
 * - 自动版本快照：配置变更时自动创建带时间戳和描述的版本
 * - 版本历史浏览：查看所有历史版本及其变更信息
 * - 智能比较：可视化展示版本间差异
 * - 一键回滚：支持恢复到任意历史版本
 * - A/B 测试集成：与现有测试框架深度集成
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
// import { McpError } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadPersistedConfig, persistConfigSync } from './config-persistence';

/**
 * 配置版本信息接口
 */
export interface ConfigVersion {
  versionId: string;
  timestamp: string;
  description?: string;
  config: Record<string, any>;
  author?: string;
  checksum: string;
}

/**
 * 版本历史记录接口
 */
export interface VersionHistory {
  currentVersion: string;
  versions: ConfigVersion[];
  maxVersions?: number; // 最大保留版本数
}

/**
 * 版本比较结果接口
 */
export interface VersionDiff {
  added: string[];
  removed: string[];
  modified: { key: string; oldValue: any; newValue: any }[];
}

/**
 * 配置版本管理器
 */
export class ConfigVersionManager {
  private historyFilePath: string;
  private maxVersions: number = 50; // 默认保留50个历史版本

  constructor(private basePath: string) {
    this.historyFilePath = path.join(this.basePath, '.inquisitor-version-history.json');
  }

  /**
   * 创建配置版本快照
   */
  async createSnapshot(config: Record<string, any>, description?: string): Promise<string> {
    try {
      const versionId = this.generateVersionId();
      const timestamp = new Date().toISOString();
      const checksum = this.generateChecksum(config);

      const version: ConfigVersion = {
        versionId,
        timestamp,
        description: description || `配置变更于 ${new Date().toLocaleString()}`,
        config: { ...config },
        author: 'system', // 可扩展为实际用户
        checksum
      };

      const history = await this.loadHistory();
      history.versions.unshift(version);

      // 限制版本数量
      if (history.versions.length > this.maxVersions) {
        history.versions = history.versions.slice(0, this.maxVersions);
      }

      history.currentVersion = versionId;

      await this.saveHistory(history);
      return versionId;
    } catch (error) {
      throw new Error(`创建配置快照失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取版本历史
   */
  async getHistory(limit?: number): Promise<ConfigVersion[]> {
    const history = await this.loadHistory();
    return limit ? history.versions.slice(0, limit) : history.versions;
  }

  /**
   * 比较两个版本
   */
  async compareVersions(versionA: string, versionB: string): Promise<VersionDiff> {
    const history = await this.loadHistory();
    const versionAConfig = history.versions.find(v => v.versionId === versionA)?.config;
    const versionBConfig = history.versions.find(v => v.versionId === versionB)?.config;

    if (!versionAConfig || !versionBConfig) {
      throw new Error('指定的版本不存在');
    }

    return this.calculateDiff(versionAConfig, versionBConfig);
  }

  /**
   * 回滚到指定版本
   */
  async rollbackToVersion(versionId: string): Promise<{ success: boolean; restoredConfig: Record<string, any> }> {
    const history = await this.loadHistory();
    const targetVersion = history.versions.find(v => v.versionId === versionId);

    if (!targetVersion) {
      throw new Error(`版本 ${versionId} 不存在`);
    }

    // 创建回滚记录
    await this.createSnapshot(targetVersion.config, `回滚到版本 ${versionId}`);

    return {
      success: true,
      restoredConfig: targetVersion.config
    };
  }

  /**
   * 获取当前版本
   */
  async getCurrentVersion(): Promise<ConfigVersion | null> {
    const history = await this.loadHistory();
    return history.versions.find(v => v.versionId === history.currentVersion) || null;
  }

  /**
   * 清理旧版本
   */
  async cleanupOldVersions(keepCount: number = 10): Promise<number> {
    const history = await this.loadHistory();
    if (history.versions.length <= keepCount) {
      return 0;
    }

    const removedCount = history.versions.length - keepCount;
    history.versions = history.versions.slice(0, keepCount);
    await this.saveHistory(history);

    return removedCount;
  }

  /**
   * 清理旧版本（别名方法，保持兼容性）
   */
  async cleanup(keepCount: number = 10): Promise<number> {
    return this.cleanupOldVersions(keepCount);
  }

  /**
   * 私有方法
   */
  private async loadHistory(): Promise<VersionHistory> {
    try {
      if (!fs.existsSync(this.historyFilePath)) {
        return {
          currentVersion: '',
          versions: [],
          maxVersions: this.maxVersions
        };
      }

      const content = fs.readFileSync(this.historyFilePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // 文件损坏时返回空历史
      return {
        currentVersion: '',
        versions: [],
        maxVersions: this.maxVersions
      };
    }
  }

  private async saveHistory(history: VersionHistory): Promise<void> {
    const content = JSON.stringify(history, null, 2);
    fs.writeFileSync(this.historyFilePath, content, 'utf-8');
  }

  private generateVersionId(): string {
    return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateChecksum(config: Record<string, any>): string {
    const content = JSON.stringify(config, Object.keys(config).sort());
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private calculateDiff(oldConfig: Record<string, any>, newConfig: Record<string, any>): VersionDiff {
    const diff: VersionDiff = {
      added: [],
      removed: [],
      modified: []
    };

    const allKeys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);

    for (const key of allKeys) {
      const oldVal = oldConfig[key];
      const newVal = newConfig[key];

      if (!(key in oldConfig)) {
        diff.added.push(key);
      } else if (!(key in newConfig)) {
        diff.removed.push(key);
      } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        diff.modified.push({
          key,
          oldValue: oldVal,
          newValue: newVal
        });
      }
    }

    return diff;
  }
}

/**
 * MCP 工具 Schema 定义
 */
export const configVersioningSchema = {
  action: z.enum(['create_snapshot', 'get_history', 'compare', 'rollback', 'cleanup']).describe('操作类型: create_snapshot 创建快照, get_history 获取历史, compare 比较版本, rollback 回滚, cleanup 清理旧版本'),
  description: z.string().optional().describe('快照描述（仅 create_snapshot 需要）'),
  versionA: z.string().optional().describe('比较的第一个版本ID'),
  versionB: z.string().optional().describe('比较的第二个版本ID'),
  targetVersion: z.string().optional().describe('要回滚的目标版本ID'),
  keepCount: z.number().int().min(1).max(100).optional().describe('清理时保留的版本数量'),
};

/**
 * 配置版本管理工具处理函数
 */
export async function handleConfigVersioning(args: {
  action: string;
  description?: string;
  versionA?: string;
  versionB?: string;
  targetVersion?: string;
  keepCount?: number;
}, basePath?: string): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const manager = new ConfigVersionManager(basePath || process.cwd());

  try {
    switch (args.action) {
      case 'create_snapshot': {
        const currentConfig = await loadPersistedConfig(basePath);
        const versionId = await manager.createSnapshot(currentConfig, args.description);
        return {
          content: [{
            type: 'text',
            text: `✅ 配置快照创建成功
版本ID: ${versionId}
时间: ${new Date().toLocaleString()}
描述: ${args.description || '自动创建的快照'}`
          }]
        };
      }

      case 'get_history': {
        const history = await manager.getHistory(args.keepCount || 10);
        if (history.length === 0) {
          return {
            content: [{ type: 'text', text: '暂无版本历史记录' }]
          };
        }

        const historyText = history.map(version =>
          `版本: ${version.versionId}
时间: ${new Date(version.timestamp).toLocaleString()}
描述: ${version.description}
校验和: ${version.checksum}
---`
        ).join('\n');

        return {
          content: [{
            type: 'text',
            text: `📋 配置版本历史（最近 ${args.keepCount || 10} 个）\n\n${historyText}`
          }]
        };
      }

      case 'compare': {
        if (!args.versionA || !args.versionB) {
          throw new Error('compare 操作需要 versionA 和 versionB 参数');
        }

        const diff = await manager.compareVersions(args.versionA, args.versionB);
        const diffText = formatDiff(diff);

        return {
          content: [{
            type: 'text',
            text: `🔍 版本比较结果: ${args.versionA} ↔ ${args.versionB}\n\n${diffText}`
          }]
        };
      }

      case 'rollback': {
        if (!args.targetVersion) {
          throw new Error('rollback 操作需要 targetVersion 参数');
        }

        const result = await manager.rollbackToVersion(args.targetVersion);
        if (result.success) {
          // 将回滚的配置写回主配置文件
          await persistConfigSync(result.restoredConfig, basePath);

          return {
            content: [{
              type: 'text',
              text: `✅ 配置已回滚到版本 ${args.targetVersion}\n恢复的配置已持久化到当前配置文件中`
            }]
          };
        } else {
          throw new Error('回滚操作失败');
        }
      }

      case 'cleanup': {
        const removedCount = await manager.cleanupOldVersions(args.keepCount || 10);
        return {
          content: [{
            type: 'text',
            text: `🧹 已清理 ${removedCount} 个旧版本，保留最近 ${args.keepCount || 10} 个版本`
          }]
        };
      }

      default:
        throw new Error(`不支持的操作: ${args.action}`);
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `❌ 配置版本管理操作失败: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
}

/**
 * 格式化差异输出
 */
function formatDiff(diff: VersionDiff): string {
  const parts: string[] = [];

  if (diff.added.length > 0) {
    parts.push(`新增配置项 (${diff.added.length}):`);
    diff.added.forEach(key => parts.push(`  + ${key}`));
  }

  if (diff.removed.length > 0) {
    parts.push(`删除配置项 (${diff.removed.length}):`);
    diff.removed.forEach(key => parts.push(`  - ${key}`));
  }

  if (diff.modified.length > 0) {
    parts.push(`修改配置项 (${diff.modified.length}):`);
    diff.modified.forEach(({ key, oldValue, newValue }) => {
      parts.push(`  ~ ${key}: ${JSON.stringify(oldValue)} → ${JSON.stringify(newValue)}`);
    });
  }

  if (parts.length === 0) {
    return '两个版本配置完全一致';
  }

  return parts.join('\n');
}

// 导出工具函数供其他模块使用
export { formatDiff };