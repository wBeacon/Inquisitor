/**
 * Provider 工厂函数单元测试
 */

// mock @anthropic-ai/sdk 避免 AnthropicProvider 初始化时报错
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: jest.fn() },
  }));
});

import { createProvider } from '../../src/providers/provider-factory';
import { AnthropicProvider } from '../../src/providers/anthropic-provider';

describe('createProvider', () => {
  it('默认创建 AnthropicProvider', () => {
    const provider = createProvider();
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.type).toBe('anthropic');
  });

  it('config 为 undefined 时创建 AnthropicProvider', () => {
    const provider = createProvider(undefined);
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it('type 为 anthropic 时创建 AnthropicProvider', () => {
    const provider = createProvider({ type: 'anthropic' });
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it('不支持的类型应抛出错误', () => {
    expect(() => createProvider({ type: 'unknown' as any })).toThrow('不支持');
  });
});
