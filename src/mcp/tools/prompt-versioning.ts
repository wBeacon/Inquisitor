/**
 * prompt-versioning.ts - MCP 工具: Prompt 版本管理和 A/B 测试
 *
 * 支持以下操作：
 * - action: 'history' - 获取指定维度的版本历史和 git commits
 * - action: 'diff' - 对比两个版本的差异
 * - action: 'rollback' - 回滚到指定版本
 * - action: 'tag' - 给版本创建 git tag
 * - action: 'ab-test:start' - 启动 A/B 测试
 * - action: 'ab-test:stop' - 停止 A/B 测试
 */

import { z } from 'zod';
import { ReviewDimension } from '../../types';
import { PromptVersioningManager } from '../../utils/prompt-versioning';
import { PromptVersioningManager as PromptVersioningManagerV2 } from '../../agents/prompts/versioning/prompt-versioning-manager';
import { ABTestManager } from '../../agents/prompts/versioning/ab-test-manager';

/**
 * 初始化版本管理工具
 */
const versioningManager = new PromptVersioningManager();
const abTestManager = new ABTestManager(new PromptVersioningManagerV2(), '.inquisitor/ab-tests-config.json');

/**
 * prompt 版本管理工具的 inputSchema 定义
 */
export const promptVersioningSchema = {
  action: z
    .enum([
      'history',
      'diff',
      'rollback',
      'tag',
      'ab-test:start',
      'ab-test:stop',
    ])
    .describe('操作类型'),
  dimension: z
    .enum(['logic', 'security', 'performance', 'maintainability', 'edge_cases'])
    .describe('审查维度'),
  versionA: z.string().optional().describe('对比版本 A'),
  versionB: z.string().optional().describe('对比版本 B'),
  version: z.string().optional().describe('目标版本'),
  testId: z.string().optional().describe('A/B 测试 ID'),
  config: z
    .object({
      versionA: z.string().describe('版本 A'),
      versionB: z.string().describe('版本 B'),
      trafficSplitPercentage: z.number().min(0).max(100).describe('流量分配百分比'),
    })
    .optional()
    .describe('A/B 测试配置'),
};

/**
 * 获取版本历史
 */
async function handleGetHistory(dimension: string): Promise<string> {
  try {
    const dim = dimension as ReviewDimension;
    const history = await versioningManager.getPromptHistory(dim);

    if (history.length === 0) {
      return `维度 ${dimension} 暂无历史记录`;
    }

    const formatted = history.map((commit, idx) => {
      return `${idx + 1}. [${commit.shortHash}] ${commit.message}\n` +
        `   作者: ${commit.author}\n` +
        `   时间: ${new Date(commit.timestamp).toLocaleString()}\n` +
        `   变更: ${commit.changes.join(', ')}`;
    });

    return `维度 ${dimension} 的版本历史:\n\n${formatted.join('\n\n')}`;
  } catch (error) {
    throw new Error(`获取历史失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 对比两个版本
 */
async function handleDiffVersions(
  dimension: string,
  versionA: string,
  versionB: string,
): Promise<string> {
  try {
    const dim = dimension as ReviewDimension;
    const diff = await versioningManager.diffPrompts(dim, versionA, versionB);

    const summary = `维度: ${dimension}\n` +
      `对比: ${diff.fromVersion} -> ${diff.toVersion}\n` +
      `统计: +${diff.summary.insertions} -${diff.summary.deletions}\n\n`;

    return summary + '差异:\n```\n' + diff.diff + '\n```';
  } catch (error) {
    throw new Error(`对比版本失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 回滚到指定版本
 */
async function handleRollback(dimension: string, version: string): Promise<string> {
  try {
    const dim = dimension as ReviewDimension;
    const result = await versioningManager.rollbackToVersion(dim, version);

    if (!result.success) {
      throw new Error(result.error || '回滚失败');
    }

    return `成功回滚到版本 ${version}\n` +
      `受影响的文件:\n${result.filesAffected.map((f: string) => `  - ${f}`).join('\n')}`;
  } catch (error) {
    throw new Error(`回滚失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 创建版本标签
 */
async function handleTagVersion(dimension: string, version: string): Promise<string> {
  try {
    const dim = dimension as ReviewDimension;
    await versioningManager.tagVersion(dim, version);

    return `成功为版本 ${version} 创建 git tag`;
  } catch (error) {
    throw new Error(`创建标签失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 启动 A/B 测试
 */
async function handleStartABTest(config: {
  versionA: string;
  versionB: string;
  trafficSplitPercentage: number;
}): Promise<string> {
  try {
    const testId = `test-${Date.now()}`;
    
    await abTestManager.createTest({
      testId,
      dimension: ReviewDimension.Logic,
      versionA: config.versionA,
      versionB: config.versionB,
      trafficSplitPercentage: config.trafficSplitPercentage,
      startedAt: new Date().toISOString(),
      status: 'active',
    });

    return `A/B 测试启动成功\n` +
      `测试 ID: ${testId}\n` +
      `版本 A: ${config.versionA}\n` +
      `版本 B: ${config.versionB}\n` +
      `流量分配: ${config.trafficSplitPercentage}%`;
  } catch (error) {
    throw new Error(`启动 A/B 测试失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 停止 A/B 测试
 */
async function handleStopABTest(testId: string): Promise<string> {
  try {
    await abTestManager.updateTestStatus(testId, 'completed');
    
    return `A/B 测试已停止\n测试 ID: ${testId}`;
  } catch (error) {
    throw new Error(`停止 A/B 测试失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 主处理函数
 */
export async function handlePromptVersioning(args: {
  action: string;
  dimension?: string;
  versionA?: string;
  versionB?: string;
  version?: string;
  testId?: string;
  config?: {
    versionA: string;
    versionB: string;
    trafficSplitPercentage: number;
  };
}): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    let result: string;

    switch (args.action) {
      case 'history':
        if (!args.dimension) throw new Error('history 操作需要 dimension 参数');
        result = await handleGetHistory(args.dimension);
        break;

      case 'diff':
        if (!args.dimension) throw new Error('diff 操作需要 dimension 参数');
        if (!args.versionA || !args.versionB) throw new Error('diff 操作需要 versionA 和 versionB 参数');
        result = await handleDiffVersions(args.dimension, args.versionA, args.versionB);
        break;

      case 'rollback':
        if (!args.dimension) throw new Error('rollback 操作需要 dimension 参数');
        if (!args.version) throw new Error('rollback 操作需要 version 参数');
        result = await handleRollback(args.dimension, args.version);
        break;

      case 'tag':
        if (!args.dimension) throw new Error('tag 操作需要 dimension 参数');
        if (!args.version) throw new Error('tag 操作需要 version 参数');
        result = await handleTagVersion(args.dimension, args.version);
        break;

      case 'ab-test:start':
        if (!args.config) throw new Error('ab-test:start 操作需要 config 参数');
        result = await handleStartABTest(args.config);
        break;

      case 'ab-test:stop':
        if (!args.testId) throw new Error('ab-test:stop 操作需要 testId 参数');
        result = await handleStopABTest(args.testId);
        break;

      default:
        throw new Error(`未知的操作: ${args.action}`);
    }

    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `错误: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
