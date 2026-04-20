/**
 * AnthropicProvider 单元测试
 */

// mock @anthropic-ai/sdk
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  }));
});

import { AnthropicProvider } from '../../src/providers/anthropic-provider';

describe('AnthropicProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('type 应该为 anthropic', () => {
    const provider = new AnthropicProvider();
    expect(provider.type).toBe('anthropic');
  });

  it('defaultModel 应该为 claude-sonnet-4-20250514', () => {
    const provider = new AnthropicProvider();
    expect(provider.defaultModel).toBe('claude-sonnet-4-20250514');
  });

  it('应该正确调用 Anthropic SDK 并返回统一格式', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '审查结果' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const provider = new AnthropicProvider();
    const response = await provider.chat({
      model: 'claude-sonnet-4-20250514',
      systemPrompt: '你是代码审查员',
      userMessage: '审查这段代码',
      maxTokens: 4000,
      temperature: 0.5,
    });

    expect(response.text).toBe('审查结果');
    expect(response.tokenUsage).toEqual({
      input: 100,
      output: 50,
      total: 150,
    });

    // 验证 SDK 调用参数
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      temperature: 0.5,
      system: '你是代码审查员',
      messages: [{ role: 'user', content: '审查这段代码' }],
    });
  });

  it('应该在无文本内容时返回空字符串', async () => {
    mockCreate.mockResolvedValue({
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    });

    const provider = new AnthropicProvider();
    const response = await provider.chat({
      model: 'test-model',
      systemPrompt: 'test',
      userMessage: 'test',
      maxTokens: 100,
      temperature: 0,
    });

    expect(response.text).toBe('');
  });

  it('应该在 API 错误时抛出异常', async () => {
    mockCreate.mockRejectedValue(new Error('API rate limit'));

    const provider = new AnthropicProvider();
    await expect(
      provider.chat({
        model: 'test-model',
        systemPrompt: 'test',
        userMessage: 'test',
        maxTokens: 100,
        temperature: 0,
      })
    ).rejects.toThrow('API rate limit');
  });
});
