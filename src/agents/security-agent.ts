import { AgentRunner } from './agent-runner';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../types';
import { LLMProvider } from '../providers';
import { SECURITY_AGENT_PROMPT } from './prompts';

/**
 * SecurityAgent - 专注于安全性审查
 * 检查注入漏洞、XSS、权限绕过、数据泄露等安全问题
 * 通过 LLMProvider 调用 LLM API，每次审查使用独立的 API session
 */
export class SecurityAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>, timeout?: number, provider?: LLMProvider) {
    const defaultConfig: AgentConfig = {
      id: config?.id || 'security-agent',
      name: config?.name || 'Security Vulnerabilities Agent',
      description:
        config?.description ||
        'Specializes in identifying security vulnerabilities including injection, XSS, privilege escalation, and data leakage',
      dimension: ReviewDimension.Security,
      systemPrompt: config?.systemPrompt || SECURITY_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.5,
    };

    super(defaultConfig, timeout, provider);
  }

  /**
   * 执行安全性审查
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
    return `请审查以下代码的安全性。

## 待审查文件
${files.map((f) => `- ${f}`).join('\n')}

## 代码内容
${context}

请按照系统提示中的格式要求，返回 JSON 数组。如果没有发现安全漏洞，返回空数组 []。`;
  }
}
