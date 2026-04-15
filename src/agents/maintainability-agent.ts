import { AgentRunner } from './agent-runner';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../types';
import { MAINTAINABILITY_AGENT_PROMPT } from './prompts';

/**
 * MaintainabilityAgent - 专注于可维护性审查
 * 检查代码重复、过度复杂度、命名不当、缺失错误处理、违反 SOLID 等问题
 * 通过 Anthropic SDK 调用 Claude API，每次审查使用独立的 API session
 */
export class MaintainabilityAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>, timeout?: number) {
    const defaultConfig: AgentConfig = {
      id: config?.id || 'maintainability-agent',
      name: config?.name || 'Code Maintainability Agent',
      description:
        config?.description ||
        'Specializes in identifying maintainability issues including code duplication, complexity, and SOLID violations',
      dimension: ReviewDimension.Maintainability,
      systemPrompt: config?.systemPrompt || MAINTAINABILITY_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.5,
    };

    super(defaultConfig, timeout);
  }

  /**
   * 执行可维护性审查
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
    return `请审查以下代码的可维护性。

## 待审查文件
${files.map((f) => `- ${f}`).join('\n')}

## 代码内容
${context}

请按照系统提示中的格式要求，返回 JSON 数组。如果没有发现可维护性问题，返回空数组 []。`;
  }
}
