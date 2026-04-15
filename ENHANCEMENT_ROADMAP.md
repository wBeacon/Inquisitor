# Inquisitor - Enhancement Roadmap

**Status**: All 7 core features complete and production-ready  
**Created**: April 15, 2026  
**Purpose**: Guide future enhancements and improvements

---

## Table of Contents

1. [Project Foundation](#project-foundation)
2. [Enhancement Opportunities](#enhancement-opportunities)
3. [Architecture Extension Points](#architecture-extension-points)
4. [Performance Optimizations](#performance-optimizations)
5. [Integration Opportunities](#integration-opportunities)
6. [Testing Expansions](#testing-expansions)
7. [Implementation Priority Matrix](#implementation-priority-matrix)

---

## Project Foundation

### Current Architecture

Inquisitor implements a **layered, agent-based architecture**:

```
Input Collection Layer
  ├─ Git Diff Collector (unified diff format)
  ├─ File Collector (directory traversal, content reading)
  └─ Context Enricher (language detection, snippet extraction)
         ↓
    ReviewRequest (standardized format)
         ↓
    Orchestrator (coordination, timeouts, error handling)
         ├─ Parallel Execution (Promise.all)
         ├─ Dimension Agents (5 parallel workers)
         │  ├─ Logic Agent
         │  ├─ Security Agent
         │  ├─ Performance Agent
         │  ├─ Maintainability Agent
         │  └─ EdgeCase Agent
         ├─ Adversary Agent (challenge phase)
         └─ Issue Calibrator (post-processing)
         ↓
    Report Generator (JSON + Markdown)
         ↓
    ReviewReport + CLI Skill Integration
```

### Core Principles

1. **API Isolation**: Each agent creates independent Anthropic client instances - no shared context
2. **Graceful Degradation**: API failures don't lose original review results
3. **Confidence-Based Calibration**: All issues scored 0-1, adjusted by adversary feedback
4. **Parallel Execution**: 5 dimension agents run simultaneously (~5x faster than serial)
5. **Robust JSON Parsing**: 5-layer fallback strategy handles LLM output variations

### Technology Stack

- **Language**: TypeScript (strict mode, ES2022)
- **Runtime**: Node.js
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514, claude-opus, configurable)
- **Testing**: Jest with comprehensive coverage
- **Build**: tsc with strict settings
- **VCS**: Git with 28 commits

---

## Enhancement Opportunities

### ⭐ High-Impact Enhancements

#### 1. AST-Based Deep Code Analysis
**Current State**: Text-based analysis only  
**Enhancement**: Add Abstract Syntax Tree parsing for deeper semantic understanding

**Benefits**:
- Understand code structure, not just text patterns
- Type-aware analysis for statically-typed languages
- Control flow analysis
- Dependency graph generation

**Implementation Path**:
```typescript
// New module: src/analysis/ast-analyzer.ts
interface ASTAnalysisResult {
  structure: CodeStructure;
  types: TypeInformation;
  controlFlow: FlowGraph;
  dependencies: DependencyGraph;
}

// Integration point: Pass to dimension agents for deeper analysis
```

**Effort**: Medium (2-3 sessions)  
**Dependencies**: TypeScript compiler API, Babel, or similar

---

#### 2. ML-Based Confidence Calibration
**Current State**: Rule-based adjustment by IssueCalibrator  
**Enhancement**: Train ML model on issue resolution patterns

**Benefits**:
- Better confidence scoring based on actual issue severity
- Learn what false positive patterns look like
- Predictive confidence adjustment

**Implementation Path**:
```typescript
// New module: src/calibration/ml-calibrator.ts
interface MLCalibratorConfig {
  modelPath: string;
  trainingData: { issues: ReviewIssue[], resolved: boolean }[];
}

// Replace/augment: IssueCalibrator.calibrate()
```

**Effort**: High (3-4 sessions)  
**Dependencies**: TensorFlow.js, scikit-learn, or similar

---

#### 3. CI/CD Pipeline Integration
**Current State**: Standalone CLI tool  
**Enhancement**: First-class integration with GitHub Actions, GitLab CI, etc.

**Benefits**:
- Automatic review on every PR/MR
- PR/MR commenting with findings
- Automatic blocking of low-quality merges
- Metrics dashboard integration

**Implementation Path**:
```typescript
// New module: src/integrations/ci-adapter.ts
interface CIAdapter {
  attachToEvent(event: CIEvent): Promise<void>;
  commentOnReview(comment: string, review: ReviewReport): Promise<void>;
  setStatus(state: 'success' | 'failure', report: ReviewReport): Promise<void>;
}

// Support for: GitHub, GitLab, BitBucket, Azure DevOps
```

**Effort**: High (3-5 sessions, 1 per platform)  
**Dependencies**: Platform-specific APIs, OAuth

---

#### 4. Browser-Based Report Viewer
**Current State**: JSON + Markdown export only  
**Enhancement**: Interactive web-based report viewer

**Benefits**:
- Visual exploration of code issues
- Filter/sort by dimension, severity, confidence
- Side-by-side code comparison
- Historical analysis
- Team collaboration features

**Implementation Path**:
```typescript
// New: src/ui/report-viewer.tsx (React)
// New: src/api/report-server.ts (Express)
// Serve: npm run serve-report

// Features:
// - Issue timeline
// - Severity distribution charts
// - Dimension breakdown
// - Code highlighting with issue annotations
```

**Effort**: High (4-6 sessions)  
**Tech Stack**: React, Express, D3.js, Monaco Editor

---

#### 5. Custom Dimension Plugins
**Current State**: 5 hardcoded dimensions  
**Enhancement**: Plugin system for custom analysis dimensions

**Benefits**:
- Domain-specific analysis (e.g., compliance, accessibility)
- Organization-specific policies
- Community-contributed dimensions
- Extensibility without core changes

**Implementation Path**:
```typescript
// New: src/agents/plugin-agent.ts
interface DimensionPlugin {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  validate(issue: ReviewIssue): boolean;
}

// Plugin registry
class PluginRegistry {
  register(plugin: DimensionPlugin): void;
  getPlugins(): DimensionPlugin[];
}
```

**Effort**: Medium (2-3 sessions)  
**Compatibility**: Requires orchestrator refactoring

---

### 💡 Medium-Impact Enhancements

#### 6. Result Caching Layer
**Current State**: No caching, every review is fresh  
**Enhancement**: Cache review results for identical code sections

**Benefits**:
- Faster re-reviews of unchanged code
- Reduced API costs
- Historical comparison capability

**Implementation Path**:
```typescript
// New: src/cache/review-cache.ts
interface CacheEntry {
  hash: string;
  timestamp: Date;
  result: ReviewReport;
}

// Integration: In Orchestrator, before calling agents
```

**Effort**: Low (1 session)  
**Considerations**: Cache invalidation, storage strategy

---

#### 7. Multiple Language Support
**Current State**: Language detection only, all analysis in English  
**Enhancement**: Multi-language prompt and report generation

**Benefits**:
- Global team support
- Localized findings
- Better accuracy for non-English code comments

**Implementation Path**:
```typescript
// Enhanced: src/agents/prompts
// New language-specific prompt files
// - adversary-prompt-zh.ts
// - adversary-prompt-es.ts
// etc.

// Config: OrchestratorConfig.language?: 'en' | 'zh' | 'es' | ...
```

**Effort**: Low-Medium (1-2 sessions)  
**Translation Work**: Requires review of prompts

---

#### 8. Advanced Diff Analysis
**Current State**: Basic unified diff parsing  
**Enhancement**: Semantic diff analysis

**Benefits**:
- Understand intent of changes better
- Detect breaking changes
- Track architectural decisions
- Compare against similar past changes

**Implementation Path**:
```typescript
// Enhanced: src/input/git-diff-collector.ts
interface SemanticDiff {
  addedFunctions: Function[];
  modifiedFunctions: Function[];
  removedFunctions: Function[];
  breakingChanges: BreakingChange[];
  architecturalImpact: string;
}
```

**Effort**: Medium (2-3 sessions)

---

### 🔧 Low-Impact / Quick Wins

#### 9. Metrics Dashboard Export
**Current State**: Review reports only  
**Enhancement**: Export metrics for dashboard integration

**Benefits**:
- Track code quality trends
- Team metrics visibility
- Burndown charts

**Implementation Path**:
```typescript
// New: src/output/metrics-exporter.ts
interface ProjectMetrics {
  totalReviews: number;
  averageIssuesPerReview: number;
  severityTrend: { date: Date, critical: number, high: number }[];
  agentAccuracy: { agent: string, accuracy: number }[];
}
```

**Effort**: Low (1 session)

---

#### 10. Configuration File Support
**Current State**: Programmatic configuration only  
**Enhancement**: Load config from `.inquisitorrc.json` or `inquisitor.config.ts`

**Benefits**:
- Repository-specific settings
- Team standards enforcement
- IDE integration easier

**Implementation Path**:
```typescript
// New: src/config/config-loader.ts
interface InquisitorConfig {
  model?: string;
  dimensions?: ReviewDimension[];
  enableAdversary?: boolean;
  customRules?: Rule[];
}

// Load: loadConfig(path: string): InquisitorConfig
```

**Effort**: Low (0.5 sessions)

---

#### 11. Performance Profiling
**Current State**: Basic timing only  
**Enhancement**: Detailed performance metrics

**Benefits**:
- Identify slow agents
- Optimize API usage
- Baseline performance for CI/CD

**Implementation Path**:
```typescript
// Enhanced: src/types/review.ts
interface AgentResult {
  // Existing fields...
  profiling?: {
    apiCallTime: number;
    parseTime: number;
    validationTime: number;
  };
}
```

**Effort**: Low (0.5 sessions)

---

#### 12. Webhook Integration
**Current State**: CLI only  
**Enhancement**: HTTP webhooks for review completion

**Benefits**:
- Event-driven architecture
- Trigger downstream workflows
- Real-time notifications

**Implementation Path**:
```typescript
// New: src/integrations/webhook-client.ts
interface WebhookConfig {
  url: string;
  events: ('review-complete' | 'issue-found')[];
}

// Trigger: webhookClient.notify(event: WebhookEvent)
```

**Effort**: Low (0.5-1 session)

---

## Architecture Extension Points

### 1. Adding a New Dimension Agent
**Effort**: Low (0.5-1 session)  
**Steps**:
1. Create `src/agents/your-agent.ts` extending `AgentRunner`
2. Implement `performReview()` method
3. Create `src/agents/prompts/your-prompt.ts`
4. Add tests in `__tests__/agents/your-agent.test.ts`
5. Register in `ReviewOrchestrator`

**Template**:
```typescript
export class YourAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>) {
    const defaultConfig: AgentConfig = {
      id: 'your-agent',
      name: 'Your Custom Agent',
      dimension: ReviewDimension.YourDimension,
      systemPrompt: YOUR_AGENT_PROMPT,
    };
    super(defaultConfig);
  }

  protected async performReview(
    files: string[],
    context: string
  ): Promise<ReviewIssue[]> {
    const userMessage = this.buildUserMessage(files, context);
    const rawResponse = await this.callClaudeAPI(userMessage);
    return this.parseJsonResponse(rawResponse);
  }

  private buildUserMessage(files: string[], context: string): string {
    // Build your custom message
  }
}
```

---

### 2. Custom Report Format
**Effort**: Low (0.5 session)  
**Steps**:
1. Create `src/output/your-format-generator.ts`
2. Implement `generate(report: ReviewReport): string`
3. Add tests
4. Register in `ReviewSkill`

**Template**:
```typescript
export class YourFormatGenerator {
  generate(report: ReviewReport): string {
    // Your formatting logic
  }
}
```

---

### 3. Custom Input Collector
**Effort**: Medium (1-2 sessions)  
**Steps**:
1. Create `src/input/your-collector.ts`
2. Implement collector interface
3. Integrate into `ReviewRequest` preparation
4. Add tests

**Examples**:
- Bitbucket Server diff parsing
- SVN diff parsing
- Gerrit change parsing
- Direct code submission (no VCS)

---

## Performance Optimizations

### Current Performance Characteristics

```
Configuration: 5 dimensions + adversary, mid-size code (~500 lines)
Average Review Time: ~15-30 seconds
Token Usage: ~8,000-12,000 tokens per review
API Calls: 6 (1 per dimension + 1 adversary)
```

### Optimization Opportunities

#### 1. Agent Parallelization (Already Done ✅)
- 5 dimension agents run in parallel: `Promise.all()`
- ~5x faster than sequential execution
- Further parallelization of adversary agent independent review

#### 2. Token Optimization
**Current**: Each agent provides full context  
**Improvement**: 
- Chunk large files into relevant sections
- Summarize unchanged sections
- Context window management

**Potential Savings**: 20-30% token reduction

#### 3. Intelligent Caching
**Current**: No caching  
**Improvement**:
- Cache unchanged code sections
- Hash-based detection
- LRU eviction policy

**Potential Savings**: 40-60% for iterative reviews

#### 4. Adaptive Agent Selection
**Current**: Always run all 5 dimensions  
**Improvement**:
- Language-specific agent filtering
- Adaptive dimension selection based on code complexity
- Early termination if no issues found

**Potential Savings**: 20-40% execution time

#### 5. Batch Review Processing
**Enhancement**: Support reviewing multiple files/PRs in single batch

**Benefits**:
- Amortize setup cost
- Better context for cross-file issues
- Improved batch API rates

---

## Integration Opportunities

### Version Control Platforms
- ✅ Git (GitHub, GitLab, Bitbucket) - Currently supported
- [ ] Gerrit
- [ ] Perforce
- [ ] Mercurial

### CI/CD Platforms
- [ ] GitHub Actions
- [ ] GitLab CI
- [ ] Jenkins
- [ ] CircleCI
- [ ] Azure DevOps
- [ ] Travis CI

### Communication Platforms
- [ ] Slack
- [ ] Microsoft Teams
- [ ] Discord

### Project Management
- [ ] Jira
- [ ] GitHub Issues
- [ ] Linear
- [ ] Asana

---

## Testing Expansions

### Current Test Coverage
- 156 tests across 9 suites
- Input layer: 24 tests
- Dimension agents: 39 tests
- Adversary agent: 28 tests
- Orchestrator: 17 tests
- Output layer: 29 tests
- Skill: 18 tests

### Expansion Opportunities

#### 1. End-to-End Integration Tests
- Real Claude API calls (with recording/replay)
- Multi-file reviews
- Large codebase testing

#### 2. Performance Benchmarks
- Timing benchmarks
- Token usage tracking
- Regression detection

#### 3. Property-Based Testing
- Generative input testing
- Invariant checking
- Fuzzing for robustness

#### 4. Coverage Gaps
- Edge case handlers
- Error recovery paths
- Timeout scenarios

---

## Implementation Priority Matrix

### Quick Wins (0.5-1 day each)
```
┌─────────────────────────────────────────┐
│ 1. Configuration File Support      [11] │ 0.5 days
│ 2. Performance Profiling           [12] │ 0.5 days
│ 3. Webhook Integration             [12] │ 0.5-1 day
│ 4. Metrics Dashboard Export        [ 9] │ 1 day
│ 5. Result Caching Layer            [ 6] │ 1 day
│ 6. Multiple Language Support       [ 7] │ 1-2 days
│ 7. Advanced Diff Analysis          [ 8] │ 2-3 days
└─────────────────────────────────────────┘
```

### Medium Complexity (1-3 days each)
```
┌──────────────────────────────────────────┐
│ 1. Custom Dimension Plugins        [ 5] │ 2-3 days
│ 2. AST-Based Analysis              [ 1] │ 2-3 days
│ 3. First CI/CD Integration         [ 3] │ 3-5 days
│ 4. Advanced Performance Optim.     [4] │ 2-3 days
└──────────────────────────────────────────┘
```

### High Complexity (3+ days each)
```
┌──────────────────────────────────────────┐
│ 1. Browser-Based Viewer            [ 4] │ 4-6 days
│ 2. ML-Based Calibration            [ 2] │ 3-4 days
│ 3. Full CI/CD Ecosystem            [ 3] │ 10+ days
└──────────────────────────────────────────┘
```

### Recommended Phase Plan

**Phase 1 (Week 1)**: Quick Wins
- Implement items 1, 2, 3, 4 from quick wins list
- Improves developer experience and observability
- Total: ~3-4 days

**Phase 2 (Week 2-3)**: Core Enhancements
- AST-Based Analysis + Custom Plugins
- First CI/CD Integration
- Improves core capabilities
- Total: ~5-7 days

**Phase 3 (Week 4+)**: Major Features
- Browser-Based Viewer
- ML Calibration
- Ecosystem expansion
- Total: 10+ days

---

## Next Steps for Implementation

### To Start an Enhancement:

1. **Choose Feature**: Pick from matrix above based on impact/effort
2. **Create Task**: Use TaskCreate to track progress
3. **Branch**: `git checkout -b feature/your-feature-name`
4. **Develop**: Follow existing patterns (AgentRunner, test structure, etc.)
5. **Test**: Add tests, ensure 156 tests still pass, 0 errors
6. **Document**: Update relevant .md files
7. **Commit**: Descriptive commit message
8. **Update Progress**: Append to `claude-progress.txt`

### Key Patterns to Follow

- **API Isolation**: Create new client instances, don't share state
- **Graceful Degradation**: Handle failures without losing data
- **Comprehensive Testing**: Test happy path, errors, edge cases
- **Type Safety**: Strict TypeScript, no `any` types
- **Documentation**: Code comments + markdown guides

---

## Maintenance Notes

### Known Limitations

1. **Single Language Analysis**: Prompts optimized for code review, not polyglot codebases
2. **No Historical Tracking**: Each review is independent, no trend analysis built-in
3. **Single Process**: No distributed/horizontal scaling
4. **Claude API Only**: Locked to Anthropic models
5. **No Real-Time**: Batch processing only, no streaming results

### Scalability Considerations

For production deployment at scale:

1. **API Rate Limiting**: Implement token bucket / request queue
2. **Caching Strategy**: Redis for result caching
3. **Message Queue**: Kafka/RabbitMQ for batch processing
4. **Distributed Tracing**: OpenTelemetry for observability
5. **Metrics Collection**: Prometheus metrics export

---

## Contributing Guidelines

When implementing enhancements:

- Keep modules focused and testable
- Maintain backward compatibility when possible
- Update type definitions in `src/types/`
- Add tests for all new code paths
- Update relevant documentation
- Follow existing code style (2-space indent, JSDoc comments)
- Ensure all tests pass: `npm test`
- Ensure clean build: `npm run build`

---

**Last Updated**: April 15, 2026  
**Maintained By**: Project Team  
**Questions?** See FINAL_PROJECT_STATUS.md or START_HERE.md
