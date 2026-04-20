import {
  resolveConfig,
  OrchestratorConfig,
  DEFAULT_MODEL,
  DEFAULT_MAX_PARALLEL,
  DEFAULT_AGENT_TIMEOUT,
  DEFAULT_TOTAL_TIMEOUT,
  DEFAULT_ENABLE_ADVERSARY,
  DEFAULT_ENABLE_CACHE,
  DEFAULT_SKIP_DIMENSIONS,
} from '../../src/orchestrator/config';
import { ReviewDimension } from '../../src/types';

describe('OrchestratorConfig', () => {
  describe('DEFAULT_ constants', () => {
    it('should define DEFAULT_AGENT_TIMEOUT as 300000ms (5 minutes)', () => {
      expect(DEFAULT_AGENT_TIMEOUT).toBe(300000);
    });

    it('should define DEFAULT_MODEL as undefined (delegates to provider.defaultModel)', () => {
      expect(DEFAULT_MODEL).toBeUndefined();
    });

    it('should define DEFAULT_MAX_PARALLEL as 5', () => {
      expect(DEFAULT_MAX_PARALLEL).toBe(5);
    });

    it('should define DEFAULT_TOTAL_TIMEOUT as 600000', () => {
      expect(DEFAULT_TOTAL_TIMEOUT).toBe(600000);
    });

    it('should define DEFAULT_ENABLE_ADVERSARY as true', () => {
      expect(DEFAULT_ENABLE_ADVERSARY).toBe(true);
    });

    it('should define DEFAULT_ENABLE_CACHE as false', () => {
      expect(DEFAULT_ENABLE_CACHE).toBe(false);
    });

    it('should define DEFAULT_SKIP_DIMENSIONS as empty array', () => {
      expect(DEFAULT_SKIP_DIMENSIONS).toEqual([]);
    });
  });

  describe('resolveConfig', () => {
    it('should return all defaults when no config provided', () => {
      const resolved = resolveConfig();
      expect(resolved.model).toBeUndefined();
      expect(resolved.maxParallel).toBe(DEFAULT_MAX_PARALLEL);
      expect(resolved.agentTimeout).toBe(DEFAULT_AGENT_TIMEOUT);
      expect(resolved.totalTimeout).toBe(DEFAULT_TOTAL_TIMEOUT);
      expect(resolved.enableAdversary).toBe(DEFAULT_ENABLE_ADVERSARY);
      expect(resolved.enableCache).toBe(DEFAULT_ENABLE_CACHE);
      expect(resolved.skipDimensions).toEqual(DEFAULT_SKIP_DIMENSIONS);
    });

    it('should override specific fields', () => {
      const config: OrchestratorConfig = {
        model: 'claude-sonnet',
        agentTimeout: 60000,
      };
      const resolved = resolveConfig(config);
      expect(resolved.model).toBe('claude-sonnet');
      expect(resolved.agentTimeout).toBe(60000);
      // 其他保持默认
      expect(resolved.maxParallel).toBe(DEFAULT_MAX_PARALLEL);
      expect(resolved.enableAdversary).toBe(true);
    });

    it('should support enableAdversary=false', () => {
      const resolved = resolveConfig({ enableAdversary: false });
      expect(resolved.enableAdversary).toBe(false);
    });

    it('should support skipDimensions', () => {
      const resolved = resolveConfig({
        skipDimensions: [ReviewDimension.Performance, ReviewDimension.Maintainability],
      });
      expect(resolved.skipDimensions).toEqual([
        ReviewDimension.Performance,
        ReviewDimension.Maintainability,
      ]);
    });

    it('should not share reference with DEFAULT_SKIP_DIMENSIONS', () => {
      const resolved1 = resolveConfig();
      const resolved2 = resolveConfig();
      resolved1.skipDimensions.push(ReviewDimension.Logic);
      expect(resolved2.skipDimensions).toEqual([]);
      expect(DEFAULT_SKIP_DIMENSIONS).toEqual([]);
    });

    // 防 NaN / Infinity / 非法数字的回归测试
    // `??` 只对 null/undefined 短路，NaN 会穿透导致 ParallelScheduler 等逻辑异常。
    describe('numeric fields guard against NaN/Infinity/non-positive values', () => {
      it('should fall back to default when maxParallel is NaN', () => {
        const resolved = resolveConfig({ maxParallel: NaN });
        expect(resolved.maxParallel).toBe(DEFAULT_MAX_PARALLEL);
      });

      it('should fall back to default when maxParallel is Infinity', () => {
        const resolved = resolveConfig({ maxParallel: Infinity });
        expect(resolved.maxParallel).toBe(DEFAULT_MAX_PARALLEL);
      });

      it('should fall back to default when maxParallel is negative', () => {
        const resolved = resolveConfig({ maxParallel: -1 });
        expect(resolved.maxParallel).toBe(DEFAULT_MAX_PARALLEL);
      });

      it('should fall back to default when maxParallel is zero', () => {
        const resolved = resolveConfig({ maxParallel: 0 });
        expect(resolved.maxParallel).toBe(DEFAULT_MAX_PARALLEL);
      });

      it('should fall back to default when agentTimeout is NaN', () => {
        const resolved = resolveConfig({ agentTimeout: NaN });
        expect(resolved.agentTimeout).toBe(DEFAULT_AGENT_TIMEOUT);
      });

      it('should fall back to default when totalTimeout is NaN', () => {
        const resolved = resolveConfig({ totalTimeout: NaN });
        expect(resolved.totalTimeout).toBe(DEFAULT_TOTAL_TIMEOUT);
      });
    });
  });
});
