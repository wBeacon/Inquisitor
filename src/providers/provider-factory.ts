/**
 * Provider 工厂函数
 * 根据配置创建对应的 LLM Provider 实例
 */

import { LLMProvider, ProviderConfig } from './types';
import { AnthropicProvider } from './anthropic-provider';

/**
 * 创建 LLM Provider 实例
 * @param config Provider 配置，undefined 时使用默认 Anthropic
 * @returns LLMProvider 实例
 */
export function createProvider(config?: ProviderConfig): LLMProvider {
  const type = config?.type ?? 'anthropic';

  switch (type) {
    case 'anthropic':
      return new AnthropicProvider();

    default:
      throw new Error(`不支持的 Provider 类型: ${type}`);
  }
}
