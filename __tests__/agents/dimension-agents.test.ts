import {
  LogicAgent,
  SecurityAgent,
  PerformanceAgent,
  MaintainabilityAgent,
  EdgeCaseAgent,
} from '../../src/agents';
import { ReviewDimension } from '../../src/types';

describe('Dimension Agents', () => {
  describe('LogicAgent', () => {
    it('should have correct configuration', () => {
      const agent = new LogicAgent();
      expect(agent.getId()).toBe('logic-agent');
      expect(agent.getName()).toBe('Logic Correctness Agent');
      expect(agent.getDimension()).toBe(ReviewDimension.Logic);
    });

    it('should support custom configuration', () => {
      const agent = new LogicAgent({
        id: 'custom-logic',
        name: 'Custom Logic Agent',
      });
      expect(agent.getId()).toBe('custom-logic');
      expect(agent.getName()).toBe('Custom Logic Agent');
    });

    it('should have system prompt defined', () => {
      const agent = new LogicAgent();
      const config = agent.getConfig();
      expect(config.systemPrompt).toBeDefined();
      expect(config.systemPrompt.length).toBeGreaterThan(0);
    });

    it('should be able to perform review', async () => {
      const agent = new LogicAgent();
      const result = await agent.review(['test.ts'], 'function test() {}');
      expect(result.agentId).toBe('logic-agent');
      expect(result.success).toBe(true);
      expect(result.issues).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SecurityAgent', () => {
    it('should have correct configuration', () => {
      const agent = new SecurityAgent();
      expect(agent.getId()).toBe('security-agent');
      expect(agent.getDimension()).toBe(ReviewDimension.Security);
    });

    it('should have security-focused system prompt', () => {
      const agent = new SecurityAgent();
      const config = agent.getConfig();
      expect(config.systemPrompt).toBeDefined();
    });
  });

  describe('PerformanceAgent', () => {
    it('should have correct configuration', () => {
      const agent = new PerformanceAgent();
      expect(agent.getId()).toBe('performance-agent');
      expect(agent.getDimension()).toBe(ReviewDimension.Performance);
    });
  });

  describe('MaintainabilityAgent', () => {
    it('should have correct configuration', () => {
      const agent = new MaintainabilityAgent();
      expect(agent.getId()).toBe('maintainability-agent');
      expect(agent.getDimension()).toBe(ReviewDimension.Maintainability);
    });
  });

  describe('EdgeCaseAgent', () => {
    it('should have correct configuration', () => {
      const agent = new EdgeCaseAgent();
      expect(agent.getId()).toBe('edge-case-agent');
      expect(agent.getDimension()).toBe(ReviewDimension.EdgeCases);
    });
  });

  describe('Parallel Execution', () => {
    it('should support parallel review execution', async () => {
      const agents = [
        new LogicAgent(),
        new SecurityAgent(),
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      const startTime = Date.now();
      const results = await Promise.all(
        agents.map((agent) => agent.review(['test.ts'], 'const x = 1;'))
      );
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(5);
      expect(results.every((r) => r.success)).toBe(true);

      // All should complete within reasonable time (parallel execution)
      // If sequential, this would take much longer
      expect(duration).toBeLessThan(5000);
    });

    it('should maintain agent independence', async () => {
      const agent1 = new LogicAgent();
      const agent2 = new SecurityAgent();

      const result1 = await agent1.review(['test.ts'], 'code1');
      const result2 = await agent2.review(['test.ts'], 'code2');

      expect(result1.agentId).toBe('logic-agent');
      expect(result2.agentId).toBe('security-agent');
      expect(result1.agentId).not.toBe(result2.agentId);
    });
  });

  describe('System Prompts', () => {
    it('should have comprehensive system prompts for all agents', () => {
      const agents = [
        new LogicAgent(),
        new SecurityAgent(),
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      for (const agent of agents) {
        const config = agent.getConfig();
        expect(config.systemPrompt).toBeDefined();
        expect(config.systemPrompt.length).toBeGreaterThan(500);
      }
    });

    it('should have output format specifications in prompts', () => {
      const agents = [
        new LogicAgent(),
        new SecurityAgent(),
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      for (const agent of agents) {
        const prompt = agent.getConfig().systemPrompt;
        expect(prompt.toLowerCase()).toContain('json');
        expect(prompt).toContain('dimension');
        expect(prompt).toContain('confidence');
      }
    });
  });

  describe('Agent Configuration', () => {
    it('should have default max tokens set', () => {
      const agents = [
        new LogicAgent(),
        new SecurityAgent(),
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      for (const agent of agents) {
        const config = agent.getConfig();
        expect(config.maxTokens).toBeDefined();
        expect(config.maxTokens).toBeGreaterThan(1000);
      }
    });

    it('should have reasonable temperature values', () => {
      const agents = [
        new LogicAgent(),
        new SecurityAgent(),
        new PerformanceAgent(),
        new MaintainabilityAgent(),
        new EdgeCaseAgent(),
      ];

      for (const agent of agents) {
        const config = agent.getConfig();
        expect(config.temperature).toBeDefined();
        expect(config.temperature).toBeGreaterThanOrEqual(0);
        expect(config.temperature).toBeLessThanOrEqual(1);
      }
    });
  });
});
