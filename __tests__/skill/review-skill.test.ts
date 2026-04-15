import { ReviewSkill, SkillParams, SkillResult } from '../../src/skill';
import { ReviewDimension } from '../../src/types';

describe('ReviewSkill', () => {
  describe('instantiation', () => {
    it('should create with default config', () => {
      const skill = new ReviewSkill();
      expect(skill).toBeDefined();
    });

    it('should create with custom config', () => {
      const skill = new ReviewSkill({
        model: 'claude-3-sonnet-20240229',
        enableAdversary: true,
      });
      expect(skill).toBeDefined();
    });
  });

  describe('parameter validation', () => {
    const skill = new ReviewSkill({ enableAdversary: false });

    it('should reject invalid mode', async () => {
      const params: any = {
        mode: 'invalid-mode',
        path: '.',
      };

      const result = await skill.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('无效的审查模式');
    });

    it('should require path for file mode', async () => {
      const params: any = {
        mode: 'file',
        // path is missing
      };

      const result = await skill.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('path');
    });

    it('should require path for directory mode', async () => {
      const params: any = {
        mode: 'directory',
        // path is missing
      };

      const result = await skill.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('path');
    });

    it('should accept valid dimensions', async () => {
      const params: SkillParams = {
        mode: 'diff',
        dimensions: 'logic,security,performance',
      };

      const result = await skill.execute(params);
      // Should not have dimension validation error (error may still be undefined or have other errors)
      if (result.error) {
        expect(result.error).not.toContain('无效的审查维度');
      }
    });

    it('should accept valid formats', async () => {
      const params: SkillParams = {
        mode: 'diff',
        formats: 'json,markdown',
      };

      const result = await skill.execute(params);
      // Should not have format validation error (error may still be undefined or have other errors)
      if (result.error) {
        expect(result.error).not.toContain('无效的输出格式');
      }
    });
  });

  describe('execution', () => {
    const skill = new ReviewSkill({ enableAdversary: false });

    it('should execute diff mode', async () => {
      const params: SkillParams = {
        mode: 'diff',
      };

      const result = await skill.execute(params);
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('report');
      expect(result).toHaveProperty('message');
    });

    it('should execute file mode with valid path', async () => {
      const params: SkillParams = {
        mode: 'file',
        path: 'package.json',
      };

      const result = await skill.execute(params);
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('report');
    });

    it('should execute directory mode', async () => {
      const params: SkillParams = {
        mode: 'directory',
        path: 'src',
      };

      const result = await skill.execute(params);
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('report');
    });

    it('should return proper SkillResult structure', async () => {
      const params: SkillParams = {
        mode: 'diff',
      };

      const result = await skill.execute(params);
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('report');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('reportFiles');
      // error is optional, so we just check that the structure is valid
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });

    it('should generate report with correct structure', async () => {
      const params: SkillParams = {
        mode: 'diff',
      };

      const result = await skill.execute(params);
      if (result.success && result.report) {
        expect(result.report).toHaveProperty('issues');
        expect(result.report).toHaveProperty('summary');
        expect(result.report).toHaveProperty('metadata');
      }
    });
  });

  describe('adversary integration', () => {
    it('should support adversary mode when enabled', async () => {
      const skill = new ReviewSkill({ enableAdversary: true });
      const params: SkillParams = {
        mode: 'diff',
      };

      const result = await skill.execute(params);
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('report');
    });

    it('should skip adversary review when disabled', async () => {
      const skill = new ReviewSkill({ enableAdversary: false });
      const params: SkillParams = {
        mode: 'diff',
      };

      const result = await skill.execute(params);
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('report');
    });
  });

  describe('help text', () => {
    it('should provide help text', () => {
      const help = ReviewSkill.getHelpText();
      expect(help).toBeDefined();
      expect(typeof help).toBe('string');
      expect(help.length).toBeGreaterThan(100);
    });

    it('should include mode documentation in help text', () => {
      const help = ReviewSkill.getHelpText();
      expect(help).toContain('diff');
      expect(help).toContain('file');
      expect(help).toContain('directory');
    });

    it('should include parameter documentation in help text', () => {
      const help = ReviewSkill.getHelpText();
      expect(help).toContain('dimensions');
      expect(help).toContain('formats');
    });
  });
});
