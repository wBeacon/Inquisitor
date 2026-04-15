import { AgentRunner } from './agent-runner';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../types';
import { SECURITY_AGENT_PROMPT } from './prompts';

/**
 * SecurityAgent - 专注于安全性审查
 * 检查注入漏洞、XSS、权限绕过、数据泄露等安全问题
 */
export class SecurityAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>) {
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

    super(defaultConfig);
  }

  /**
   * 执行安全性审查
   */
  protected async performReview(
    files: string[],
    context: string
  ): Promise<ReviewIssue[]> {
    console.log(`SecurityAgent reviewing ${files.length} files for security vulnerabilities`);
    return [];
  }
}
