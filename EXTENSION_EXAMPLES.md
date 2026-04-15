# Inquisitor - Extension Examples

**Purpose**: Provide practical, copy-paste ready examples for extending Inquisitor  
**Last Updated**: April 15, 2026

---

## Table of Contents

1. [Adding a New Dimension Agent](#adding-a-new-dimension-agent)
2. [Creating a Custom Input Collector](#creating-a-custom-input-collector)
3. [Implementing a New Report Format](#implementing-a-new-report-format)
4. [Adding API Integration](#adding-api-integration)
5. [Building a Plugin System](#building-a-plugin-system)
6. [Custom Issue Filtering](#custom-issue-filtering)

---

## Adding a New Dimension Agent

### Scenario
You want to add an **Accessibility** dimension to check for accessibility issues in frontend code.

### Step 1: Create the Agent Class

File: `src/agents/accessibility-agent.ts`

```typescript
import { AgentRunner } from './agent-runner';
import { AgentConfig, ReviewIssue, ReviewDimension } from '../types';
import { ACCESSIBILITY_AGENT_PROMPT } from './prompts/accessibility-prompt';

export class AccessibilityAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>) {
    const defaultConfig: AgentConfig = {
      id: 'accessibility-agent',
      name: 'Accessibility Review Agent',
      description: 'Identifies accessibility issues in code (WCAG 2.1 compliance)',
      dimension: ReviewDimension.Accessibility,
      systemPrompt: ACCESSIBILITY_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.5,
    };

    super(defaultConfig);
  }

  /**
   * Perform accessibility review
   */
  protected async performReview(
    files: string[],
    context: string
  ): Promise<ReviewIssue[]> {
    const userMessage = this.buildUserMessage(files, context);
    const rawResponse = await this.callClaudeAPI(userMessage);
    return this.parseJsonResponse(rawResponse);
  }

  /**
   * Build the message for Claude
   */
  private buildUserMessage(files: string[], context: string): string {
    let message = '## Code for Accessibility Review\n\n';
    
    message += '### Files:\n';
    for (const file of files) {
      message += `- ${file}\n`;
    }
    
    message += '\n### Code:\n```\n';
    message += context;
    message += '\n```\n\n';
    
    message += 'Please analyze this code for accessibility issues following WCAG 2.1 standards. ';
    message += 'Focus on HTML/CSS/JavaScript accessibility, screen reader compatibility, ';
    message += 'keyboard navigation, color contrast, and semantic markup.\n\n';
    
    message += 'Output your findings as a JSON array of ReviewIssue objects.';
    
    return message;
  }

  /**
   * Get agent ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.config.name;
  }
}
```

### Step 2: Create the System Prompt

File: `src/agents/prompts/accessibility-prompt.ts`

```typescript
export const ACCESSIBILITY_AGENT_PROMPT = `You are an expert accessibility auditor specializing in WCAG 2.1 compliance.

Your task is to review code for accessibility issues including:
- Missing ARIA labels and roles
- Insufficient color contrast
- Keyboard navigation issues
- Missing alt text for images
- Poor semantic HTML structure
- Focus management problems
- Screen reader incompatibilities

For each issue found, provide:
1. Specific location (file, line)
2. Clear description of the accessibility problem
3. WCAG 2.1 level (A, AA, AAA) affected
4. Specific suggestion for remediation

Output MUST be a valid JSON array where each element has:
{
  "file": "path/to/file.tsx",
  "line": 42,
  "severity": "critical|high|medium|low",
  "description": "Issue description",
  "suggestion": "How to fix it",
  "confidence": 0.85,
  "codeSnippet": "relevant code"
}

Focus on actionable, specific issues. Be thorough but avoid false positives.`;
```

### Step 3: Add to Type Definitions

File: `src/types/review.ts` (add to `ReviewDimension` enum):

```typescript
export enum ReviewDimension {
  Logic = 'logic',
  Security = 'security',
  Performance = 'performance',
  Maintainability = 'maintainability',
  EdgeCases = 'edge-cases',
  Accessibility = 'accessibility', // ← Add this
}
```

### Step 4: Export from agents/index.ts

```typescript
export { AccessibilityAgent } from './accessibility-agent';
```

### Step 5: Register in Orchestrator

File: `src/orchestrator/review-orchestrator.ts`:

```typescript
// In constructor, add:
this.dimensionAgents = [
  { agent: new LogicAgent({ model: this.config.model }), dimension: ReviewDimension.Logic },
  { agent: new SecurityAgent({ model: this.config.model }), dimension: ReviewDimension.Security },
  { agent: new PerformanceAgent({ model: this.config.model }), dimension: ReviewDimension.Performance },
  { agent: new MaintainabilityAgent({ model: this.config.model }), dimension: ReviewDimension.Maintainability },
  { agent: new EdgeCaseAgent({ model: this.config.model }), dimension: ReviewDimension.EdgeCases },
  { agent: new AccessibilityAgent({ model: this.config.model }), dimension: ReviewDimension.Accessibility }, // ← Add this
];
```

### Step 6: Write Tests

File: `__tests__/agents/accessibility-agent.test.ts`:

```typescript
import { AccessibilityAgent } from '../../src/agents/accessibility-agent';
import { ReviewDimension } from '../../src/types';

describe('AccessibilityAgent', () => {
  let agent: AccessibilityAgent;

  beforeEach(() => {
    agent = new AccessibilityAgent();
  });

  it('should identify missing alt text', async () => {
    const files = ['index.html'];
    const context = `
      <img src="photo.jpg">
      <img src="logo.png" alt="Company Logo">
    `;

    const result = await agent.review(files, context);

    expect(result.success).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some(i => i.description.includes('alt'))).toBe(true);
  });

  it('should flag color contrast issues', async () => {
    const files = ['style.css'];
    const context = `
      .low-contrast { color: #fafafa; background: #f9f9f9; }
    `;

    const result = await agent.review(files, context);

    expect(result.issues.some(i => i.description.includes('contrast'))).toBe(true);
  });

  it('should dimension to accessibility', () => {
    const config = agent.getConfig();
    expect(config.dimension).toBe(ReviewDimension.Accessibility);
  });
});
```

### Step 7: Run and Verify

```bash
# Build
npm run build

# Test
npm test -- accessibility-agent.test.ts

# Full test suite
npm test
```

---

## Creating a Custom Input Collector

### Scenario
You want to add support for **Gerrit change** review (instead of just Git).

### Step 1: Create Collector Interface

File: `src/input/gerrit-collector.ts`:

```typescript
import { ReviewFile } from '../types';

export interface GerritChange {
  changeNumber: string;
  patchSetNumber: number;
  files: { [path: string]: FileChange };
}

interface FileChange {
  type: 'ADD' | 'MODIFY' | 'DELETE' | 'RENAME';
  oldName?: string;
  content?: string;
}

/**
 * Collect code from Gerrit changes
 */
export class GerritCollector {
  constructor(private gerritUrl: string) {}

  /**
   * Fetch change from Gerrit API
   */
  async fetchChange(changeNumber: string, patchSetNumber: number = 1): Promise<GerritChange> {
    const endpoint = `${this.gerritUrl}/changes/${changeNumber}/revisions/${patchSetNumber}/files`;
    
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${process.env.GERRIT_TOKEN}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Gerrit API error: ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseGerritResponse(changeNumber, patchSetNumber, data);
    } catch (error) {
      throw new Error(`Failed to fetch Gerrit change: ${error}`);
    }
  }

  /**
   * Convert Gerrit response to ReviewFile array
   */
  async toReviewFiles(change: GerritChange): Promise<ReviewFile[]> {
    const files: ReviewFile[] = [];

    for (const [path, fileChange] of Object.entries(change.files)) {
      if (fileChange.type === 'DELETE') {
        continue; // Skip deleted files
      }

      let content = '';
      if (fileChange.content) {
        content = fileChange.content;
      } else {
        // Fetch file content if not included
        content = await this.fetchFileContent(change.changeNumber, path);
      }

      files.push({
        path,
        content,
      });
    }

    return files;
  }

  /**
   * Generate diff from Gerrit change
   */
  async getDiff(change: GerritChange): Promise<string> {
    const endpoint = `${this.gerritUrl}/changes/${change.changeNumber}/revisions/${change.patchSetNumber}/files/`;
    
    try {
      const response = await fetch(`${endpoint}?format=TEXT`, {
        headers: {
          'Authorization': `Bearer ${process.env.GERRIT_TOKEN}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get diff: ${response.statusText}`);
      }

      // Response is base64-encoded text, decode it
      const encoded = await response.text();
      return Buffer.from(encoded, 'base64').toString('utf-8');
    } catch (error) {
      throw new Error(`Failed to fetch Gerrit diff: ${error}`);
    }
  }

  private async fetchFileContent(changeNumber: string, filePath: string): Promise<string> {
    const endpoint = `${this.gerritUrl}/changes/${changeNumber}/revisions/current/files/${encodeURIComponent(filePath)}/content`;
    
    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${process.env.GERRIT_TOKEN}`,
      },
    });

    if (!response.ok) {
      return '';
    }

    const encoded = await response.text();
    return Buffer.from(encoded, 'base64').toString('utf-8');
  }

  private parseGerritResponse(
    changeNumber: string,
    patchSetNumber: number,
    data: any
  ): GerritChange {
    return {
      changeNumber,
      patchSetNumber,
      files: data,
    };
  }
}
```

### Step 2: Create Review Request Builder

File: `src/input/gerrit-request-builder.ts`:

```typescript
import { ReviewRequest } from '../types';
import { GerritCollector } from './gerrit-collector';

export class GerritReviewRequestBuilder {
  private collector: GerritCollector;

  constructor(gerritUrl: string) {
    this.collector = new GerritCollector(gerritUrl);
  }

  /**
   * Build ReviewRequest from Gerrit change
   */
  async buildRequest(
    changeNumber: string,
    patchSetNumber?: number
  ): Promise<ReviewRequest> {
    const change = await this.collector.fetchChange(changeNumber, patchSetNumber);
    const files = await this.collector.toReviewFiles(change);
    const diff = await this.collector.getDiff(change);

    return {
      files,
      diff,
      context: `Gerrit Change: ${changeNumber}\nPatchSet: ${patchSetNumber || 1}`,
    };
  }
}
```

### Step 3: Write Tests

```typescript
import { GerritCollector } from '../../src/input/gerrit-collector';

describe('GerritCollector', () => {
  let collector: GerritCollector;

  beforeEach(() => {
    collector = new GerritCollector('https://gerrit.example.com/a');
  });

  it('should fetch Gerrit change', async () => {
    const change = await collector.fetchChange('12345');
    expect(change.changeNumber).toBe('12345');
    expect(change.files).toBeDefined();
  });

  it('should convert to ReviewFile array', async () => {
    const change = await collector.fetchChange('12345');
    const files = await collector.toReviewFiles(change);
    
    expect(files.length).toBeGreaterThan(0);
    expect(files[0].path).toBeDefined();
    expect(files[0].content).toBeDefined();
  });
});
```

---

## Implementing a New Report Format

### Scenario
You want to add **CSV export** format for spreadsheet analysis.

### Step 1: Create CSV Generator

File: `src/output/csv-generator.ts`:

```typescript
import { ReviewReport, ReviewIssue } from '../types';
import { stringify } from 'csv-stringify/sync';

export class CSVGenerator {
  /**
   * Generate CSV from review report
   */
  generate(report: ReviewReport): string {
    const rows = this.buildRows(report.issues);
    
    return stringify(rows, {
      header: true,
      columns: [
        'file',
        'line',
        'severity',
        'dimension',
        'description',
        'suggestion',
        'confidence',
        'foundBy',
      ],
    });
  }

  /**
   * Build CSV rows from issues
   */
  private buildRows(issues: ReviewIssue[]): any[] {
    return issues.map(issue => ({
      file: issue.file,
      line: issue.line,
      endLine: issue.endLine || '',
      severity: issue.severity,
      dimension: issue.dimension,
      description: issue.description,
      suggestion: issue.suggestion,
      confidence: (issue.confidence * 100).toFixed(1) + '%',
      foundBy: issue.foundBy || '',
      codeSnippet: issue.codeSnippet || '',
    }));
  }

  /**
   * Generate with summary sheet
   */
  generateWithSummary(report: ReviewReport): string {
    const issueCsv = this.generate(report);
    const summaryCsv = this.generateSummary(report);
    
    return '=== SUMMARY ===\n' + summaryCsv + '\n\n=== ISSUES ===\n' + issueCsv;
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(report: ReviewReport): string {
    const { summary } = report;
    
    const rows = [
      { metric: 'Total Issues', value: summary.totalIssues },
      { metric: 'Critical', value: summary.bySeverity.critical },
      { metric: 'High', value: summary.bySeverity.high },
      { metric: 'Medium', value: summary.bySeverity.medium },
      { metric: 'Low', value: summary.bySeverity.low },
      { metric: '', value: '' },
      { metric: 'By Dimension', value: '' },
      ...Object.entries(summary.byDimension).map(([dimension, count]) => ({
        metric: dimension,
        value: count,
      })),
    ];

    return stringify(rows, {
      header: true,
      columns: ['metric', 'value'],
    });
  }
}
```

### Step 2: Integrate into Skill

File: `src/skill/review-skill.ts`:

```typescript
import { CSVGenerator } from '../output/csv-generator';

export class ReviewSkill {
  private csvGenerator = new CSVGenerator();

  async execute(mode: 'diff' | 'file' | 'directory', path: string): Promise<ReviewReport> {
    // ... existing code ...

    if (format === 'csv') {
      const csv = this.csvGenerator.generateWithSummary(report);
      this.writeCsvOutput(csv, path);
    }

    return report;
  }

  private writeCsvOutput(csv: string, originalPath: string): void {
    const outputPath = `${originalPath}.issues.csv`;
    fs.writeFileSync(outputPath, csv);
    console.log(`CSV report: ${outputPath}`);
  }
}
```

### Step 3: Add CLI Option

```bash
# Usage
inquisitor review --file mycode.ts --format csv
```

---

## Adding API Integration

### Scenario
You want to **automatically comment on GitHub PRs** with findings.

### Step 1: Create GitHub Adapter

File: `src/integrations/github-adapter.ts`:

```typescript
import { Octokit } from '@octokit/rest';
import { ReviewReport, ReviewIssue } from '../types';

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  pullNumber: number;
}

export class GitHubAdapter {
  private octokit: Octokit;

  constructor(private config: GitHubConfig) {
    this.octokit = new Octokit({ auth: config.token });
  }

  /**
   * Post review findings as PR comment
   */
  async commentOnPR(report: ReviewReport): Promise<void> {
    const comment = this.buildComment(report);
    
    await this.octokit.issues.createComment({
      owner: this.config.owner,
      repo: this.config.repo,
      issue_number: this.config.pullNumber,
      body: comment,
    });
  }

  /**
   * Create review with individual comments on lines
   */
  async createReviewWithComments(report: ReviewReport): Promise<void> {
    const comments = this.buildLineComments(report.issues);
    
    if (comments.length === 0) {
      return; // No comments to add
    }

    // Get latest commit SHA
    const { data: pullRequest } = await this.octokit.pulls.get({
      owner: this.config.owner,
      repo: this.config.repo,
      pull_number: this.config.pullNumber,
    });

    await this.octokit.pulls.createReview({
      owner: this.config.owner,
      repo: this.config.repo,
      pull_number: this.config.pullNumber,
      commit_id: pullRequest.head.sha,
      body: 'Inquisitor code review findings',
      event: 'COMMENT',
      comments,
    });
  }

  /**
   * Set PR status check
   */
  async setStatus(
    report: ReviewReport,
    state: 'success' | 'failure' | 'pending'
  ): Promise<void> {
    const { data: pullRequest } = await this.octokit.pulls.get({
      owner: this.config.owner,
      repo: this.config.repo,
      pull_number: this.config.pullNumber,
    });

    const criticalIssues = report.issues.filter(i => i.severity === 'critical');
    const description = `${report.summary.totalIssues} issues found (${criticalIssues.length} critical)`;

    await this.octokit.repos.createCommitStatus({
      owner: this.config.owner,
      repo: this.config.repo,
      sha: pullRequest.head.sha,
      state: state,
      description: description,
      context: 'Inquisitor',
      target_url: 'https://github.com/your-org/inquisitor', // Link to your tool
    });
  }

  private buildComment(report: ReviewReport): string {
    const { summary, issues } = report;
    
    let comment = '## 🔍 Inquisitor Code Review\n\n';
    
    comment += `**Summary**: ${summary.totalIssues} issues found\n`;
    comment += `- 🔴 Critical: ${summary.bySeverity.critical}\n`;
    comment += `- 🟠 High: ${summary.bySeverity.high}\n`;
    comment += `- 🟡 Medium: ${summary.bySeverity.medium}\n`;
    comment += `- 🟢 Low: ${summary.bySeverity.low}\n\n`;

    if (issues.length > 0) {
      comment += '### Issues by Dimension:\n';
      
      // Group by dimension
      const byDimension: { [key: string]: ReviewIssue[] } = {};
      for (const issue of issues) {
        if (!byDimension[issue.dimension]) {
          byDimension[issue.dimension] = [];
        }
        byDimension[issue.dimension].push(issue);
      }

      for (const [dimension, dimIssues] of Object.entries(byDimension)) {
        comment += `\n**${dimension}** (${dimIssues.length}):\n`;
        
        for (const issue of dimIssues.slice(0, 5)) { // Limit to 5 per dimension
          comment += `- \`${issue.file}:${issue.line}\` [${issue.severity}] ${issue.description}\n`;
        }
        
        if (dimIssues.length > 5) {
          comment += `- ... and ${dimIssues.length - 5} more\n`;
        }
      }
    }

    comment += '\n*Powered by [Inquisitor](https://github.com/your-org/inquisitor)*';
    
    return comment;
  }

  private buildLineComments(issues: ReviewIssue[]): any[] {
    return issues.map(issue => ({
      path: issue.file,
      line: issue.line,
      body: `**[${issue.dimension}]** ${issue.description}\n\n💡 ${issue.suggestion}`,
    }));
  }
}
```

### Step 2: Integrate into Skill

```typescript
import { GitHubAdapter } from '../integrations/github-adapter';

export class ReviewSkill {
  async executeOnGitHub(pullNumber: number): Promise<ReviewReport> {
    const report = await orchestrator.run(request);
    
    const adapter = new GitHubAdapter({
      token: process.env.GITHUB_TOKEN!,
      owner: 'your-org',
      repo: 'your-repo',
      pullNumber,
    });

    // Post findings
    await adapter.createReviewWithComments(report);
    
    // Set status
    const hasIssues = report.summary.totalIssues > 0;
    await adapter.setStatus(report, hasIssues ? 'failure' : 'success');

    return report;
  }
}
```

---

## Building a Plugin System

### Scenario
Allow users to define custom analysis rules via plugins.

### Step 1: Define Plugin Interface

File: `src/plugins/plugin.ts`:

```typescript
import { ReviewIssue } from '../types';

export interface ReviewPlugin {
  id: string;
  name: string;
  version: string;
  
  /**
   * Called before review starts
   */
  beforeReview?(context: ReviewContext): Promise<void>;
  
  /**
   * Process findings from each agent
   */
  processIssues(issues: ReviewIssue[], context: ReviewContext): Promise<ReviewIssue[]>;
  
  /**
   * Called after review completes
   */
  afterReview?(report: ReviewReport): Promise<void>;
}

export interface ReviewContext {
  files: string[];
  context: string;
  timestamp: Date;
  model: string;
}
```

### Step 2: Create Plugin Registry

File: `src/plugins/plugin-registry.ts`:

```typescript
import { ReviewPlugin } from './plugin';

export class PluginRegistry {
  private plugins: Map<string, ReviewPlugin> = new Map();

  register(plugin: ReviewPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin ${plugin.id} already registered`);
    }
    this.plugins.set(plugin.id, plugin);
  }

  unregister(pluginId: string): void {
    this.plugins.delete(pluginId);
  }

  getPlugin(pluginId: string): ReviewPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getAllPlugins(): ReviewPlugin[] {
    return Array.from(this.plugins.values());
  }

  async processIssues(
    issues: ReviewIssue[],
    context: ReviewContext
  ): Promise<ReviewIssue[]> {
    let processed = issues;

    for (const plugin of this.getAllPlugins()) {
      processed = await plugin.processIssues(processed, context);
    }

    return processed;
  }
}
```

### Step 3: Example Plugin

File: `plugins/my-plugin.ts`:

```typescript
import { ReviewPlugin, ReviewContext } from '../src/plugins/plugin';
import { ReviewIssue } from '../src/types';

export const myPlugin: ReviewPlugin = {
  id: 'my-custom-plugin',
  name: 'My Custom Analysis Plugin',
  version: '1.0.0',

  async processIssues(
    issues: ReviewIssue[],
    context: ReviewContext
  ): Promise<ReviewIssue[]> {
    // Filter out low-severity issues in test files
    return issues.filter(issue => {
      if (issue.file.includes('.test.ts') && issue.severity === 'low') {
        return false; // Remove low severity from tests
      }
      return true;
    });
  },

  async afterReview(report) {
    // Send metrics to external system
    console.log(`Review completed: ${report.summary.totalIssues} issues`);
  },
};
```

### Step 4: Use in Orchestrator

```typescript
// In review-orchestrator.ts
private pluginRegistry: PluginRegistry;

constructor(config?: OrchestratorConfig) {
  this.pluginRegistry = new PluginRegistry();
  
  // Load plugins
  if (process.env.INQUISITOR_PLUGINS) {
    const pluginPaths = process.env.INQUISITOR_PLUGINS.split(',');
    for (const path of pluginPaths) {
      const plugin = require(path).default;
      this.pluginRegistry.register(plugin);
    }
  }
}

private async calibrateResults(context: OrchestrationContext): Promise<ReviewIssue[]> {
  let allIssues: ReviewIssue[] = [];
  for (const result of context.dimensionAgentResults) {
    allIssues.push(...result.issues);
  }

  // Apply plugins
  allIssues = await this.pluginRegistry.processIssues(allIssues, {
    files: context.files,
    context: context.contextString,
    timestamp: new Date(),
    model: this.config.model,
  });

  // ... rest of calibration
  return allIssues;
}
```

---

## Custom Issue Filtering

### Scenario
Filter out issues based on custom rules (e.g., ignore issues in generated files).

### Step 1: Create Filter System

File: `src/filtering/issue-filter.ts`:

```typescript
import { ReviewIssue } from '../types';

export interface IssueFilter {
  matches(issue: ReviewIssue): boolean;
}

export class RegexFilter implements IssueFilter {
  constructor(private pattern: RegExp) {}

  matches(issue: ReviewIssue): boolean {
    return this.pattern.test(issue.file);
  }
}

export class SeverityFilter implements IssueFilter {
  constructor(private minSeverity: string) {}

  matches(issue: ReviewIssue): boolean {
    const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
    return severityOrder[issue.severity] >= severityOrder[this.minSeverity];
  }
}

export class CompositeFilter implements IssueFilter {
  constructor(private filters: IssueFilter[]) {}

  matches(issue: ReviewIssue): boolean {
    return this.filters.every(f => f.matches(issue));
  }
}

export class IssueFilterChain {
  private filters: IssueFilter[] = [];

  addFilter(filter: IssueFilter): this {
    this.filters.push(filter);
    return this; // Chain support
  }

  apply(issues: ReviewIssue[]): ReviewIssue[] {
    return issues.filter(issue =>
      this.filters.every(filter => filter.matches(issue))
    );
  }
}
```

### Step 2: Create Configuration

File: `inquisitor-config.json`:

```json
{
  "filters": [
    {
      "type": "exclude-pattern",
      "pattern": ".*(generated|dist|build).*"
    },
    {
      "type": "exclude-pattern",
      "pattern": ".*\\.test\\.ts$"
    },
    {
      "type": "min-severity",
      "severity": "medium"
    }
  ]
}
```

### Step 3: Use in Skill

```typescript
import { IssueFilterChain, RegexFilter } from '../filtering/issue-filter';

export class ReviewSkill {
  private filterChain: IssueFilterChain;

  constructor() {
    this.filterChain = new IssueFilterChain();
    
    // Load from config
    const config = JSON.parse(fs.readFileSync('inquisitor-config.json', 'utf-8'));
    
    for (const filter of config.filters) {
      if (filter.type === 'exclude-pattern') {
        this.filterChain.addFilter(
          new RegexFilter(new RegExp(filter.pattern))
        );
      }
    }
  }

  async execute(mode: string, path: string): Promise<ReviewReport> {
    let report = await orchestrator.run(request);
    
    // Apply filters
    report.issues = this.filterChain.apply(report.issues);
    
    return report;
  }
}
```

---

## Testing Your Extensions

### Unit Test Template

```typescript
import { MyNewFeature } from '../../src/path/my-new-feature';

describe('MyNewFeature', () => {
  let feature: MyNewFeature;

  beforeEach(() => {
    feature = new MyNewFeature();
  });

  it('should do something', async () => {
    const input = { /* test data */ };
    const result = await feature.process(input);
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('should handle errors', async () => {
    expect(async () => {
      await feature.process(null);
    }).rejects.toThrow();
  });
});
```

### Integration Test

```typescript
import { ReviewOrchestrator } from '../../src/orchestrator/review-orchestrator';

describe('Extension Integration', () => {
  it('should work end-to-end', async () => {
    const orchestrator = new ReviewOrchestrator();
    
    const report = await orchestrator.run({
      files: [{ path: 'test.ts', content: 'const x = 1;' }],
    });

    expect(report.issues).toBeDefined();
    expect(report.summary.totalIssues).toBeGreaterThanOrEqual(0);
  });
});
```

---

## Publishing Your Extension

### Package as NPM Module

1. Create `package.json`:
```json
{
  "name": "@inquisitor/plugin-my-feature",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts"
}
```

2. Publish: `npm publish`

3. Use in Inquisitor:
```bash
npm install @inquisitor/plugin-my-feature
```

---

**Need More Help?**
- See FINAL_PROJECT_STATUS.md for architecture overview
- See ENHANCEMENT_ROADMAP.md for planned extensions
- See TROUBLESHOOTING_GUIDE.md for debugging issues

