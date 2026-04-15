import { AgentRunner } from './agent-runner';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../types';
import { MAINTAINABILITY_AGENT_PROMPT } from './prompts';

export class MaintainabilityAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>) {
    const defaultConfig: AgentConfig = {
      id: config?.id || 'maintainability-agent',
      name: config?.name || 'Code Maintainability Agent',
      description: config?.description || 'Specializes in identifying maintainability issues including code duplication, complexity, and SOLID violations',
      dimension: ReviewDimension.Maintainability,
      systemPrompt: config?.systemPrompt || MAINTAINABILITY_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.5,
    };
    super(defaultConfig);
  }

  protected async performReview(_files: string[], _context: string): Promise<ReviewIssue[]> {
    console.log(`MaintainabilityAgent reviewing for maintainability issues`);
    return [];
  }
}
