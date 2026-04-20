import { ReviewOrchestrator, OrchestratorConfig, ExtendedReviewMetadata } from '../orchestrator';
import { ReviewDimension, ReviewRequest } from '../types';
import { InquisitorAgentConfig, InquisitorInput, InquisitorOutput, AgentSchema } from './types';

/**
 * InquisitorAgent - 将 Inquisitor 暴露为可重用的 Agent 接口
 *
 * 支持从其他 Agent、MCP 服务、CLI 等调用 Inquisitor 的核心审查引擎。
 * 统一的 invoke() 接口标准化了输入/输出。
 */
export class InquisitorAgent {
  private orchestrator: ReviewOrchestrator;
  private config: InquisitorAgentConfig;

  constructor(config?: InquisitorAgentConfig) {
    this.config = config || {};
    this.orchestrator = new ReviewOrchestrator(
      this.buildOrchestratorConfig()
    );
  }

  /**
   * 执行代码审查
   *
   * @param input 输入文件和审查选项
   * @returns 审查结果（问题、统计、元数据）
   * @throws 当输入文件为空时抛出错误
   */
  async invoke(input: InquisitorInput): Promise<InquisitorOutput> {
    // 验证输入
    if (!input.files || input.files.length === 0) {
      throw new Error('InquisitorAgent.invoke() requires at least one file');
    }

    // 如果输入中指定了 severityThreshold，需要创建新的 Orchestrator 来应用这个配置
    let orchestrator = this.orchestrator;
    if (input.options?.severityThreshold) {
      const config = this.buildOrchestratorConfig();
      config.severityThreshold = input.options.severityThreshold;
      orchestrator = new ReviewOrchestrator(config);
    }

    // 构建 ReviewRequest
    const request = this.buildReviewRequest(input);

    // 执行审查
    const report = await orchestrator.run(request);

    // 返回标准化输出
    return {
      issues: report.issues,
      summary: report.summary,
      metadata: report.metadata as ExtendedReviewMetadata,
    };
  }

  /**
   * 获取 Agent 架构（用于 Agent 发现）
   */
  getSchema(): AgentSchema {
    return {
      name: 'inquisitor',
      description: 'High-intensity adversarial code review engine',
      input: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            description: 'Files to review',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'File path' },
                content: { type: 'string', description: 'File content (optional)' },
                diff: { type: 'string', description: 'Diff content (optional)' },
              },
              required: ['path'],
            },
          },
          options: {
            type: 'object',
            description: 'Review options',
            properties: {
              dimensions: {
                type: 'array',
                items: { type: 'string' },
                description: 'Review dimensions to check',
              },
              severityThreshold: {
                type: 'string',
                enum: ['critical', 'high', 'medium', 'low'],
                description: 'Minimum severity level to report',
              },
              enableAdversary: {
                type: 'boolean',
                description: 'Enable adversarial review',
              },
              model: {
                type: 'string',
                description: 'Custom LLM model',
              },
            },
          },
        },
        required: ['files'],
      },
    };
  }

  /**
   * 将 Agent 配置转换为 OrchestratorConfig
   */
  private buildOrchestratorConfig(): OrchestratorConfig {
    const config: OrchestratorConfig = {
      model: this.config.model,
      agentTimeout: this.config.agentTimeout,
      totalTimeout: this.config.timeout,
      enableAdversary: this.config.enableAdversary ?? true,
      maxParallel: this.config.maxParallel,
      provider: this.config.provider as any,
    };
    return config;
  }

  /**
   * 将输入转换为 ReviewRequest
   */
  private buildReviewRequest(input: InquisitorInput): ReviewRequest {
    const request: ReviewRequest = {
      files: input.files.map(f => ({
        path: f.path,
        content: f.content,
        diff: f.diff,
      })),
      dimensions: input.options?.dimensions,
      context: {
        contextLines: 50,
        includeFullFile: true,
        includeDependencies: true,
        projectRoot: process.cwd(),
      },
      mode: 'review',
    };
    return request;
  }
}

export { InquisitorAgentConfig, InquisitorInput, InquisitorOutput, AgentSchema };
