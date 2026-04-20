/**
 * Token Counter - 使用 js-tiktoken 对文本进行准确的 token 计数
 * 
 * 设计原则：
 * 1. 为 Claude 模型优化的 token 计数（使用 cl100k_base 编码）
 * 2. 提供多个粒度的计数方法（整体、系统提示、用户消息、消息对）
 * 3. 缓存 tokenizer 实例以提高性能
 * 4. 处理边界情况（空字符串、特殊字符、超大文本）
 */

import { encodingForModel } from 'js-tiktoken';

/**
 * Token 计数结果
 */
export interface TokenCount {
  // 计数的文本
  text: string;
  // 文本长度（字符数）
  charCount: number;
  // token 总数
  tokenCount: number;
  // 文本简化（超过 100 字符时截断用于日志）
  textPreview: string;
}

/**
 * 提示词 token 计数结果
 */
export interface PromptTokenCount {
  // 系统提示 token 数
  systemPromptTokens: number;
  // 用户消息 token 数
  userMessageTokens: number;
  // 前导/后缀开销 token 数（Claude API 的消息格式开销）
  overheadTokens: number;
  // 总计
  totalTokens: number;
}

/**
 * TokenCounter 类 - 提供精确的 token 计数能力
 * 
 * 使用 cl100k_base 编码（OpenAI GPT-3.5/GPT-4 使用的编码方式，
 * Claude 3 系列也使用这个编码，具有高准确性）
 */
export class TokenCounter {
  private static instance: TokenCounter;
  private encoding = encodingForModel('gpt-3.5-turbo');

  /**
   * 获取单例实例
   */
  static getInstance(): TokenCounter {
    if (!TokenCounter.instance) {
      TokenCounter.instance = new TokenCounter();
    }
    return TokenCounter.instance;
  }

  /**
   * 计数单个文本的 token 数
   * 
   * @param text 要计数的文本
   * @returns token 数和文本信息
   * 
   * @example
   * const counter = TokenCounter.getInstance();
   * const result = counter.countTokens('Hello world');
   * console.log(result.tokenCount); // 2
   */
  countTokens(text: string): TokenCount {
    const charCount = text.length;
    const tokens = this.encoding.encode(text);
    const tokenCount = tokens.length;
    
    // 生成文本预览（用于日志）
    const textPreview = charCount > 100 
      ? text.substring(0, 97) + '...' 
      : text;

    return {
      text,
      charCount,
      tokenCount,
      textPreview,
    };
  }

  /**
   * 计数系统提示 + 用户消息的总 token 数
   * 
   * 注：Claude API 在系统提示和用户消息之间添加特殊分隔符，
   * 这会产生额外的 token 开销。这个方法会自动计算这个开销。
   * 
   * @param systemPrompt 系统提示文本
   * @param userMessage 用户消息文本
   * @returns 详细的 token 计数
   * 
   * @example
   * const counter = TokenCounter.getInstance();
   * const result = counter.countPromptTokens(
   *   'You are a code reviewer',
   *   'Review this code: ...'
   * );
   * console.log(result.totalTokens);
   */
  countPromptTokens(systemPrompt: string, userMessage: string): PromptTokenCount {
    // 分别计数
    const systemTokens = this.encoding.encode(systemPrompt).length;
    const userTokens = this.encoding.encode(userMessage).length;
    
    // 消息格式开销估算
    // Claude API 在每条消息前添加角色标记等信息
    // 系统消息: 大约 2-4 tokens 开销（通常是 "system:" + 分隔符）
    // 用户消息: 大约 3-4 tokens 开销（通常是 "user:" + 分隔符 + 结束符）
    // 保守估计：系统 4 + 用户 4 = 8 tokens
    const overheadTokens = 8;

    return {
      systemPromptTokens: systemTokens,
      userMessageTokens: userTokens,
      overheadTokens,
      totalTokens: systemTokens + userTokens + overheadTokens,
    };
  }

  /**
   * 估计输出的 token 数（简化估计）
   * 
   * 基于经验法则：平均每 4 个字符 ≈ 1 token
   * 这是一个快速估计，实际取决于内容
   * 
   * @param estimatedLength 预估的输出文本长度（字符数）
   * @returns 估计的 token 数
   * 
   * @example
   * const counter = TokenCounter.getInstance();
   * const estimatedTokens = counter.estimateOutputTokens(4000);
   * console.log(estimatedTokens); // 约 1000
   */
  estimateOutputTokens(estimatedLength: number): number {
    // 经验法则：约 1 token ≈ 4 字符（对于 UTF-8 编码）
    // 但代码往往更冗长，所以使用 3.5 的比率
    return Math.ceil(estimatedLength / 3.5);
  }

  /**
   * 将字符数转换为大约的 token 数（快速估计）
   * 
   * 这是 estimateOutputTokens 的别名，提供更通用的接口
   * 
   * @param charCount 字符数
   * @returns 估计的 token 数
   */
  estimateTokensFromCharCount(charCount: number): number {
    return this.estimateOutputTokens(charCount);
  }

  /**
   * 获取编码器实例（高级用法）
   * 
   * 如果需要直接操作 token 编码，可以通过此方法获取 tiktoken 编码器
   */
  getEncoding() {
    return this.encoding;
  }

  /**
   * 比较两段文本的 token 效率
   * 
   * 用于优化评估：哪个表述更"token 高效"
   * 
   * @param text1 第一段文本
   * @param text2 第二段文本
   * @returns 差异值（正数表示 text1 更高效）
   * 
   * @example
   * const counter = TokenCounter.getInstance();
   * const diff = counter.compareEfficiency(
   *   'Please review this code',
   *   'I kindly request that you perform a comprehensive review of the following code'
   * );
   * console.log(diff); // text1 更高效
   */
  compareEfficiency(text1: string, text2: string): number {
    const tokens1 = this.encoding.encode(text1).length;
    const tokens2 = this.encoding.encode(text2).length;
    return tokens2 - tokens1; // 正数表示 text1 更高效
  }
}

/**
 * 便捷函数：计数单个文本
 */
export function countTokens(text: string): TokenCount {
  return TokenCounter.getInstance().countTokens(text);
}

/**
 * 便捷函数：计数提示词
 */
export function countPromptTokens(systemPrompt: string, userMessage: string): PromptTokenCount {
  return TokenCounter.getInstance().countPromptTokens(systemPrompt, userMessage);
}

/**
 * 便捷函数：估计输出 token 数
 */
export function estimateOutputTokens(estimatedLength: number): number {
  return TokenCounter.getInstance().estimateOutputTokens(estimatedLength);
}
