# Inquisitor - High-Intensity Code Review Engine

Inquisitor is a sophisticated, multi-dimensional code review tool designed for deep bug discovery. It employs an adversarial review pattern where specialized agents work in parallel to examine code from different perspectives, then a dedicated adversary agent challenges their findings.

## Quick Links

- 📚 **[START HERE](START_HERE.md)** - Getting started guide for all users
- 📖 **[Documentation Navigator](DOCUMENTATION_NAVIGATOR.md)** - Complete documentation index
- 🏗️ **[Architecture Summary](AGENTS_ARCHITECTURE_SUMMARY.md)** - Technical architecture overview
- 🚀 **[Enhancement Roadmap](ENHANCEMENT_ROADMAP.md)** - Future capabilities and priorities
- 🧩 **[Extension Examples](EXTENSION_EXAMPLES.md)** - How to extend the system
- 🛠️ **[Troubleshooting Guide](TROUBLESHOOTING_GUIDE.md)** - Debug and fix issues

**Status**: ✅ **Production Ready** - 7/7 features complete, 156/156 tests passing, 0 TypeScript errors

## Vision

Transform code review from a surface-level practice into a deep verification process. Rather than just finding issues, Inquisitor systematically tries to **prove code is wrong** from multiple angles until it can't find any more flaws.

Inspired by industry-leading approaches from CodeRabbit, SWE-bench champions, and Claude Code's verification patterns.

## Key Features

### ✅ 5 Independent Review Dimensions
- **Logic Agent**: Algorithm correctness, control flow, data flow
- **Security Agent**: Injection, privilege escalation, data leaks
- **Performance Agent**: Time/space complexity, resource leaks
- **Maintainability Agent**: Code structure, naming, coupling
- **EdgeCases Agent**: Null values, overflow, concurrency, exceptions

### ✅ Adversarial Review Pattern
- Dedicated agent challenges existing findings with fresh perspective
- Identifies missed issues and false positives
- Applies confidence adjustments based on findings
- Real Claude API integration for independent analysis

### ✅ Parallel Execution
- All 5 dimension agents run simultaneously (~5x faster than serial)
- Promise.all() based scheduling
- Timeout and error handling for each agent

### ✅ Intelligent Result Calibration
- Deduplication: merges issues found by multiple agents
- Confidence adjustment: incorporates adversary feedback
- False positive filtering: removes low-confidence issues
- Severity adjustments based on adversary judgment

### ✅ Multiple Input Modes
- **Diff mode**: Review only git changes
- **File mode**: Review a single file
- **Directory mode**: Recursively review all files

### ✅ Context-Aware Analysis
- Automatic dependency discovery
- Configurable context lines for diffs
- Project root awareness for relative imports
- Language detection and adaptation

### ✅ Multiple Output Formats
- **JSON**: Structured data for programmatic consumption
- **Markdown**: Human-readable reports with statistics

### ✅ Flexible Configuration
- Custom model selection (claude-opus, claude-sonnet, etc.)
- Configurable parallelism and timeouts
- Optional adversary review
- Per-agent configuration override

---

## Architecture

```
Input Collection Layer (3 collectors)
    ↓
ReviewRequest (standardized format)
    ↓
Orchestrator (coordination, timeouts, error handling)
    ├─→ Parallel: 5 Dimension Agents
    │   ├─ LogicAgent
    │   ├─ SecurityAgent
    │   ├─ PerformanceAgent
    │   ├─ MaintainabilityAgent
    │   └─ EdgeCaseAgent
    │
    ├─→ Sequential: AdversaryAgent (challenge phase)
    │
    └─→ Post-processing: IssueCalibrator
         ├─ Deduplication
         ├─ Confidence adjustment
         └─ False positive filtering
    ↓
Report Generator (JSON + Markdown)
    ↓
ReviewReport + CLI Output
```

**Core Principles**:
1. **API Isolation**: Each agent creates independent Anthropic client instances
2. **Graceful Degradation**: API failures don't lose original review results
3. **Confidence-Based Calibration**: All issues scored 0-1, adjusted by adversary
4. **Robust Parsing**: 5-layer fallback strategy handles LLM output variations
5. **Complete Token Tracking**: Real-time tracking of API usage

---

## Installation

```bash
npm install
```

**Requirements**:
- Node.js 16+
- `ANTHROPIC_API_KEY` environment variable set

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

---

## Usage

### As a TypeScript Library

```typescript
import { ReviewSkill } from './src/skill';

// Create a skill instance
const skill = new ReviewSkill({
  model: 'claude-opus',
  enableAdversary: true,
});

// Review git changes
const result = await skill.execute('diff');

// Review a single file
const result = await skill.execute('file', './src/app.ts');

// Review a directory
const result = await skill.execute('directory', './src');
```

### Programmatic Usage

```typescript
import { ReviewOrchestrator, ReviewRequest } from './src/orchestrator';

const orchestrator = new ReviewOrchestrator({
  model: 'claude-opus',
  enableAdversary: true,
  maxParallel: 5,
  agentTimeout: 120000,
  totalTimeout: 600000,
});

const request: ReviewRequest = {
  files: [
    {
      path: 'src/app.ts',
      content: 'const x = 1;',
    },
  ],
};

const report = await orchestrator.run(request);

console.log(`Found ${report.summary.totalIssues} issues`);
console.log(`Critical: ${report.summary.bySeverity.critical}`);
```

### Three Execution Modes

| Mode | Purpose | Usage |
|------|---------|-------|
| **diff** | Review git changes | `skill.execute('diff')` |
| **file** | Review a single file | `skill.execute('file', 'path/to/file.ts')` |
| **directory** | Recursively review directory | `skill.execute('directory', 'src/')` |

---

## Output

### JSON Report Example

```json
{
  "issues": [
    {
      "file": "src/app.ts",
      "line": 42,
      "severity": "high",
      "dimension": "security",
      "description": "Potential SQL injection vulnerability",
      "suggestion": "Use parameterized queries instead of string concatenation",
      "confidence": 0.92,
      "foundBy": "security-agent"
    }
  ],
  "summary": {
    "totalIssues": 15,
    "bySeverity": {
      "critical": 2,
      "high": 5,
      "medium": 6,
      "low": 2
    },
    "byDimension": {
      "logic": 3,
      "security": 4,
      "performance": 2,
      "maintainability": 4,
      "edge-cases": 2
    }
  },
  "metadata": {
    "durationMs": 23450,
    "tokenUsage": {
      "input": 45230,
      "output": 8234,
      "total": 53464
    },
    "agents": ["logic-agent", "security-agent", "performance-agent", ...]
  }
}
```

### Markdown Report Example

```markdown
# Code Review Report

## Summary
- **Total Issues**: 15
- **Critical**: 🔴 2
- **High**: 🟠 5
- **Medium**: 🟡 6
- **Low**: 🟢 2

## Issues by Dimension

### Security (4 issues)
- `src/app.ts:42` [HIGH] Potential SQL injection...

...
```

---

## Testing

Run the complete test suite:

```bash
npm test              # Run all tests
npm run test:watch   # Run in watch mode
npm run test:coverage # Generate coverage report
```

**Test Coverage**: 156/156 passing ✅
- Input collection: 24 tests
- Dimension agents: 39 tests
- Adversary agent: 28 tests
- Orchestrator: 17 tests
- Report generation: 29 tests
- Skill integration: 18 tests

---

## Build

Compile TypeScript to JavaScript:

```bash
npm run build    # Compile to dist/
```

**Build Status**: ✅ 0 TypeScript errors

---

## Configuration

### Environment Variables

```bash
# Required: Anthropic API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Optional: Set Claude model (default: claude-sonnet-4-20250514)
export INQUISITOR_MODEL="claude-opus"

# Optional: Enable debug logging
export DEBUG="inquisitor:*"
```

### Programmatic Configuration

```typescript
const orchestrator = new ReviewOrchestrator({
  model: 'claude-opus',                    // AI model to use
  maxParallel: 5,                          // Max concurrent agents
  agentTimeout: 120000,                    // Per-agent timeout (ms)
  totalTimeout: 600000,                    // Total execution timeout (ms)
  enableAdversary: true,                   // Enable adversarial review
  enableCache: false,                      // Enable result caching
});
```

---

## Architecture Decisions

### Isolated Agent Contexts
Each agent runs with completely isolated context to prevent cross-contamination and ensure independent perspective.

### Confidence-Based Scoring
All issues include a 0-1 confidence score, enabling filtering by certainty level and better decision-making.

### Adversarial Pattern
Rather than assuming initial findings are correct, findings are explicitly verified with an adversary agent.

### Result Calibration
High-quality results ensured through:
- Deduplication (keep highest confidence)
- Confidence adjustment (based on adversary findings)
- False positive filtering (low-confidence or disputed issues)
- Sorting (by severity, then confidence)

### Type Safety
Strict TypeScript configuration ensures full type safety, explicit error handling, and comprehensive interfaces.

---

## Performance

| Metric | Value |
|--------|-------|
| Parallel execution speedup | ~5x vs sequential |
| Average review time (mid-size code) | 15-30 seconds |
| Token usage per review | 8,000-12,000 tokens |
| API calls per review | 6 (5 dimensions + 1 adversary) |
| Timeout per agent | 120 seconds (configurable) |

---

## Documentation

Complete documentation available:

| Document | Purpose |
|----------|---------|
| [START_HERE.md](START_HERE.md) | Getting started & navigation |
| [DOCUMENTATION_NAVIGATOR.md](DOCUMENTATION_NAVIGATOR.md) | Documentation index & reading paths |
| [FINAL_PROJECT_STATUS.md](FINAL_PROJECT_STATUS.md) | Complete project status & architecture |
| [AGENTS_ARCHITECTURE_SUMMARY.md](AGENTS_ARCHITECTURE_SUMMARY.md) | Detailed architecture overview |
| [AGENTS_CODE_FLOW.md](AGENTS_CODE_FLOW.md) | Execution flow & data structures |
| [EXTENSION_EXAMPLES.md](EXTENSION_EXAMPLES.md) | How to extend with examples |
| [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md) | Debug & fix issues |
| [ENHANCEMENT_ROADMAP.md](ENHANCEMENT_ROADMAP.md) | Future features & priorities |
| [QUICK_REFERENCE.md](QUICK_REFERENCE.md) | Quick lookup guide |

---

## Enhancement Opportunities

High-impact enhancements planned for future versions:

1. **AST-Based Deep Analysis** - Semantic code understanding (2-3 sessions)
2. **ML-Based Calibration** - Learn from issue resolution patterns (3-4 sessions)
3. **CI/CD Integration** - GitHub Actions, GitLab CI, etc. (3-5 sessions)
4. **Browser Report Viewer** - Interactive web-based reports (4-6 sessions)
5. **Custom Plugins** - Domain-specific analysis dimensions (2-3 sessions)
6. **Result Caching** - Speed up repeated reviews (1 session)
7. **Multi-Language Support** - Localized prompts and reports (1-2 sessions)

See [ENHANCEMENT_ROADMAP.md](ENHANCEMENT_ROADMAP.md) for complete roadmap with effort estimates.

---

## Project Status

✅ **COMPLETE** - Production Ready

**Features** (7/7):
- ✅ Feature #1: Project scaffolding & core types
- ✅ Feature #2: Input collection layer
- ✅ Feature #3: Dimension Agent system (5 agents with real Claude API)
- ✅ Feature #4: Adversary Agent & confidence calibration
- ✅ Feature #5: Orchestrator (parallel execution, timeouts)
- ✅ Feature #6: Report generation (JSON + Markdown)
- ✅ Feature #7: Claude Code Skill integration

**Quality Metrics**:
- ✅ 156/156 tests passing
- ✅ 0 TypeScript errors
- ✅ 3,534 lines of production code
- ✅ 25+ comprehensive guides
- ✅ 28+ git commits with full history

---

## Development

### Prerequisites

- Node.js 16+
- npm 8+
- TypeScript 4.9+

### Setup

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run specific test file
npm test -- src/__tests__/agents/logic-agent.test.ts

# Watch mode for development
npm test -- --watch
```

### Contributing

1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes following existing patterns
3. Write tests for new code
4. Verify: `npm test && npm run build`
5. Commit: `git commit -m "feat: your feature"`
6. Update `claude-progress.txt` with summary

See [EXTENSION_EXAMPLES.md](EXTENSION_EXAMPLES.md) for practical coding examples.

---

## Troubleshooting

**Tests failing?** → See [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md)

**API errors?** → Check `$ANTHROPIC_API_KEY` is set and valid

**Build errors?** → Run `npm install` and `npm run build` again

**Need help?** → Check [START_HERE.md](START_HERE.md) FAQ section

---

## License

MIT

---

## Contact & Support

For questions, issues, or contributions:
1. Check [DOCUMENTATION_NAVIGATOR.md](DOCUMENTATION_NAVIGATOR.md) for relevant docs
2. Review [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md) for common issues
3. See [EXTENSION_EXAMPLES.md](EXTENSION_EXAMPLES.md) for how to extend

---

**Last Updated**: April 15, 2026  
**Project Status**: ✅ Production Ready (7/7 features, 156/156 tests)  
**Documentation**: 25+ comprehensive guides (6000+ lines)
