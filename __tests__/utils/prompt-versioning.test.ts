/**
 * PromptVersioningManager 测试
 *
 * 覆盖：
 * - 提交记录
 * - 历史查询
 * - 版本对比
 * - 版本回滚
 * - 版本标记
 * - 版本内容检索
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { PromptVersioningManager } from '../../src/utils/prompt-versioning';
import { ReviewDimension } from '../../src/types';

const testRepoPath = '.test-prompt-versioning-repo';

/**
 * 初始化测试 Git 仓库
 */
function initTestRepo(): void {
  if (fs.existsSync(testRepoPath)) {
    fs.rmSync(testRepoPath, { recursive: true, force: true });
  }

  fs.mkdirSync(testRepoPath, { recursive: true });
  fs.mkdirSync(`${testRepoPath}/src/agents/prompts`, { recursive: true });

  // 初始化 Git 仓库
  execSync(`git init`, { cwd: testRepoPath });
  execSync(`git config user.email "test@example.com"`, { cwd: testRepoPath });
  execSync(`git config user.name "Test User"`, { cwd: testRepoPath });

  // 创建初始提交
  fs.writeFileSync(
    `${testRepoPath}/README.md`,
    '# Test Repository\n',
    'utf-8',
  );
  execSync(`git add README.md`, { cwd: testRepoPath });
  execSync(`git commit -m "Initial commit"`, { cwd: testRepoPath });
}

/**
 * 创建测试 prompt 文件
 */
function createPromptFile(dimension: ReviewDimension, content: string): void {
  const filePath = `${testRepoPath}/src/agents/prompts`;
  const fileMap: Partial<Record<ReviewDimension, string>> = {
    [ReviewDimension.Logic]: 'logic-prompt.ts',
    [ReviewDimension.Security]: 'security-prompt.ts',
    [ReviewDimension.Performance]: 'performance-prompt.ts',
    [ReviewDimension.Maintainability]: 'maintainability-prompt.ts',
    [ReviewDimension.EdgeCases]: 'edge-case-prompt.ts',
  };

  const fileName = fileMap[dimension];
  if (!fileName) throw new Error(`Unsupported dimension: ${dimension}`);

  fs.writeFileSync(`${filePath}/${fileName}`, content, 'utf-8');
}

describe('PromptVersioningManager', () => {
  let manager: PromptVersioningManager;

  beforeEach(() => {
    initTestRepo();
    manager = new PromptVersioningManager(testRepoPath);
  });

  afterEach(() => {
    if (fs.existsSync(testRepoPath)) {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
    }
  });

  describe('commitPromptChange', () => {
    it('应成功提交 prompt 变更', async () => {
      // 创建初始 prompt 文件
      createPromptFile(ReviewDimension.Logic, 'export const LOGIC_PROMPT = "v1.0.0";');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "Add logic prompt v1.0.0"`, { cwd: testRepoPath });

      // 修改 prompt
      createPromptFile(ReviewDimension.Logic, 'export const LOGIC_PROMPT = "v1.0.1 - bug fix";');

      // 提交变更
      const hash = await manager.commitPromptChange(
        ReviewDimension.Logic,
        '1.0.1',
        'Fixed issue #123',
      );

      expect(hash).toHaveLength(40); // SHA-1 哈希长度
      expect(hash).toMatch(/^[a-f0-9]{40}$/);

      // 验证提交存在
      const logCmd = `git log --oneline -1`;
      const output = execSync(logCmd, { cwd: testRepoPath, encoding: 'utf-8' });
      expect(output).toContain('logic prompt updated to 1.0.1');
    });

    it('应抛出错误当文件不存在', async () => {
      // 不创建任何 prompt 文件
      try {
        await manager.commitPromptChange(
          ReviewDimension.Logic,
          '1.0.0',
          'New version',
        );
        fail('Should have thrown error');
      } catch (error) {
        expect(String(error)).toContain("did not match any files");
      }
    });

    it('应包含提交信息中的版本号和描述', async () => {
      createPromptFile(ReviewDimension.Security, 'export const SEC_PROMPT = "v2.0.0";');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "Add security prompt"`, { cwd: testRepoPath });

      createPromptFile(ReviewDimension.Security, 'export const SEC_PROMPT = "v2.1.0";');

      await manager.commitPromptChange(
        ReviewDimension.Security,
        '2.1.0',
        'Enhanced detection',
      );

      const logCmd = `git log -1 --format="%B"`;
      const output = execSync(logCmd, { cwd: testRepoPath, encoding: 'utf-8' });
      expect(output).toContain('2.1.0');
      expect(output).toContain('Enhanced detection');
    });
  });

  describe('getPromptHistory', () => {
    it('应返回空数组当文件没有历史', async () => {
      const history = await manager.getPromptHistory(ReviewDimension.Logic);
      expect(history).toEqual([]);
    });

    it('应获取 prompt 文件的提交历史', async () => {
      // 创建第一个版本
      createPromptFile(ReviewDimension.Logic, 'export const LOGIC_PROMPT = "v1.0.0";');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "Initial Logic prompt v1.0.0"`, { cwd: testRepoPath });

      // 修改为第二个版本
      createPromptFile(ReviewDimension.Logic, 'export const LOGIC_PROMPT = "v1.1.0";');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "Update Logic prompt v1.1.0"`, { cwd: testRepoPath });

      const history = await manager.getPromptHistory(ReviewDimension.Logic);

      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0].message).toContain('v1.1.0');
      expect(history[0].author).toBe('Test User');
      expect(history[0].hash).toHaveLength(40);
      expect(history[0].shortHash).toHaveLength(7);
    });

    it('历史中的提交应包含变更统计', async () => {
      createPromptFile(ReviewDimension.Logic, 'v1');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "Add logic prompt"`, { cwd: testRepoPath });

      createPromptFile(ReviewDimension.Logic, 'v1\nmore content');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "Update logic prompt"`, { cwd: testRepoPath });

      const history = await manager.getPromptHistory(ReviewDimension.Logic);

      const latestCommit = history[0];
      expect(latestCommit.changes.length).toBeGreaterThan(0);
      expect(latestCommit.changes[0]).toHaveProperty('file');
      expect(latestCommit.changes[0]).toHaveProperty('insertions');
      expect(latestCommit.changes[0]).toHaveProperty('deletions');
    });
  });

  describe('diffPrompts', () => {
    it('应获取两个版本之间的差异', async () => {
      // 创建第一个版本
      createPromptFile(ReviewDimension.Logic, 'Line 1\nLine 2\nLine 3\n');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "V1"`, { cwd: testRepoPath });
      const v1 = execSync(`git rev-parse HEAD`, { cwd: testRepoPath, encoding: 'utf-8' }).trim();

      // 创建第二个版本
      createPromptFile(ReviewDimension.Logic, 'Line 1\nLine 2 modified\nLine 3\n');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "V2"`, { cwd: testRepoPath });
      const v2 = execSync(`git rev-parse HEAD`, { cwd: testRepoPath, encoding: 'utf-8' }).trim();

      const result = await manager.diffPrompts(ReviewDimension.Logic, v1, v2);

      expect(result.fromVersion).toBe(v1);
      expect(result.toVersion).toBe(v2);
      expect(result.diff).toContain('Line 2');
      expect(result.diff).toContain('-Line 2\n+Line 2 modified');
      expect(result.summary.filesChanged).toBe(1);
    });

    it('应计算正确的插入和删除统计', async () => {
      createPromptFile(ReviewDimension.Security, 'A\nB\nC\n');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "V1"`, { cwd: testRepoPath });
      const v1 = execSync(`git rev-parse HEAD`, { cwd: testRepoPath, encoding: 'utf-8' }).trim();

      createPromptFile(ReviewDimension.Security, 'A\nB\nC\nD\nE\n');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "V2"`, { cwd: testRepoPath });
      const v2 = execSync(`git rev-parse HEAD`, { cwd: testRepoPath, encoding: 'utf-8' }).trim();

      const result = await manager.diffPrompts(ReviewDimension.Security, v1, v2);

      expect(result.summary.insertions).toBeGreaterThan(0);
    });
  });

  describe('rollbackToVersion', () => {
    it('应成功回滚到指定版本', async () => {
      // 创建初始版本
      createPromptFile(ReviewDimension.Logic, 'export const PROMPT = "v1.0.0";');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "V1"`, { cwd: testRepoPath });
      const v1Hash = execSync(`git rev-parse HEAD`, { cwd: testRepoPath, encoding: 'utf-8' }).trim();

      // 修改为 v2
      createPromptFile(ReviewDimension.Logic, 'export const PROMPT = "v2.0.0";');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "V2"`, { cwd: testRepoPath });

      // 回滚到 v1
      const result = await manager.rollbackToVersion(ReviewDimension.Logic, v1Hash);

      expect(result.success).toBe(true);
      expect(result.fromVersion).toBeDefined();
      expect(result.toVersion).toBe(v1Hash);
      expect(result.filesAffected).toContain('src/agents/prompts/logic-prompt.ts');

      // 验证文件内容已回滚
      const content = fs.readFileSync(
        `${testRepoPath}/src/agents/prompts/logic-prompt.ts`,
        'utf-8',
      );
      expect(content).toContain('v1.0.0');
    });

    it('应返回错误当版本不存在', async () => {
      createPromptFile(ReviewDimension.Logic, 'content');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "Initial"`, { cwd: testRepoPath });

      const result = await manager.rollbackToVersion(ReviewDimension.Logic, 'invalid-hash');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应创建回滚提交', async () => {
      createPromptFile(ReviewDimension.Logic, 'v1');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "V1"`, { cwd: testRepoPath });
      const v1Hash = execSync(`git rev-parse HEAD`, { cwd: testRepoPath, encoding: 'utf-8' }).trim();

      createPromptFile(ReviewDimension.Logic, 'v2');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "V2"`, { cwd: testRepoPath });

      await manager.rollbackToVersion(ReviewDimension.Logic, v1Hash);

      const logCmd = `git log --oneline -1`;
      const output = execSync(logCmd, { cwd: testRepoPath, encoding: 'utf-8' });
      expect(output).toContain('revert(prompts)');
    });
  });

  describe('tagVersion', () => {
    it('应成功创建版本标签', async () => {
      createPromptFile(ReviewDimension.Logic, 'content');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "Add prompt"`, { cwd: testRepoPath });

      const tagName = await manager.tagVersion(ReviewDimension.Logic, '1.0.0');

      expect(tagName).toBe('logic-v1.0.0');

      // 验证标签存在
      const tagsCmd = `git tag -l`;
      const output = execSync(tagsCmd, { cwd: testRepoPath, encoding: 'utf-8' });
      expect(output).toContain('logic-v1.0.0');
    });

    it('应接受语义化版本格式', async () => {
      createPromptFile(ReviewDimension.Logic, 'content');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "Add prompt"`, { cwd: testRepoPath });

      const versions = ['1.0.0', '2.3.4', '1.0.0-beta', '1.0.0-alpha.1'];

      for (const version of versions) {
        const tagName = await manager.tagVersion(ReviewDimension.Logic, version);
        expect(tagName).toBe(`logic-v${version}`);
      }
    });

    it('应拒绝无效的版本格式', async () => {
      createPromptFile(ReviewDimension.Logic, 'content');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "Add prompt"`, { cwd: testRepoPath });

      try {
        await manager.tagVersion(ReviewDimension.Logic, 'invalid');
        fail('Should have thrown error');
      } catch (error) {
        expect(String(error)).toContain('Invalid version format');
      }
    });
  });

  describe('getVersionContent', () => {
    it('应获取当前版本的内容', async () => {
      const content = 'export const PROMPT = "current version";';
      createPromptFile(ReviewDimension.Logic, content);

      const result = await manager.getVersionContent(ReviewDimension.Logic, 'current');

      expect(result).toBe(content);
    });

    it('应获取特定 Git 版本的内容', async () => {
      createPromptFile(ReviewDimension.Logic, 'version 1');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "V1"`, { cwd: testRepoPath });
      const v1Hash = execSync(`git rev-parse HEAD`, { cwd: testRepoPath, encoding: 'utf-8' }).trim();

      createPromptFile(ReviewDimension.Logic, 'version 2');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "V2"`, { cwd: testRepoPath });

      const result = await manager.getVersionContent(ReviewDimension.Logic, v1Hash);

      expect(result).toBe('version 1');
    });

    it('应返回 null 当版本不存在', async () => {
      createPromptFile(ReviewDimension.Logic, 'content');
      execSync(`git add .`, { cwd: testRepoPath });
      execSync(`git commit -m "Add"`, { cwd: testRepoPath });

      const result = await manager.getVersionContent(ReviewDimension.Logic, 'invalid-hash');

      expect(result).toBeNull();
    });

    it('应支持 latest 别名', async () => {
      const content = 'latest content';
      createPromptFile(ReviewDimension.Security, content);

      const result = await manager.getVersionContent(ReviewDimension.Security, 'latest');

      expect(result).toBe(content);
    });
  });
});
