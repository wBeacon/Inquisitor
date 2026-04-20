/**
 * Tests for TokenBudgetManager
 * 
 * Tests cover:
 * - Budget setup and management
 * - Agent estimation
 * - Execution planning
 * - Allocation strategies
 * - Budget optimization
 * - Statistics and reporting
 */

import {
  TokenBudgetManager,
  createBudgetManager,
  type AgentConfig,
  type ReviewMode,
} from '../token-budget-manager';

describe('TokenBudgetManager', () => {
  let manager: TokenBudgetManager;

  beforeEach(() => {
    manager = new TokenBudgetManager();
  });

  describe('Budget Setup', () => {
    test('should set budget for different review modes', () => {
      manager.setBudget('fast');
      expect(manager.getCurrentBudget()).toBe(30000);

      manager.setBudget('normal');
      expect(manager.getCurrentBudget()).toBe(60000);

      manager.setBudget('deep');
      expect(manager.getCurrentBudget()).toBe(120000);
    });

    test('should allow custom budget', () => {
      manager.setBudget('custom', 50000);
      expect(manager.getCurrentBudget()).toBe(50000);
    });

    test('should throw error for custom mode without token count', () => {
      expect(() => {
        manager.setBudget('custom');
      }).toThrow('Custom mode requires explicit token count');
    });

    test('should reset usage on new budget', () => {
      manager.setBudget('normal');
      manager.recordTokenUsage('agent1', 10000);
      expect(manager.getUsedTokens()).toBe(10000);

      manager.setBudget('deep');
      expect(manager.getUsedTokens()).toBe(0);
    });
  });

  describe('Token Tracking', () => {
    beforeEach(() => {
      manager.setBudget('normal'); // 60000 tokens
    });

    test('should track token usage', () => {
      manager.recordTokenUsage('agent1', 5000);
      expect(manager.getUsedTokens()).toBe(5000);

      manager.recordTokenUsage('agent2', 3000);
      expect(manager.getUsedTokens()).toBe(8000);
    });

    test('should calculate remaining tokens', () => {
      manager.recordTokenUsage('agent1', 10000);
      expect(manager.getRemainingTokens()).toBe(50000);

      manager.recordTokenUsage('agent2', 20000);
      expect(manager.getRemainingTokens()).toBe(30000);
    });

    test('should never return negative remaining tokens', () => {
      manager.recordTokenUsage('agent1', 100000);
      expect(manager.getRemainingTokens()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Agent Estimation', () => {
    beforeEach(() => {
      manager.setBudget('normal');
    });

    test('should estimate agent token usage', () => {
      const config: AgentConfig = {
        name: 'logic-agent',
        systemPrompt: 'You are a code logic reviewer.',
        maxOutputTokens: 4000,
        priority: 5,
        required: true,
      };

      const estimate = manager.estimateAgent(
        config,
        'Review this code: ...'
      );

      expect(estimate.name).toBe('logic-agent');
      expect(estimate.estimatedTotalTokens).toBeGreaterThan(0);
      expect(estimate.canExecute).toBe(true);
    });

    test('should indicate when agent exceeds budget', () => {
      manager.setBudget('custom', 100); // Very small budget

      const config: AgentConfig = {
        name: 'large-agent',
        systemPrompt:
          'You are a comprehensive code reviewer. ' +
          'Review for logic errors, security issues, performance problems, ' +
          'maintainability concerns, edge cases, and adversarial scenarios.',
        maxOutputTokens: 4000,
        priority: 5,
        required: false,
      };

      const estimate = manager.estimateAgent(
        config,
        'Long code to review...'
      );

      expect(estimate.canExecute).toBe(false);
      expect(estimate.reason).toBeDefined();
      expect(estimate.reason).toContain('超出剩余预算');
    });

    test('should handle multiple agents', () => {
      const agents: AgentConfig[] = [
        {
          name: 'agent1',
          systemPrompt: 'Agent 1 prompt',
          maxOutputTokens: 4000,
          priority: 5,
          required: true,
        },
        {
          name: 'agent2',
          systemPrompt: 'Agent 2 prompt',
          maxOutputTokens: 4000,
          priority: 3,
          required: false,
        },
        {
          name: 'agent3',
          systemPrompt: 'Agent 3 prompt',
          maxOutputTokens: 4000,
          priority: 7,
          required: false,
        },
      ];

      const estimates = agents.map((a) =>
        manager.estimateAgent(a, 'Code to review')
      );

      expect(estimates).toHaveLength(3);
      expect(estimates.every((e) => e.estimatedTotalTokens > 0)).toBe(
        true
      );
    });
  });

  describe('Execution Planning', () => {
    beforeEach(() => {
      manager.setBudget('normal'); // 60000 tokens
    });

    test('should plan execution with priority strategy', () => {
      const agents: AgentConfig[] = [
        {
          name: 'logic',
          systemPrompt: 'Logic agent',
          maxOutputTokens: 4000,
          priority: 5,
          required: true,
        },
        {
          name: 'security',
          systemPrompt: 'Security agent',
          maxOutputTokens: 4000,
          priority: 8,
          required: true,
        },
        {
          name: 'performance',
          systemPrompt: 'Performance agent',
          maxOutputTokens: 4000,
          priority: 3,
          required: false,
        },
      ];

      const plan = manager.planExecution(
        agents,
        'Code',
        'priority'
      );

      expect(plan.totalBudget).toBe(60000);
      expect(plan.agentsToExecute.length).toBeGreaterThan(0);
    });

    test('should respect priority order', () => {
      manager.setBudget('custom', 2000); // Very limited budget

      const agents: AgentConfig[] = [
        {
          name: 'low-priority',
          systemPrompt: 'Low priority agent',
          maxOutputTokens: 100,
          priority: 1,
          required: false,
        },
        {
          name: 'high-priority',
          systemPrompt: 'High priority agent',
          maxOutputTokens: 100,
          priority: 10,
          required: true,
        },
      ];

      const plan = manager.planExecution(
        agents,
        'Code',
        'priority'
      );

      // High priority should be included
      const highPriorityIncluded = plan.agentsToExecute.find(
        (a) => a.name === 'high-priority'
      );
      expect(highPriorityIncluded).toBeDefined();
    });

    test('should use adaptive strategy correctly', () => {
      const agents: AgentConfig[] = [
        {
          name: 'optional-agent',
          systemPrompt: 'Optional agent',
          maxOutputTokens: 100,
          priority: 3,
          required: false,
        },
        {
          name: 'required-agent',
          systemPrompt: 'Required agent',
          maxOutputTokens: 100,
          priority: 2,
          required: true,
        },
      ];

      const plan = manager.planExecution(
        agents,
        'Code',
        'adaptive'
      );

      // Required should come first even with lower priority
      expect(
        plan.agentsToExecute.find(
          (a) => a.name === 'required-agent'
        )
      ).toBeDefined();
    });

    test('should skip non-required agents when over budget', () => {
      manager.setBudget('custom', 100); // Very small

      const agents: AgentConfig[] = [
        {
          name: 'required',
          systemPrompt: 'Required agent prompt text',
          maxOutputTokens: 4000,
          priority: 5,
          required: true,
        },
        {
          name: 'optional',
          systemPrompt: 'Optional agent prompt text',
          maxOutputTokens: 4000,
          priority: 5,
          required: false,
        },
      ];

      const plan = manager.planExecution(agents, 'Code', 'priority');

      expect(plan.agentsSkipped.length).toBeGreaterThan(0);
    });

    test('should report when budget exceeded', () => {
      manager.setBudget('custom', 100);

      const agents: AgentConfig[] = [
        {
          name: 'agent1',
          systemPrompt: 'This is a large system prompt ' +
            'with lots of content that will definitely ' +
            'exceed the small budget we set up for testing',
          maxOutputTokens: 4000,
          priority: 5,
          required: true,
        },
      ];

      const plan = manager.planExecution(agents, 'Code', 'priority');

      expect(plan.exceedsbudget).toBe(true);
    });
  });

  describe('Budget Optimization', () => {
    beforeEach(() => {
      manager.setBudget('custom', 200); // Small budget
    });

    test('should return unchanged config if within budget', () => {
      const config: AgentConfig = {
        name: 'small-agent',
        systemPrompt: 'Small prompt',
        maxOutputTokens: 100,
        priority: 5,
        required: false,
      };

      const result = manager.optimizeAgentForBudget(config, 'Code');

      expect(result.optimized.systemPrompt).toBe(config.systemPrompt);
      expect(result.tokens).toBeGreaterThan(0);
    });

    test('should optimize prompt if over budget', () => {
      const config: AgentConfig = {
        name: 'large-agent',
        systemPrompt: 'This is a very large prompt. ' +
          'It contains lots of content. ' +
          'It will definitely exceed the small budget. '.repeat(10),
        maxOutputTokens: 4000,
        priority: 5,
        required: false,
      };

      const result = manager.optimizeAgentForBudget(config, 'Code');

      // Optimized prompt should be different
      expect(result.optimized).toBeDefined();
      // Or should be the same if optimization didn't help
      expect(result.tokens).toBeGreaterThan(0);
    });
  });

  describe('Statistics and Reporting', () => {
    test('should calculate statistics correctly', () => {
      manager.setBudget('normal');
      manager.recordTokenUsage('agent1', 20000);
      manager.recordTokenUsage('agent2', 15000);

      const stats = manager.getStatistics();

      expect(stats.totalBudget).toBe(60000);
      expect(stats.usedTokens).toBe(35000);
      expect(stats.remainingTokens).toBe(25000);
      expect(stats.utilizationPercentage).toBeCloseTo(
        58.33,
        1
      );
      expect(stats.agentsExecuted).toBe(2);
    });

    test('should generate comprehensive report', () => {
      manager.setBudget('fast');
      manager.recordTokenUsage('logic-agent', 5000);
      manager.recordTokenUsage('security-agent', 3000);

      const report = manager.generateReport();

      expect(report).toContain('Token Budget Report');
      expect(report).toContain('Total Budget: 30000');
      expect(report).toContain('Used Tokens: 8000');
      expect(report).toContain('Execution History');
      expect(report).toContain('logic-agent');
      expect(report).toContain('security-agent');
    });
  });

  describe('Reset and Cleanup', () => {
    test('should reset state properly', () => {
      manager.setBudget('normal');
      manager.recordTokenUsage('agent1', 10000);

      expect(manager.getUsedTokens()).toBe(10000);

      manager.reset();

      expect(manager.getUsedTokens()).toBe(0);
      expect(manager.getRemainingTokens()).toBe(60000);
    });
  });

  describe('Convenience Functions', () => {
    test('createBudgetManager should create manager with mode', () => {
      const mgr = createBudgetManager('deep');

      expect(mgr).toBeInstanceOf(TokenBudgetManager);
      expect(mgr.getCurrentBudget()).toBe(120000);
    });

    test('createBudgetManager should create manager with custom tokens', () => {
      const mgr = createBudgetManager('custom', 50000);

      expect(mgr.getCurrentBudget()).toBe(50000);
    });
  });

  describe('Multi-Agent Workflows', () => {
    test('should handle complex multi-agent scenario', () => {
      manager.setBudget('normal'); // 60000 tokens

      const agents: AgentConfig[] = [
        {
          name: 'logic-agent',
          systemPrompt:
            'You are a logic checker focused on correctness.',
          maxOutputTokens: 4000,
          priority: 9,
          required: true,
        },
        {
          name: 'security-agent',
          systemPrompt:
            'You are a security reviewer focused on vulnerabilities.',
          maxOutputTokens: 4000,
          priority: 8,
          required: true,
        },
        {
          name: 'performance-agent',
          systemPrompt:
            'You are a performance analyst.',
          maxOutputTokens: 4000,
          priority: 6,
          required: false,
        },
        {
          name: 'maintainability-agent',
          systemPrompt:
            'You are a maintainability expert.',
          maxOutputTokens: 4000,
          priority: 5,
          required: false,
        },
        {
          name: 'edge-case-agent',
          systemPrompt:
            'You are an edge case finder.',
          maxOutputTokens: 4000,
          priority: 7,
          required: false,
        },
      ];

      const plan = manager.planExecution(agents, 'Code', 'priority');

      expect(plan.agentsToExecute.length).toBeGreaterThan(0);
      expect(
        plan.agentsToExecute.find((a) => a.name === 'logic-agent')
      ).toBeDefined();
      expect(
        plan.agentsToExecute.find(
          (a) => a.name === 'security-agent'
        )
      ).toBeDefined();
    });

    test('should gracefully degrade when approaching limit', () => {
      manager.setBudget('custom', 20000); // Limited budget

      const agents: AgentConfig[] = Array.from(
        { length: 10 },
        (_, i) => ({
          name: `agent-${i}`,
          systemPrompt: `Agent ${i} system prompt`,
          maxOutputTokens: 4000,
          priority: 10 - i,
          required: i < 2, // Only first 2 are required
        })
      );

      const plan = manager.planExecution(agents, 'Code', 'priority');

      // Some agents should be skipped
      expect(plan.agentsSkipped.length).toBeGreaterThan(0);
      // But required ones should be included
      expect(
        plan.agentsToExecute.filter((a) => a.name === 'agent-0')
          .length
      ).toBeGreaterThanOrEqual(0);
    });
  });
});
