import { AgentRunner } from './agent-runner';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../types';
import { EDGE_CASE_AGENT_PROMPT } from './prompts';

export class EdgeCaseAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>) {
    const defaultConfig: AgentConfig = {
      id: config?.id || 'edge-case-agent',
      name: config?.name || 'Edge Cases Agent',
      description: config?.description || 'Specializes in identifying edge cases including null inputs, boundary conditions, and resource exhaustion',
      dimension: ReviewDimension.EdgeCases,
      systemPrompt: config?.systemPrompt || EDGE_CASE_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.5,
    };
    super(defaultConfig);
  }

  protected async performReview(_files: string[], _context: string): Promise<ReviewIssue[]> {
    console.log(`EdgeCaseAgent reviewing for edge cases`);
    return [];
  }
}
