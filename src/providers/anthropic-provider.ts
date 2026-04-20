/**
 * AnthropicProvider - 通过 Anthropic SDK 调用 Claude API
 * 从 AgentRunner.callClaudeAPI 提取而来，保持原有的隔离设计：
 * 每次 chat() 调用创建独立的客户端实例，确保无共享状态。
 */

import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMChatRequest, LLMChatResponse } from './types';

/** Anthropic 默认模型 */
const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-20250514';

export class AnthropicProvider implements LLMProvider {
  readonly type = 'anthropic' as const;
  readonly defaultModel = ANTHROPIC_DEFAULT_MODEL;

  async chat(request: LLMChatRequest): Promise<LLMChatResponse> {
    // 每次调用创建新的客户端实例，确保无共享状态
    const client = new Anthropic();

    const response = await client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      system: request.systemPrompt,
      messages: [
        {
          role: 'user',
          content: request.userMessage,
        },
      ],
    });

    // 提取文本内容
    const textContent = response.content.find((block) => block.type === 'text');

    return {
      text: textContent ? textContent.text : '',
      tokenUsage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
}
