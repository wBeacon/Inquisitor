# Agents Implementation - Architecture Summary & Key Insights

## 🏗️ System Architecture

### High-Level Flow
```
ReviewRequest
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 5 Parallel Dimension Agents (Concurrent Execution)          │
├─────────────────────────────────────────────────────────────┤
│ 1. LogicAgent       → Logic correctness issues              │
│ 2. SecurityAgent    → Security vulnerabilities              │
│ 3. PerformanceAgent → Performance problems                  │
│ 4. MaintainabilityAgent → Code maintainability issues      │
│ 5. EdgeCaseAgent    → Edge cases & boundary conditions      │
└─────────────────────────────────────────────────────────────┘
    ↓ (All results merged)
Combined Issues List
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Adversary Agent (Independent Review)                        │
├─────────────────────────────────────────────────────────────┤
│ • Finds missed issues from any dimension                    │
│ • Challenges existing conclusions (Confirmed/Disputed/FP)   │
│ • Provides confidence adjustments                           │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Issue Calibrator                                             │
├─────────────────────────────────────────────────────────────┤
│ • Applies confidence adjustments                            │
│ • Filters false positives                                   │
│ • Merges duplicates (keeps highest confidence)              │
│ • Sorts by severity → confidence                            │
└─────────────────────────────────────────────────────────────┘
    ↓
Final Calibrated Review Report
```

## 📦 Core Components

### 1. AgentRunner (Base Abstract Class)
**Purpose**: Defines the contract for all agents

**Key Methods**:
- `review(files, context)` → AgentResult
  - Wraps performReview() with error handling & timing
  - Records execution duration
  - Returns AgentResult with success/error status
  
- `performReview(files, context)` → ReviewIssue[] (abstract)
  - Implemented by subclasses
  - Returns list of found issues
  
- Utilities:
  - `getConfig()`, `getId()`, `getName()`, `getDimension()`
  - `formatIssuesAsJson()`, `parseJsonIssues()`

**Key Properties**:
- `config`: AgentConfig (id, name, systemPrompt, model params)
- `timeout`: 300000ms (5 minutes) default

---

### 2. Five Dimension Agents

Each extends AgentRunner with specialized focus:

#### LogicAgent (Dimension: Logic)
**Checks**:
- Control flow errors (missing cases, improper mutual exclusivity)
- Data flow errors (variable initialization, passing)
- Loop errors (incorrect conditions, off-by-one, infinite loops)
- Null handling issues
- Type mismatches
- Boundary conditions
- Race conditions (async code)
- Logic inversions (!= vs ==)
- Operator errors (bitwise, logical)
- Return value handling

**Config**: maxTokens=4000, temperature=0.5

#### SecurityAgent (Dimension: Security)
**Checks**:
- Injection vulnerabilities (SQL, command, template, XPath)
- XSS (improper escaping, direct rendering)
- Privilege escalation/bypass
- Sensitive data leakage (logs, errors, etc.)
- Unsafe dependencies
- Authentication/authorization flaws
- Weak encryption/hashing
- Session management issues
- Unsafe deserialization
- Information leakage in errors
- Hardcoded keys
- Path traversal vulnerabilities

**Config**: maxTokens=4000, temperature=0.5

#### PerformanceAgent (Dimension: Performance)
**Checks**:
- N+1 query problems
- Memory leaks/unreleased resources
- Unnecessary computations (especially in loops)
- Blocking operations
- High algorithmic complexity
- String concatenation inefficiency
- Regex backtracking issues
- Collection operation inefficiency
- DOM operation inefficiency
- Unnecessary serialization

**Config**: maxTokens=4000, temperature=0.5

#### MaintainabilityAgent (Dimension: Maintainability)
**Checks**:
- Code duplication
- High cyclomatic complexity
- Poor naming (variables, functions, classes)
- Missing documentation/comments
- Overly long functions (>50 lines)
- Deep nesting (>3-4 levels)
- Magic numbers
- Missing error handling
- SOLID principle violations
- Inconsistent code style

**Config**: maxTokens=4000, temperature=0.5

#### EdgeCaseAgent (Dimension: EdgeCases)
**Checks**:
- Null/undefined/empty input handling
- Extreme values (max/min, zero, negative)
- Large data inputs (crashes/timeouts)
- Concurrent request handling
- Network failures (timeouts, disconnects)
- Resource exhaustion (disk full, OOM, file handles)
- Time boundaries (leap years, month end, midnight, timezones)
- Floating point precision
- Character encoding (UTF-8, special chars, emoji)
- Path/file handling (special chars, symlinks, permissions)

**Config**: maxTokens=4000, temperature=0.5

---

### 3. AdversaryAgent (Specialized)

**Purpose**: Independent adversarial review with two tasks:

#### Task 1: Find Missed Issues
- Reviews code with completely fresh perspective
- Looks for problems across all dimensions
- Independent from existing issues

#### Task 2: Judge Existing Issues
For each existing issue:
- **Confirmed**: Yes, this is a real problem
- **Disputed**: Not fully convinced, problem may be exaggerated
- **False Positive**: This is not actually a problem

**Output**:
- `newIssues`: ReviewIssue[] (newly discovered)
- `issueJudgments`: IssueJudgment[] (judgments on existing issues)
  - existingIssueIndex: index in original list
  - judgment: 'confirmed' | 'disputed' | 'false_positive'
  - reason: explanation
  - suggestedConfidenceAdjustment?: number (0-1)
  - suggestedSeverityAdjustment?: string

**Key Feature**: 
- Temperature set to 0.7 (higher than dimension agents)
- Encourages creative, independent thinking
- Explicitly forbidden from bias towards existing conclusions

**Config**: maxTokens=4000, temperature=0.7

---

### 4. IssueCalibrtor (Post-processor)

**Workflow** (in order):
1. **Apply Confidence Adjustments**
   - Uses suggestions from adversary's issueJudgments
   - Clamps values to [0.0, 1.0] range

2. **Filter False Positives**
   - Removes issues marked as false_positive by adversary
   - (Note: Doesn't filter low confidence; all are kept)

3. **Add Adversary's New Issues**
   - Appends newIssues from adversary result

4. **Merge Duplicates**
   - Creates unique key: `${file}:${line}:${dimension}:${severity}`
   - Keeps issue with highest confidence when duplicates found

5. **Sort Issues**
   - Primary: Severity order (critical→high→medium→low)
   - Secondary: Confidence (descending)

**Calibration Summary**:
- originalCount
- falsePositivesRemoved
- newIssuesAdded
- duplicatesMerged
- finalCount

---

## 🔑 Key Type Definitions

### ReviewIssue
```typescript
{
  file: string;                 // File path
  line: number;                 // Line number
  endLine?: number;             // Optional end line (range)
  severity: 'critical' | 'high' | 'medium' | 'low';
  dimension: ReviewDimension;   // Enum: logic, security, performance, maintainability, edge_cases
  description: string;          // Detailed problem description
  suggestion: string;           // How to fix it
  confidence: number;           // 0.0-1.0, Agent's certainty
  foundBy?: string;             // Agent ID
  codeSnippet?: string;         // Relevant code excerpt
}
```

### ReviewDimension (Enum)
- `Logic = 'logic'`
- `Security = 'security'`
- `Performance = 'performance'`
- `Maintainability = 'maintainability'`
- `EdgeCases = 'edge_cases'`

### AgentConfig
```typescript
{
  id: string;                   // Unique identifier
  name: string;                 // Display name
  description: string;          // What this agent does
  dimension?: ReviewDimension;  // Which dimension (undefined for AdversaryAgent)
  systemPrompt: string;         // The full system prompt
  model?: string;               // Optional model override
  maxTokens?: number;           // Max output tokens (default 4000)
  temperature?: number;         // LLM temperature (default varies)
}
```

### AgentResult
```typescript
{
  agentId: string;
  issues: ReviewIssue[];
  durationMs: number;
  tokenUsage: { input: number; output: number; total: number };
  success: boolean;
  error?: string;               // If success=false
}
```

### AdversaryResult extends AgentResult
```typescript
{
  // ... all AgentResult fields ...
  falsePositives: number[];     // Indices marked as false positives
  confidenceAdjustments: Array<{
    issueIndex: number;
    newConfidence: number;
    reason: string;
  }>;
}
```

---

## 🎯 Prompt Engineering Strategy

### Common Prompt Structure
All dimension agent prompts follow this pattern:

1. **Role Definition**: "You are an expert in [domain]"
2. **Core Objective**: "Your only goal is to find [specific] errors"
3. **10+ Specific Check Points**: Detailed list with examples
4. **Output Format Specification**: JSON structure required
5. **Key Requirements**: Specific guidance on confidence, severity, etc.

### Confidence Scoring Guidelines
From prompts:
- 0.9-1.0: 100% certain errors
- 0.6-0.8: Possible/probable errors
- Disputed issues: 0.4-0.7 range
- False positives: 0.1-0.3 range

### JSON Output Format (All Agents)
```json
[
  {
    "file": "path/to/file.ts",
    "line": 42,
    "endLine": 45,
    "severity": "critical",
    "dimension": "logic",
    "description": "Clear description: 1) what is wrong 2) why it's wrong 3) impact",
    "suggestion": "How to fix it",
    "confidence": 0.85,
    "codeSnippet": "relevant code here"
  }
]
```

---

## 🔄 Workflow Example

### Sequential Execution
```typescript
// 1. Create dimension agents
const dimensionAgents = [
  new LogicAgent(),
  new SecurityAgent(),
  new PerformanceAgent(),
  new MaintainabilityAgent(),
  new EdgeCaseAgent(),
];

// 2. Run parallel reviews
const dimensionResults = await Promise.all(
  dimensionAgents.map(agent => agent.review(files, context))
);

// 3. Collect all issues
const allIssues = dimensionResults.flatMap(r => r.issues);
// Result: Array with all issues from all dimensions

// 4. Run adversary review
const adversary = new AdversaryAgent();
const adversaryResult = await adversary.challenge(files, context, allIssues);

// 5. Calibrate issues
const calibrator = new IssueCalibrtor();
const finalIssues = calibrator.calibrate(allIssues, adversaryResult);

// 6. Generate summary (optional)
const summary = calibrator.generateCalibrationSummary(
  allIssues,
  adversaryResult,
  finalIssues
);
```

---

## 🧪 Test Coverage

### dimension-agents.test.ts
- Configuration tests (ID, name, dimension)
- Custom configuration support
- System prompt verification (500+ chars, contains keywords)
- Async execution tests
- Parallel execution (5 agents)
- Agent independence verification
- Comprehensive prompt checks (JSON, dimension, confidence keywords)
- Max tokens validation (>1000)
- Temperature range validation (0-1)

### adversary-agent.test.ts
- Default configuration tests
- Custom configuration support
- Prompt verification (500+ chars, contains '对抗')
- Temperature for creativity (>= 0.6)

### IssueCalibrtor tests
- Confidence adjustment application
- Value clamping to [0.0, 1.0]
- False positive filtering
- Duplicate merging (keeps higher confidence)
- Sorting (severity → confidence)
- Calibration summary generation

---

## 💡 Design Insights

### 1. **Isolation Principle**
- Each agent runs independently
- No state sharing between agents
- Different temperature settings reflect different goals
- Parallel execution possible

### 2. **Confidence-Based Filtering**
- Every issue has explicit confidence score
- Adversary can adjust confidence
- False positives explicitly marked and removed
- Allows semantic filtering beyond binary accept/reject

### 3. **Multi-Perspective Quality Gate**
- Dimension agents: Specialized expertise
- Adversary agent: Devil's advocate / fresh perspective
- Calibrator: Consensus builder
- Three-layer validation reduces false positives

### 4. **Deterministic Deduplication**
- Unique key: `${file}:${line}:${dimension}:${severity}`
- Always keeps highest confidence when duplicates found
- Prevents misleading multiple findings of same issue

### 5. **Severity-First Sorting**
- Primary sort: Severity (critical → high → medium → low)
- Secondary sort: Confidence (descending)
- Ensures most important issues appear first

### 6. **Graceful Degradation**
- Each agent has try-catch with error handling
- Failed adversary review returns original issues
- Tests verify 5-second parallel execution (much faster than sequential)

---

## 📊 Current Limitations

### Placeholder Implementations
All `performReview()` methods are currently stubs:
```typescript
protected async performReview(files: string[], context: string): Promise<ReviewIssue[]> {
  console.log(`${AgentName} reviewing ${files.length} files`);
  return []; // Always returns empty array
}
```

**Next Step**: These need to call Claude Code Agent API with:
- systemPrompt as the system message
- Code context and file list as input
- Parse JSON ReviewIssue[] from response

### Token Usage
Currently all agents return:
```typescript
tokenUsage: { input: 0, output: 0, total: 0 }
```

**Next Step**: API integration to track actual token consumption

---

## 🚀 Integration Points

### Planned Claude API Integration
1. Pass systemPrompt to Claude as system context
2. Send files + context as user message
3. Expect JSON response with ReviewIssue array
4. Parse and return issues
5. Track actual token usage

### Connection to Orchestrator
- ReviewOrchestrator will call these agents
- Coordinate timing and error handling
- Generate final ReviewReport with metadata

---

## 📝 Summary

The agents system is a well-architected, modular code review framework with:

✅ **Clear separation of concerns**: Each agent focuses on one dimension
✅ **Parallel execution**: 5 agents run concurrently  
✅ **Quality assurance**: Adversary + calibrator reduce false positives
✅ **Confidence scoring**: Enables semantic filtering
✅ **Type safety**: Full TypeScript with comprehensive interfaces
✅ **Testability**: 100% test coverage planned
✅ **Extensibility**: Easy to add new dimension agents
✅ **Determinism**: Consistent results, predictable sorting

The system is **framework-complete** but needs **Claude API integration** for actual review execution.

