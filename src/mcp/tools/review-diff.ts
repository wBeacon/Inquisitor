/**
 * review-diff.ts - MCP 工具: 审查 git diff
 *
 * 接收 diff 字符串，调用 ReviewOrchestrator 执行完整审查流程，
 * 返回 Markdown 格式的审查报告。
 */

import { z } from 'zod';
import { ReviewRequest, ReviewDimension } from '../../types';
import { ReviewOrchestrator, OrchestratorConfig } from '../../orchestrator';
import { DEFAULT_PROVIDER_TYPE } from '../../orchestrator/config';
import { ReportGenerator } from '../../output';
import { GitDiffCollector } from '../../input';
import { getRuntimeConfig } from './configure';

/**
 * review_diff 工具的 inputSchema 定义（zod shape）
 */
export const reviewDiffSchema = {
  diff: z.string().describe('要审查的 git diff 内容'),
  severity_threshold: z
    .enum(['critical', 'high', 'medium', 'low'])
    .optional()
    .describe('最低严重程度阈值，低于此阈值的问题不报告'),
  dimensions: z
    .array(z.enum(['logic', 'security', 'performance', 'maintainability', 'edge_cases']))
    .optional()
    .describe('要启用的审查维度列表，默认启用全部'),
  enable_adversary: z
    .boolean()
    .default(true)
    .describe('是否启用对抗审查（默认 true）'),
  enable_meta_review: z
    .boolean()
    .default(false)
    .describe('是否启用元审查终审（默认 false）'),
  max_adversary_rounds: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(1)
    .describe('对抗审查最大轮数（1-5，默认 1）'),
};

/**
 * review_diff 工具的处理函数
 * 解析 diff 文本、构建审查请求、执行编排器、返回 Markdown 报告
 */
export async function handleReviewDiff(args: {
  diff: string;
  severity_threshold?: string;
  dimensions?: string[];
  enable_adversary?: boolean;
  enable_meta_review?: boolean;
  max_adversary_rounds?: number;
}): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    // 合并运行时持久化配置（包含 provider 等），调用参数优先级更高
    // MCP 入口默认使用 Anthropic provider；运行时或 .inquisitor-mcp.json 可覆盖
    const runtime = getRuntimeConfig();
    const orchestratorConfig: OrchestratorConfig = {
      ...runtime,
      provider: runtime.provider ?? { type: DEFAULT_PROVIDER_TYPE },
      enableAdversary: args.enable_adversary ?? runtime.enableAdversary ?? true,
      enableMetaReview: args.enable_meta_review ?? runtime.enableMetaReview ?? false,
      maxAdversaryRounds: args.max_adversary_rounds ?? runtime.maxAdversaryRounds ?? 1,
      severityThreshold: args.severity_threshold ?? runtime.severityThreshold,
    };

    const orchestrator = new ReviewOrchestrator(orchestratorConfig);

    // 从 diff 文本解析文件列表
    const collector = new GitDiffCollector();
    const hunks = collector.parseDiff(args.diff);
    const files = collector.hunksToFileToReview(hunks);

    // 构建审查请求
    const request: ReviewRequest = {
      files,
      diff: args.diff,
      dimensions: args.dimensions as ReviewDimension[] | undefined,
      context: {
        contextLines: 50,
        includeFullFile: true,
        includeDependencies: false,
        projectRoot: process.cwd(),
      },
      mode: 'review',
    };

    // 执行审查
    const report = await orchestrator.run(request);

    // 生成 Markdown 报告
    const generator = new ReportGenerator({ formats: ['markdown'] });
    const markdown = generator.toMarkdown(report);

    // 仅当 100% agent 都失败时标 isError=true；部分失败依赖 markdown 顶部警告提醒
    const failureCount = report.metadata.incompleteAgents?.length ?? 0;
    const totalAgents = report.metadata.agents.length;
    const allFailed = failureCount > 0 && failureCount === totalAgents;

    return {
      content: [{ type: 'text', text: markdown }],
      ...(allFailed ? { isError: true } : {}),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `审查执行失败: ${errorMessage}` }],
      isError: true,
    };
  }
}
