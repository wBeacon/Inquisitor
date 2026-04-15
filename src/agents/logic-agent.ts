import { AgentRunner } from './agent-runner';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../types';
import { LOGIC_AGENT_PROMPT } from './prompts';

/**
 * LogicAgent - 专注于逻辑正确性审查
 * 检查控制流、数据流、循环、空值处理、类型匹配等逻辑问题
 * 通过 Anthropic SDK 调用 Claude API，每次审查使用独立的 API session
 */
export class LogicAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>, timeout?: number) {
    const defaultConfig: AgentConfig = {
      id: config?.id || 'logic-agent',
      name: config?.name || 'Logic Correctness Agent',
      description:
        config?.description ||
        'Specializes in finding logic errors including control flow, data flow, loops, null handling, and type mismatches',
      dimension: ReviewDimension.Logic,
      systemPrompt: config?.systemPrompt || LOGIC_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.5,
    };

    super(defaultConfig, timeout);
  }

  /**
   * 执行逻辑审查
   * 调用 Claude API 并解析返回的审查结果
   */
  protected async performReview(
    files: string[],
    context: string
  ): Promise<ReviewIssue[]> {
    // 构建用户消息，包含文件列表和代码上下文
    const userMessage = this.buildUserMessage(files, context);

    // 调用 Claude API
    const responseText = await this.callClaudeAPI(userMessage);

    // 健壮地解析 JSON 响应，自动修正 dimension
    return this.parseJsonResponse(responseText);
  }

  /**
   * 构建发送给 Claude 的用户消息
   */
  private buildUserMessage(files: string[], context: string): string {
    return `请审查以下代码的逻辑正确性。

## 待审查文件
${files.map((f) => `- ${f}`).join('\n')}

## 代码内容
${context}

请按照系统提示中的格式要求，返回 JSON 数组。如果没有发现问题，返回空数组 []。`;
  }
}
