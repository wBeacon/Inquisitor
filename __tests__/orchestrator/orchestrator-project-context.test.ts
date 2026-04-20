/**
 * orchestrator-project-context.test.ts - 编排器项目上下文集成测试
 */
import { ReviewOrchestrator } from '../../src/orchestrator/orchestrator';
import { ReviewRequest, ReviewDimension } from '../../src/types';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { resolve } from 'path';

describe('ReviewOrchestrator - 项目上下文集成', () => {
  const tmpDir = resolve(__dirname, 'tmp-orchestrator-ctx-test');

  beforeEach(() => {
    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('prepareReviewContext 在 projectRoot 有配置文件时包含项目配置信息', async () => {
    // 创建配置文件
    writeFileSync(resolve(tmpDir, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}');
    writeFileSync(resolve(tmpDir, '.editorconfig'), 'root = true');

    const orchestrator = new ReviewOrchestrator({
      enableAdversary: false,
      enableMetaReview: false,
    });

    const request: ReviewRequest = {
      files: [{ path: 'test.ts', content: 'const x = 1;' }],
      context: {
        contextLines: 3,
        includeFullFile: true,
        includeDependencies: false,
        projectRoot: tmpDir,
      },
      mode: 'review',
    };

    const { contextString } = await orchestrator.prepareReviewContext(request);

    // 验证 contextString 包含项目配置信息
    expect(contextString).toContain('Project Configuration Context');
    expect(contextString).toContain('TypeScript Config');
    expect(contextString).toContain('"strict":true');
    expect(contextString).toContain('EditorConfig');
    expect(contextString).toContain('root = true');
  });

  test('prepareReviewContext 在无配置文件时不包含项目配置', async () => {
    const orchestrator = new ReviewOrchestrator({
      enableAdversary: false,
      enableMetaReview: false,
    });

    const request: ReviewRequest = {
      files: [{ path: 'test.ts', content: 'const x = 1;' }],
      context: {
        contextLines: 3,
        includeFullFile: true,
        includeDependencies: false,
        projectRoot: tmpDir,
      },
      mode: 'review',
    };

    const { contextString } = await orchestrator.prepareReviewContext(request);

    // 无配置文件时不包含 Project Configuration Context
    expect(contextString).not.toContain('Project Configuration Context');
  });
});
