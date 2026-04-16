# Inquisitor - High-Intensity Code Review Engine

Inquisitor is a sophisticated, multi-dimensional code review tool designed for deep bug discovery. It employs an adversarial review pattern where specialized agents work in parallel to examine code from different perspectives, then a dedicated adversary agent challenges their findings.

## Key Features

### 5 Independent Review Dimensions
- **Logic Agent**: Algorithm correctness, control flow, data flow
- **Security Agent**: Injection, privilege escalation, data leaks
- **Performance Agent**: Time/space complexity, resource leaks
- **Maintainability Agent**: Code structure, naming, coupling
- **EdgeCases Agent**: Null values, overflow, concurrency, exceptions

### Adversarial Review Pattern
- Dedicated agent challenges existing findings with fresh perspective
- Identifies missed issues and false positives
- Applies confidence adjustments based on findings

### Parallel Execution
- All 5 dimension agents run simultaneously (~5x faster than serial)
- Promise.all() based scheduling
- Timeout and error handling for each agent

### Intelligent Result Calibration
- Deduplication: merges issues found by multiple agents
- Confidence adjustment: incorporates adversary feedback
- False positive filtering: removes low-confidence issues

### Multiple Input Modes
- **Diff mode**: Review only git changes
- **File mode**: Review a single file
- **Directory mode**: Recursively review all files

### Multiple Output Formats
- **JSON**: Structured data for programmatic consumption
- **Markdown**: Human-readable reports with statistics

---

## Architecture

```
Input Collection Layer (3 collectors)
    |
ReviewRequest (standardized format)
    |
Orchestrator (coordination, timeouts, error handling)
    |-- Parallel: 5 Dimension Agents
    |   |-- LogicAgent
    |   |-- SecurityAgent
    |   |-- PerformanceAgent
    |   |-- MaintainabilityAgent
    |   +-- EdgeCaseAgent
    |
    |-- Sequential: AdversaryAgent (challenge phase)
    |
    +-- Post-processing: IssueCalibrator
         |-- Deduplication
         |-- Confidence adjustment
         +-- False positive filtering
    |
Report Generator (JSON + Markdown)
    |
ReviewReport + CLI Output
```

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

### Execution Modes

| Mode | Purpose | Usage |
|------|---------|-------|
| **diff** | Review git changes | `skill.execute('diff')` |
| **file** | Review a single file | `skill.execute('file', 'path/to/file.ts')` |
| **directory** | Recursively review directory | `skill.execute('directory', 'src/')` |

---

## Testing

```bash
npm test              # Run all tests
npm run test:watch   # Run in watch mode
npm run test:coverage # Generate coverage report
```

---

## Build

```bash
npm run build    # Compile to dist/
```

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
  model: 'claude-opus',
  maxParallel: 5,
  agentTimeout: 120000,
  totalTimeout: 600000,
  enableAdversary: true,
  enableCache: false,
});
```

---

## License

MIT
