import { AgentRunner } from './agent-runner';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../types';
import { EDGE_CASE_AGENT_PROMPT } from './prompts';

/**
 * EdgeCaseAgent - 专注于边界情况审查
 * 检查空输入、超大输入、并发场景、网络失败、磁盘满等边界情况
 * 通过 Anthropic SDK 调用 Claude API，每次审查使用独立的 API session
 */
export class EdgeCaseAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>, timeout?: number) {
    const defaultConfig: AgentConfig = {
      id: config?.id || 'edge-case-agent',
      name: config?.name || 'Edge Cases Agent',
      description:
        config?.description ||
        'Specializes in identifying edge cases including null inputs, boundary conditions, and resource exhaustion',
      dimension: ReviewDimension.EdgeCases,
      systemPrompt: config?.systemPrompt || EDGE_CASE_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.5,
    };

    super(defaultConfig, timeout);
  }

  /**
   * 执行边界情况审查
   * 调用 Claude API 并解析返回的审查结果
   */
  protected async performReview(
    files: string[],
    context: string
  ): Promise<ReviewIssue[]> {
    const userMessage = this.buildUserMessage(files, context);
    const responseText = await this.callClaudeAPI(userMessage);
    return this.parseJsonResponse(responseText);
  }

  /**
   * 构建发送给 Claude 的用户消息
   */
  private buildUserMessage(files: string[], context: string): string {
    return `请审查以下代码的边界情况处理。

## 待审查文件
${files.map((f) => `- ${f}`).join('\n')}

## 代码内容
${context}

请按照系统提示中的格式要求，返回 JSON 数组。如果没有发现边界情况问题，返回空数组 []。`;
  }
}
