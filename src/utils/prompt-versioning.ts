/**
 * PromptVersioningManager - Git 整合的 Prompt 版本管理
 *
 * 功能：
 * 1. 使用 Git 追踪 prompt 变更历史
 * 2. 记录 prompt 变更的提交日志
 * 3. 支持版本对比 (diff)
 * 4. 支持版本回滚
 * 5. 支持版本标记 (tag)
 */

import { execSync } from 'child_process';
import { ReviewDimension } from '../types';

/**
 * Git 提交信息
 */
export interface GitCommit {
  /** 提交 SHA-1 哈希 */
  hash: string;
  /** 缩短的哈希 (前7位) */
  shortHash: string;
  /** 提交作者 */
  author: string;
  /** 提交时间戳 (ISO 8601) */
  timestamp: string;
  /** 提交信息 */
  message: string;
  /** 变更文件统计 */
  changes: {
    file: string;
    insertions: number;
    deletions: number;
  }[];
}

/**
 * 版本比较结果
 */
export interface VersionDiff {
  /** 源版本 */
  fromVersion: string;
  /** 目标版本 */
  toVersion: string;
  /** 统一差异格式 (unified diff) */
  diff: string;
  /** 变更摘要 */
  summary: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}

/**
 * 版本回滚结果
 */
export interface RollbackResult {
  /** 回滚前的版本 */
  fromVersion: string;
  /** 回滚到的版本 */
  toVersion: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 (如有) */
  error?: string;
  /** 回滚的变更文件 */
  filesAffected: string[];
}

/**
 * PromptVersioningManager - 管理 prompt 版本和 Git 历史
 */
export class PromptVersioningManager {
  private projectRoot: string;
  private promptsDir: string;

  constructor(projectRoot: string = '.', promptsDir: string = 'src/agents/prompts') {
    this.projectRoot = projectRoot;
    this.promptsDir = promptsDir;
  }

  /**
   * 获取 prompt 文件路径 (基于维度)
   */
  private getPromptFilePath(dimension: ReviewDimension): string {
    const fileMap: Partial<Record<ReviewDimension, string>> = {
      [ReviewDimension.Logic]: 'logic-prompt.ts',
      [ReviewDimension.Security]: 'security-prompt.ts',
      [ReviewDimension.Performance]: 'performance-prompt.ts',
      [ReviewDimension.Maintainability]: 'maintainability-prompt.ts',
      [ReviewDimension.EdgeCases]: 'edge-case-prompt.ts',
      [ReviewDimension.AdversaryFound]: 'adversary-prompt.ts',
    };

    const fileName = fileMap[dimension];
    if (!fileName) {
      throw new Error(`Unsupported dimension: ${dimension}`);
    }

    return `${this.promptsDir}/${fileName}`;
  }

  /**
   * 记录 prompt 变更到 Git
   */
  async commitPromptChange(
    dimension: ReviewDimension,
    versionNumber: string,
    description: string,
  ): Promise<string> {
    try {
      const filePath = this.getPromptFilePath(dimension);

      // 检查文件是否存在
      const fileExistsCmd = `git -C "${this.projectRoot}" ls-files "${filePath}"`;
      try {
        execSync(fileExistsCmd, { encoding: 'utf-8' });
      } catch {
        throw new Error(`Prompt file not found: ${filePath}`);
      }

      // 添加文件到 staging area
      const addCmd = `git -C "${this.projectRoot}" add "${filePath}"`;
      execSync(addCmd, { encoding: 'utf-8' });

      // 创建提交
      const commitMessage = `feat(prompts): ${dimension} prompt updated to ${versionNumber}\n\n${description}`;
      const commitCmd = `git -C "${this.projectRoot}" commit -m "${commitMessage.replace(/"/g, '\\"')}"`;
      const output = execSync(commitCmd, { encoding: 'utf-8' });

      // 获取提交哈希
      const hashCmd = `git -C "${this.projectRoot}" rev-parse HEAD`;
      const hash = execSync(hashCmd, { encoding: 'utf-8' }).trim();

      console.debug(`[PromptVersioningManager] Committed ${dimension} prompt: ${hash.substring(0, 7)}`);
      return hash;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PromptVersioningManager] Failed to commit prompt change: ${message}`);
      throw error;
    }
  }

  /**
   * 获取 prompt 文件的 Git 历史
   */
  async getPromptHistory(dimension: ReviewDimension): Promise<GitCommit[]> {
    try {
      const filePath = this.getPromptFilePath(dimension);

      // 使用 git log 获取历史
      const logCmd = `git -C "${this.projectRoot}" log --follow --format="%H%n%h%n%an%n%aI%n%s%n---" "${filePath}"`;

      let output: string;
      try {
        output = execSync(logCmd, { encoding: 'utf-8' });
      } catch {
        // 文件可能没有提交历史
        return [];
      }

      if (!output.trim()) {
        return [];
      }

      const commits: GitCommit[] = [];
      const entries = output.split('---\n').filter(e => e.trim());

      for (const entry of entries) {
        const lines = entry.trim().split('\n');
        if (lines.length < 5) continue;

        const hash = lines[0];
        const shortHash = lines[1];
        const author = lines[2];
        const timestamp = lines[3];
        const message = lines.slice(4).join('\n').trim();

        // 获取该提交的文件变更统计
        const statsCmd = `git -C "${this.projectRoot}" show --numstat --format="" "${hash}" -- "${filePath}"`;
        let stats = [];
        try {
          const statsOutput = execSync(statsCmd, { encoding: 'utf-8' });
          const statsLines = statsOutput.trim().split('\n').filter(l => l.trim());
          for (const statsLine of statsLines) {
            const parts = statsLine.split('\t');
            if (parts.length >= 3) {
              stats.push({
                file: parts[2],
                insertions: parseInt(parts[0], 10) || 0,
                deletions: parseInt(parts[1], 10) || 0,
              });
            }
          }
        } catch {
          // 无法获取统计信息
        }

        commits.push({
          hash,
          shortHash,
          author,
          timestamp,
          message,
          changes: stats,
        });
      }

      return commits;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PromptVersioningManager] Failed to get prompt history: ${message}`);
      return [];
    }
  }

  /**
   * 对比两个版本的 prompt
   */
  async diffPrompts(
    dimension: ReviewDimension,
    commitA: string,
    commitB: string,
  ): Promise<VersionDiff> {
    try {
      const filePath = this.getPromptFilePath(dimension);

      // 获取 unified diff
      const diffCmd = `git -C "${this.projectRoot}" diff "${commitA}" "${commitB}" -- "${filePath}"`;
      const diff = execSync(diffCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

      // 获取统计信息
      const statsCmd = `git -C "${this.projectRoot}" diff --numstat "${commitA}" "${commitB}" -- "${filePath}"`;
      let summary = { filesChanged: 1, insertions: 0, deletions: 0 };

      try {
        const statsOutput = execSync(statsCmd, { encoding: 'utf-8' });
        const parts = statsOutput.trim().split('\t');
        if (parts.length >= 2) {
          summary.insertions = parseInt(parts[0], 10) || 0;
          summary.deletions = parseInt(parts[1], 10) || 0;
        }
      } catch {
        // 无法获取统计
      }

      return {
        fromVersion: commitA,
        toVersion: commitB,
        diff,
        summary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PromptVersioningManager] Failed to diff prompts: ${message}`);
      throw error;
    }
  }

  /**
   * 回滚 prompt 到指定版本
   */
  async rollbackToVersion(dimension: ReviewDimension, version: string): Promise<RollbackResult> {
    try {
      const filePath = this.getPromptFilePath(dimension);

      // 获取当前版本哈希
      const currentCmd = `git -C "${this.projectRoot}" rev-parse HEAD`;
      const currentVersion = execSync(currentCmd, { encoding: 'utf-8' }).trim();

      // 验证目标版本存在
      const verifyCmd = `git -C "${this.projectRoot}" rev-parse "${version}"`;
      let targetVersion: string;
      try {
        targetVersion = execSync(verifyCmd, { encoding: 'utf-8' }).trim();
      } catch {
        throw new Error(`Invalid version: ${version}`);
      }

      // 使用 git show 获取旧版本内容
      const showCmd = `git -C "${this.projectRoot}" show "${version}:${filePath}"`;
      let oldContent: string;
      try {
        oldContent = execSync(showCmd, { encoding: 'utf-8' });
      } catch {
        throw new Error(`File not found in version ${version}`);
      }

      // 写入文件
      const fs = require('fs');
      const fullPath = `${this.projectRoot}/${filePath}`;
      fs.writeFileSync(fullPath, oldContent, 'utf-8');

      // 添加到 staging
      const addCmd = `git -C "${this.projectRoot}" add "${filePath}"`;
      execSync(addCmd, { encoding: 'utf-8' });

      // 创建回滚提交
      const commitMsg = `revert(prompts): rollback ${dimension} prompt to ${version.substring(0, 7)}`;
      const commitCmd = `git -C "${this.projectRoot}" commit -m "${commitMsg}"`;
      try {
        execSync(commitCmd, { encoding: 'utf-8' });
      } catch {
        // 可能没有实际变更
      }

      console.info(
        `[PromptVersioningManager] Rolled back ${dimension} prompt ` +
        `from ${currentVersion.substring(0, 7)} to ${targetVersion.substring(0, 7)}`,
      );

      return {
        fromVersion: currentVersion,
        toVersion: targetVersion,
        success: true,
        filesAffected: [filePath],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PromptVersioningManager] Failed to rollback: ${message}`);
      return {
        fromVersion: '',
        toVersion: version,
        success: false,
        error: message,
        filesAffected: [],
      };
    }
  }

  /**
   * 标记版本 (创建 Git tag)
   */
  async tagVersion(dimension: ReviewDimension, version: string): Promise<string> {
    try {
      // 验证版本号格式 (semver) - 允许预发布标签中的点
      if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version)) {
        throw new Error(`Invalid version format: ${version}. Use semantic versioning.`);
      }

      // 创建 tag
      const tagName = `${dimension}-v${version}`;
      const tagCmd = `git -C "${this.projectRoot}" tag "${tagName}"`;
      execSync(tagCmd, { encoding: 'utf-8' });

      console.info(`[PromptVersioningManager] Tagged version: ${tagName}`);
      return tagName;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PromptVersioningManager] Failed to tag version: ${message}`);
      throw error;
    }
  }

  /**
   * 获取特定版本的 prompt 内容
   */
  async getVersionContent(dimension: ReviewDimension, version: string): Promise<string | null> {
    try {
      const filePath = this.getPromptFilePath(dimension);

      // 如果版本是 "current" 或 "latest"，获取当前内容
      if (version === 'current' || version === 'latest') {
        const fs = require('fs');
        const fullPath = `${this.projectRoot}/${filePath}`;
        if (fs.existsSync(fullPath)) {
          return fs.readFileSync(fullPath, 'utf-8');
        }
        return null;
      }

      // 从 Git 获取版本内容
      const showCmd = `git -C "${this.projectRoot}" show "${version}:${filePath}"`;
      try {
        return execSync(showCmd, { encoding: 'utf-8' });
      } catch {
        return null;
      }
    } catch (error) {
      console.error(`[PromptVersioningManager] Failed to get version content: ${error}`);
      return null;
    }
  }
}
