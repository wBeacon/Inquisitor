import { InquisitorAgent, InquisitorInput } from '../../src/agent-adapter';
import { ReviewDimension } from '../../src/types';

describe('InquisitorAgent', () => {
  let agent: InquisitorAgent;

  beforeEach(() => {
    agent = new InquisitorAgent();
  });

  describe('invoke', () => {
    it('should execute review with minimal input', async () => {
      const input: InquisitorInput = {
        files: [
          {
            path: 'src/example.ts',
            content: 'const x = 1;',
          },
        ],
      };

      const output = await agent.invoke(input);

      expect(output).toHaveProperty('issues');
      expect(output).toHaveProperty('summary');
      expect(output).toHaveProperty('metadata');
      expect(Array.isArray(output.issues)).toBe(true);
    });

    it('should apply dimension filter when specified', async () => {
      const input: InquisitorInput = {
        files: [
          {
            path: 'src/example.ts',
            content: 'const x = 1;',
          },
        ],
        options: {
          dimensions: [ReviewDimension.Security],
        },
      };

      const output = await agent.invoke(input);

      expect(output.issues.every((i: any) => i.dimension === ReviewDimension.Security)).toBe(true);
    });

    it('should apply severity threshold filter when specified', async () => {
      const input: InquisitorInput = {
        files: [
          {
            path: 'src/example.ts',
            content: 'const x = 1;',
          },
        ],
        options: {
          severityThreshold: 'high',
        },
      };

      const output = await agent.invoke(input);

      expect(output.issues.every((i: any) => ['critical', 'high'].includes(i.severity))).toBe(true);
    });

    it('should throw error on empty files', async () => {
      const input: InquisitorInput = { files: [] };

      await expect(agent.invoke(input)).rejects.toThrow('at least one file');
    });

    it('should throw error on undefined files', async () => {
      const input = { files: undefined } as any;

      await expect(agent.invoke(input)).rejects.toThrow('at least one file');
    });

    it('should support multiple files', async () => {
      const input: InquisitorInput = {
        files: [
          { path: 'src/a.ts', content: 'const a = 1;' },
          { path: 'src/b.ts', content: 'const b = 2;' },
        ],
      };

      const output = await agent.invoke(input);

      expect(output.issues).toBeDefined();
      expect(Array.isArray(output.issues)).toBe(true);
    });

    it('should support file diff content', async () => {
      const input: InquisitorInput = {
        files: [
          {
            path: 'src/example.ts',
            diff: '+const x = 1;\n-const y = 2;',
          },
        ],
      };

      const output = await agent.invoke(input);

      expect(output).toBeDefined();
      expect(output.issues).toBeDefined();
    });
  });

  describe('getSchema', () => {
    it('should return agent schema with correct structure', () => {
      const schema = agent.getSchema();

      expect(schema).toHaveProperty('name');
      expect(schema).toHaveProperty('description');
      expect(schema).toHaveProperty('input');
    });

    it('should have correct agent name', () => {
      const schema = agent.getSchema();

      expect(schema.name).toBe('inquisitor');
    });

    it('should have input schema with files property', () => {
      const schema = agent.getSchema();

      expect(schema.input.properties.files).toBeDefined();
      expect(schema.input.properties.files.type).toBe('array');
    });

    it('should have required files in schema', () => {
      const schema = agent.getSchema();

      expect(schema.input.required).toContain('files');
    });

    it('should have files with path property required', () => {
      const schema = agent.getSchema();
      const fileItem = schema.input.properties.files.items;

      expect(fileItem.required).toContain('path');
    });
  });

  describe('configuration', () => {
    it('should accept custom config in constructor', async () => {
      const customAgent = new InquisitorAgent({
        enableAdversary: false,
        maxParallel: 3,
      });

      const input: InquisitorInput = {
        files: [{ path: 'src/test.ts', content: 'const x = 1;' }],
      };

      const output = await customAgent.invoke(input);

      expect(output).toBeDefined();
      expect(output.issues).toBeDefined();
    });

    it('should accept model config', async () => {
      const customAgent = new InquisitorAgent({
        model: 'claude-opus',
      });

      const input: InquisitorInput = {
        files: [{ path: 'src/test.ts', content: 'const x = 1;' }],
      };

      const output = await customAgent.invoke(input);

      expect(output).toBeDefined();
    });

    it('should accept timeout config', async () => {
      const customAgent = new InquisitorAgent({
        timeout: 30000,
        agentTimeout: 15000,
      });

      const input: InquisitorInput = {
        files: [{ path: 'src/test.ts', content: 'const x = 1;' }],
      };

      const output = await customAgent.invoke(input);

      expect(output).toBeDefined();
    });

    it('should accept provider config', async () => {
      const customAgent = new InquisitorAgent({
        provider: {
          type: 'anthropic',
        },
      });

      const input: InquisitorInput = {
        files: [{ path: 'src/test.ts', content: 'const x = 1;' }],
      };

      const output = await customAgent.invoke(input);

      expect(output).toBeDefined();
    });
  });

  describe('output structure', () => {
    it('should always return issues array', async () => {
      const input: InquisitorInput = {
        files: [{ path: 'src/test.ts', content: 'const x = 1;' }],
      };

      const output = await agent.invoke(input);

      expect(Array.isArray(output.issues)).toBe(true);
    });

    it('should always return summary', async () => {
      const input: InquisitorInput = {
        files: [{ path: 'src/test.ts', content: 'const x = 1;' }],
      };

      const output = await agent.invoke(input);

      expect(output.summary).toBeDefined();
      expect(output.summary).toHaveProperty('totalIssues');
      expect(output.summary).toHaveProperty('bySeverity');
      expect(output.summary).toHaveProperty('byDimension');
    });

    it('should always return metadata', async () => {
      const input: InquisitorInput = {
        files: [{ path: 'src/test.ts', content: 'const x = 1;' }],
      };

      const output = await agent.invoke(input);

      expect(output.metadata).toBeDefined();
      expect(output.metadata).toHaveProperty('durationMs');
      expect(output.metadata).toHaveProperty('startedAt');
      expect(output.metadata).toHaveProperty('completedAt');
    });
  });
});
