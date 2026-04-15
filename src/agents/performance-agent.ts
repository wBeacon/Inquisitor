import { AgentRunner } from './agent-runner';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../types';
import { PERFORMANCE_AGENT_PROMPT } from './prompts';

/**
 * PerformanceAgent - 专注于性能审查
 * 检查 N+1 查询、内存泄漏、不必要的计算、阻塞操作等性能问题
 * 通过 Anthropic SDK 调用 Claude API，每次审查使用独立的 API session
 */
export class PerformanceAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>, timeout?: number) {
    const defaultConfig: AgentConfig = {
      id: config?.id || 'performance-agent',
      name: config?.name || 'Performance Issues Agent',
      description:
        config?.description ||
        'Specializes in identifying performance issues including N+1 queries, memory leaks, and inefficient algorithms',
      dimension: ReviewDimension.Performance,
      systemPrompt: config?.systemPrompt || PERFORMANCE_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.5,
    };

    super(defaultConfig, timeout);
  }

  /**
   * 执行性能审查
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
    return `请审查以下代码的性能问题。

## 待审查文件
${files.map((f) => `- ${f}`).join('\n')}

## 代码内容
${context}

请按照系统提示中的格式要求，返回 JSON 数组。如果没有发现性能问题，返回空数组 []。`;
  }
}
