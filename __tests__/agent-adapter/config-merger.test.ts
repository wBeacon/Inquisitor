import { mergeAgentConfig } from '../../src/agent-adapter/config-merger';
import { resolveConfig } from '../../src/orchestrator/config';
import { ReviewDimension } from '../../src/types';
import { ProviderType } from '../../src/providers/types';

describe('mergeAgentConfig', () => {
  const baseConfig = resolveConfig();

  describe('basic merging', () => {
    it('should merge configs with agent taking precedence', () => {
      const agentConfig = {
        model: 'agent-model',
        maxParallel: 3,
      };

      const merged = mergeAgentConfig(agentConfig, baseConfig);

      expect(merged.model).toBe('agent-model');
      expect(merged.maxParallel).toBe(3);
    });

    it('should preserve base config values when agent config does not override', () => {
      const agentConfig = {
        model: 'agent-model',
      };

      const merged = mergeAgentConfig(agentConfig, baseConfig);

      expect(merged.model).toBe('agent-model');
      expect(merged.enableAdversary).toBe(baseConfig.enableAdversary);
    });

    it('should preserve all base config when agent config is empty', () => {
      const agentConfig = {};

      const merged = mergeAgentConfig(agentConfig, baseConfig);

      expect(merged.model).toBe(baseConfig.model);
      expect(merged.maxParallel).toBe(baseConfig.maxParallel);
      expect(merged.enableAdversary).toBe(baseConfig.enableAdversary);
    });
  });

  describe('severity threshold validation', () => {
    it('should accept valid severityThreshold: critical', () => {
      const agentConfig = {
        severityThreshold: 'critical',
      };

      const merged = mergeAgentConfig(agentConfig, baseConfig);

      expect(merged.severityThreshold).toBe('critical');
    });

    it('should accept valid severityThreshold: high', () => {
      const agentConfig = {
        severityThreshold: 'high',
      };

      const merged = mergeAgentConfig(agentConfig, baseConfig);

      expect(merged.severityThreshold).toBe('high');
    });

    it('should accept valid severityThreshold: medium', () => {
      const agentConfig = {
        severityThreshold: 'medium',
      };

      const merged = mergeAgentConfig(agentConfig, baseConfig);

      expect(merged.severityThreshold).toBe('medium');
    });

    it('should accept valid severityThreshold: low', () => {
      const agentConfig = {
        severityThreshold: 'low',
      };

      const merged = mergeAgentConfig(agentConfig, baseConfig);

      expect(merged.severityThreshold).toBe('low');
    });

    it('should throw on invalid severityThreshold', () => {
      const agentConfig = {
        severityThreshold: 'invalid',
      };

      expect(() => mergeAgentConfig(agentConfig, baseConfig)).toThrow('Invalid severityThreshold');
    });

    it('should throw on uppercase severityThreshold', () => {
      const agentConfig = {
        severityThreshold: 'HIGH',
      };

      expect(() => mergeAgentConfig(agentConfig, baseConfig)).toThrow('Invalid severityThreshold');
    });

    it('should throw on numeric severityThreshold', () => {
      const agentConfig = {
        severityThreshold: 'p1' as any,
      };

      expect(() => mergeAgentConfig(agentConfig, baseConfig)).toThrow('Invalid severityThreshold');
    });
  });

  describe('config options merging', () => {
    it('should merge all timeout options', () => {
      const agentConfig = {
        agentTimeout: 10000,
        totalTimeout: 30000,
      };

      const merged = mergeAgentConfig(agentConfig, baseConfig);

      expect(merged.agentTimeout).toBe(10000);
      expect(merged.totalTimeout).toBe(30000);
    });

    it('should merge boolean flags', () => {
      const agentConfig = {
        enableAdversary: false,
        enableCache: true,
        enableMetaReview: true,
      };

      const merged = mergeAgentConfig(agentConfig, baseConfig);

      expect(merged.enableAdversary).toBe(false);
      expect(merged.enableCache).toBe(true);
      expect(merged.enableMetaReview).toBe(true);
    });

    it('should merge skipDimensions array', () => {
      const agentConfig = {
        skipDimensions: [ReviewDimension.Security],
      };

      const merged = mergeAgentConfig(agentConfig, baseConfig);

      expect(merged.skipDimensions).toEqual([ReviewDimension.Security]);
    });

    it('should merge provider config', () => {
      const agentConfig = {
        provider: {
          type: 'anthropic' as ProviderType,
          baseUrl: 'https://example.com',
        },
      };

      const merged = mergeAgentConfig(agentConfig, baseConfig);

      expect(merged.provider?.type).toBe('anthropic');
      expect(merged.provider?.baseUrl).toBe('https://example.com');
    });

    it('should merge maxAdversaryRounds', () => {
      const agentConfig = {
        maxAdversaryRounds: 3,
      };

      const merged = mergeAgentConfig(agentConfig, baseConfig);

      expect(merged.maxAdversaryRounds).toBe(3);
    });
  });

  describe('error handling', () => {
    it('should provide helpful error message for invalid threshold', () => {
      const agentConfig = {
        severityThreshold: 'invalid-severity',
      };

      expect(() => mergeAgentConfig(agentConfig, baseConfig)).toThrow(
        /Invalid severityThreshold.*must be one of/i
      );
    });
  });

  describe('null and undefined handling', () => {
    it('should treat undefined severityThreshold as no override', () => {
      const agentConfig = {
        severityThreshold: undefined,
      };

      const merged = mergeAgentConfig(agentConfig, baseConfig);

      expect(merged.severityThreshold).toBe(baseConfig.severityThreshold);
    });

    it('should treat null severityThreshold as no override', () => {
      const agentConfig = {
        severityThreshold: null as any,
      };

      const merged = mergeAgentConfig(agentConfig, baseConfig);

      expect(merged.severityThreshold).toBe(baseConfig.severityThreshold);
    });
  });
});
