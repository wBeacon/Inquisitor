/**
 * LLM Provider 类型和接口定义
 * 提供 Provider 无关的统一抽象
 */

/**
 * LLM Provider 类型标识
 */
export type ProviderType = 'anthropic';

/**
 * Provider 配置
 */
export interface ProviderConfig {
  /** Provider 类型 */
  type: ProviderType;
  /** 模型名称（覆盖 provider 默认模型） */
  model?: string;
  /** 自定义 API URL（可选） */
  baseUrl?: string;
  /** 自定义 API Key（可选，覆盖环境变量） */
  apiKey?: string;
}

/**
 * LLM 聊天请求参数 - Provider 无关的统一格式
 */
export interface LLMChatRequest {
  /** 模型名称 */
  model: string;
  /** 系统提示词 */
  systemPrompt: string;
  /** 用户消息 */
  userMessage: string;
  /** 最大输出 token 数 */
  maxTokens: number;
  /** 温度参数 */
  temperature: number;
}

/**
 * LLM 聊天响应 - Provider 无关的统一格式
 */
export interface LLMChatResponse {
  /** 生成的文本内容 */
  text: string;
  /** Token 使用量 */
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
}

/**
 * LLM Provider 接口 - 所有 Provider 必须实现此接口
 */
export interface LLMProvider {
  /** Provider 类型标识 */
  readonly type: ProviderType;
  /** 默认模型名称 */
  readonly defaultModel: string;
  /**
   * 发送聊天请求
   * @param request 统一格式的请求参数
   * @returns 统一格式的响应
   */
  chat(request: LLMChatRequest): Promise<LLMChatResponse>;
}
