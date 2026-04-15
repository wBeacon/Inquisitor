import { AgentRunner } from './agent-runner';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../types';
import { PERFORMANCE_AGENT_PROMPT } from './prompts';

export class PerformanceAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>) {
    const defaultConfig: AgentConfig = {
      id: config?.id || 'performance-agent',
      name: config?.name || 'Performance Issues Agent',
      description: config?.description || 'Specializes in identifying performance issues including N+1 queries, memory leaks, and inefficient algorithms',
      dimension: ReviewDimension.Performance,
      systemPrompt: config?.systemPrompt || PERFORMANCE_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.5,
    };
    super(defaultConfig);
  }

  protected async performReview(_files: string[], _context: string): Promise<ReviewIssue[]> {
    console.log(`PerformanceAgent reviewing for performance issues`);
    return [];
  }
}
