# Agents Implementation - Detailed Code Flow & Patterns

## 📐 Class Hierarchy

```
┌─────────────────────────────────────┐
│       AgentRunner (abstract)         │
├─────────────────────────────────────┤
│ + review(files, context): Promise   │
│ + performReview(files, context)*    │
│ + getConfig()                       │
│ + getId()                           │
│ + getName()                         │
│ + getDimension()                    │
│ + formatIssuesAsJson()              │
│ + parseJsonIssues()                 │
└─────────────────────────────────────┘
           ▲
           │ extends
      ┌────┴────┬────────┬─────────────┬──────────────┐
      │          │        │             │              │
  ┌───┴──┐  ┌──┴──┐ ┌────┴────┐ ┌─────┴────┐ ┌───────┴──┐
  │Logic │  │Sec  │ │Perf     │ │Maint     │ │EdgeCase  │
  │Agent │  │Agent│ │Agent    │ │Agent     │ │Agent     │
  └──────┘  └─────┘ └────────┘ └──────────┘ └──────────┘

┌─────────────────────────────────────┐
│    AdversaryAgent (standalone)       │
├─────────────────────────────────────┤
│ + challenge(files, context, issues) │
│ - performAdversaryReview()          │
│ + getConfig()                       │
│ + getId()                           │
│ + getName()                         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│   IssueCalibrtor (utility)           │
├─────────────────────────────────────┤
│ + calibrate(issues, adversary)*     │
│ - applyConfidenceAdjustments()      │
│ - filterFalsePositives()            │
│ - mergeeDuplicates()                │
│ - getIssueKey()                     │
│ - sortIssues()                      │
│ + generateCalibrationSummary()      │
└─────────────────────────────────────┘

* = public/exported method
- = private method
```

---

## 🔄 Execution Flow - review() Method

### AgentRunner.review() Flow
```typescript
async review(files: string[], context: string): Promise<AgentResult>
  ↓
1. Capture startTime = Date.now()
  ↓
2. TRY block:
  ├─ Call performReview(files, context)  [ASYNC - subclass implementation]
  │  └─ Returns: ReviewIssue[]
  ├─ Calculate durationMs = Date.now() - startTime
  ├─ RETURN SUCCESS:
  │  {
  │    agentId: config.id,
  │    issues: ReviewIssue[],
  │    durationMs: number,
  │    tokenUsage: { input: 0, output: 0, total: 0 },
  │    success: true
  │  }
  └─ 
3. CATCH error:
  ├─ Calculate durationMs = Date.now() - startTime
  ├─ RETURN ERROR:
  │  {
  │    agentId: config.id,
  │    issues: [],
  │    durationMs: number,
  │    tokenUsage: { input: 0, output: 0, total: 0 },
  │    success: false,
  │    error: error.message || String(error)
  │  }
  └─
```

**Key Points**:
- Always returns AgentResult (never throws)
- Times execution
- Empty issues on error
- Delegates actual work to subclass

---

## 🧬 Subclass Implementation Pattern

All 5 dimension agents follow same pattern:

```typescript
export class LogicAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>) {
    // Build defaultConfig with:
    // - id: 'logic-agent'
    // - name: 'Logic Correctness Agent'
    // - dimension: ReviewDimension.Logic
    // - systemPrompt: LOGIC_AGENT_PROMPT
    // - maxTokens: 4000
    // - temperature: 0.5
    
    super(defaultConfig);  // Pass to AgentRunner
  }

  protected async performReview(files: string[], context: string): Promise<ReviewIssue[]> {
    // PLACEHOLDER: Currently just logs and returns []
    console.log(`LogicAgent reviewing ${files.length} files`);
    return [];
    
    // REAL IMPLEMENTATION WILL:
    // 1. Call Claude Code Agent API
    // 2. Pass systemPrompt as system context
    // 3. Send files + context as user input
    // 4. Parse JSON response → ReviewIssue[]
    // 5. Return issues
  }
}
```

**Template Method Pattern**: Base class defines algorithm (review), subclasses implement detail (performReview).

---

## 👹 AdversaryAgent Execution Flow

```typescript
async challenge(
  files: string[],
  context: string,
  existingIssues: ReviewIssue[]
): Promise<AdversaryResult>
  ↓
1. startTime = Date.now()
  ↓
2. TRY:
  ├─ result = await performAdversaryReview(files, context, existingIssues)
  │  Returns: {
  │    newIssues: ReviewIssue[],
  │    issueJudgments: IssueJudgment[]
  │  }
  ├─ durationMs = Date.now() - startTime
  ├─ RETURN AdversaryResult:
  │  {
  │    agentId: 'adversary-agent',
  │    issues: result.newIssues,
  │    durationMs,
  │    tokenUsage: { input: 0, output: 0, total: 0 },
  │    success: true,
  │    falsePositives: result.issueJudgments
  │      .filter(j => j.judgment === 'false_positive')
  │      .map(j => j.existingIssueIndex),
  │    confidenceAdjustments: result.issueJudgments
  │      .filter(j => j.suggestedConfidenceAdjustment !== undefined)
  │      .map(j => ({
  │        issueIndex: j.existingIssueIndex,
  │        newConfidence: j.suggestedConfidenceAdjustment,
  │        reason: j.reason
  │      }))
  │  }
  │
3. CATCH error:
  ├─ durationMs = Date.now() - startTime
  ├─ RETURN AdversaryResult (failure):
  │  {
  │    agentId: 'adversary-agent',
  │    issues: [],
  │    durationMs,
  │    tokenUsage: { input: 0, output: 0, total: 0 },
  │    success: false,
  │    error: error message,
  │    falsePositives: [],
  │    confidenceAdjustments: []
  │  }
```

**Key Insight**: Transforms IssueJudgment array into two output arrays:
- `falsePositives`: indices only
- `confidenceAdjustments`: index + adjustment + reason

---

## 🔧 IssueCalibrtor.calibrate() Pipeline

```typescript
calibrate(
  originalIssues: ReviewIssue[],
  adversaryResult: AdversaryResult
): ReviewIssue[]
  ↓
1. Check: if (!adversaryResult.success)
   ├─ RETURN originalIssues (unchanged)
   └─ Exit
  ↓
2. Apply Confidence Adjustments:
   ├─ Create Map: adjustmentIndex → newConfidence
   ├─ For each issue (by index):
   │  ├─ If has adjustment, update confidence
   │  ├─ Clamp to [0.0, 1.0]
   │  └─ Keep issue unchanged if no adjustment
   ├─ RESULT: adjustedIssues[] (slightly modified copy)
  ↓
3. Filter False Positives:
   ├─ Create Set of false positive indices
   ├─ Filter issues: EXCLUDE if index in Set
   ├─ RESULT: filteredIssues[]
  ↓
4. Add Adversary's New Issues:
   ├─ RESULT: [...filteredIssues, ...adversaryResult.issues]
  ↓
5. Merge Duplicates:
   ├─ For each issue:
   │  ├─ Create key: `${file}:${line}:${dimension}:${severity}`
   │  ├─ If key exists in map:
   │  │  └─ Keep the one with HIGHER confidence
   │  └─ Otherwise add to map
   ├─ RESULT: Array.from(issueMap.values())
  ↓
6. Sort Issues:
   ├─ Primary: Severity (critical=0, high=1, medium=2, low=3)
   ├─ Secondary: Confidence (descending, higher first)
   ├─ RESULT: sortedIssues[]
  ↓
RETURN sortedIssues[]
```

**Deterministic Sorting Example**:
```
Input issues (unsorted):
  [critical, conf=0.5]
  [low, conf=0.9]
  [high, conf=0.9]
  [high, conf=0.3]
  [critical, conf=0.9]

Output (after sorting):
  [critical, conf=0.9]    ← critical, higher conf
  [critical, conf=0.5]    ← critical, lower conf
  [high, conf=0.9]        ← high, higher conf
  [high, conf=0.3]        ← high, lower conf
  [low, conf=0.9]         ← low only
```

---

## 📊 Type Flow Diagrams

### ReviewIssue Creation Flow
```
Dimension Agent
  ↓
  performReview() [PLACEHOLDER: returns []]
  ↓ (REAL IMPL)
  Claude API (with systemPrompt)
  ↓
  JSON response
  ↓
  Parse JSON
  ↓
  ReviewIssue[]
  {
    file: string
    line: number
    severity: 'critical' | 'high' | 'medium' | 'low'
    dimension: 'logic' | 'security' | 'performance' | 'maintainability' | 'edge_cases'
    description: string
    suggestion: string
    confidence: 0.0-1.0
    foundBy?: agentId
    codeSnippet?: string
  }
  ↓
AgentResult
  {
    agentId: string
    issues: ReviewIssue[]
    durationMs: number
    tokenUsage: { input, output, total }
    success: boolean
    error?: string
  }
```

### Adversary Agent Response Flow
```
AdversaryAgent
  ↓
  Claude API (with existing issues context)
  ↓
  JSON response
  {
    newIssues: ReviewIssue[],
    issueJudgments: [{
      existingIssueIndex: number,
      judgment: 'confirmed' | 'disputed' | 'false_positive',
      reason: string,
      suggestedConfidenceAdjustment?: 0.0-1.0,
      suggestedSeverityAdjustment?: severity
    }]
  }
  ↓
  Transform to AdversaryResult
  {
    ... AgentResult fields ...
    falsePositives: number[]
    confidenceAdjustments: [{
      issueIndex: number
      newConfidence: 0.0-1.0
      reason: string
    }]
  }
```

---

## 🎯 Configuration Chain

### LogicAgent Configuration Example
```typescript
// User code:
const agent = new LogicAgent({ id: 'custom-logic' });

// In constructor:
const defaultConfig: AgentConfig = {
  id: 'custom-logic'              // ← from user input
  name: 'Logic Correctness Agent'  // ← default
  description: '...'               // ← default
  dimension: ReviewDimension.Logic // ← hardcoded for LogicAgent
  systemPrompt: LOGIC_AGENT_PROMPT // ← imported constant
  model: undefined                 // ← not specified
  maxTokens: 4000                  // ← default
  temperature: 0.5                 // ← default
};

super(defaultConfig);  // Pass to AgentRunner constructor

// In AgentRunner:
this.config = defaultConfig;
this.timeout = 300000;  // 5 minutes

// Access via:
agent.getConfig()    → AgentConfig
agent.getId()        → 'custom-logic'
agent.getName()      → 'Logic Correctness Agent'
agent.getDimension() → ReviewDimension.Logic
```

---

## 🔌 Integration Points (Placeholder)

### Current State (Placeholders)
```typescript
protected async performReview(files: string[], context: string): Promise<ReviewIssue[]> {
  console.log(`LogicAgent reviewing ${files.length} files`);
  return [];  // ← PLACEHOLDER
}
```

### Expected Real Implementation
```typescript
protected async performReview(files: string[], context: string): Promise<ReviewIssue[]> {
  try {
    // Build message to Claude
    const userMessage = `
      Please review these files for logic errors:
      
      Files: ${files.join(', ')}
      
      Code Context:
      ${context}
      
      Return findings as JSON array of ReviewIssue objects.
    `;
    
    // Call Claude Code Agent API
    const response = await claudeCodeAgent.run({
      system: this.config.systemPrompt,
      user: userMessage,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });
    
    // Parse JSON response
    const issues = this.parseJsonIssues(response);
    
    // Add metadata
    return issues.map(issue => ({
      ...issue,
      foundBy: this.config.id
    }));
    
  } catch (error) {
    // Error will be caught by review() wrapper
    throw error;
  }
}
```

---

## 🧪 Test Execution Flow

### dimension-agents.test.ts: Parallel Execution Test
```typescript
it('should support parallel review execution', async () => {
  const agents = [
    new LogicAgent(),
    new SecurityAgent(),
    new PerformanceAgent(),
    new MaintainabilityAgent(),
    new EdgeCaseAgent(),
  ];
  
  const startTime = Date.now();
  
  // Launch all 5 agents concurrently
  const results = await Promise.all(
    agents.map(agent => agent.review(['test.ts'], 'const x = 1;'))
  );
  
  const duration = Date.now() - startTime;
  
  // All complete successfully
  expect(results).toHaveLength(5);
  expect(results.every(r => r.success)).toBe(true);
  
  // Fast execution (parallel benefit)
  expect(duration).toBeLessThan(5000);
  // If sequential: would take 5+ seconds
  // If parallel: should be <1 second (placeholders are instant)
});
```

### adversary-agent.test.ts: False Positive Filtering Test
```typescript
it('should remove issues marked as false positives', () => {
  const calibrator = new IssueCalibrtor();
  
  const issues = [
    { ...issue1, confidence: 0.8 },  // Issue at index 0
    { ...issue2, confidence: 0.7 },  // Issue at index 1
  ];
  
  const adversaryResult = {
    agentId: 'adversary',
    issues: [],
    success: true,
    falsePositives: [0],  // ← Mark first issue as false positive
    confidenceAdjustments: [],
  };
  
  const result = calibrator.calibrate(issues, adversaryResult);
  
  // Issue at index 0 removed
  expect(result.length).toBe(1);
  expect(result[0].description).toBe('Issue 2');
});
```

---

## 🛡️ Error Handling Strategy

### AgentRunner: Graceful Degradation
```
review() called
  ↓
try {
  performReview()  ← Can throw
} catch (error) {
  ✓ Captured
  ✓ Duration recorded
  ✓ Return AgentResult with success=false
}
  ↓
ALWAYS returns AgentResult (never re-throws)
```

### AdversaryAgent: Similar Pattern
```
challenge() called
  ↓
try {
  performAdversaryReview()  ← Can throw
} catch (error) {
  ✓ Captured
  ✓ Return AdversaryResult with success=false
  ✓ falsePositives=[], confidenceAdjustments=[]
}
  ↓
ALWAYS returns AdversaryResult
```

### IssueCalibrtor: Fail-Safe
```
calibrate() called
  ↓
if (!adversaryResult.success) {
  ✓ Return originalIssues unchanged
  ✓ Skip all processing
}
  ↓
Process normally
```

---

## 💾 Data Structure Examples

### Simple ReviewIssue
```json
{
  "file": "src/utils/parser.ts",
  "line": 42,
  "severity": "high",
  "dimension": "logic",
  "description": "Variable 'x' may be undefined if condition is false",
  "suggestion": "Add null check before usage",
  "confidence": 0.85
}
```

### Complete ReviewIssue with Optional Fields
```json
{
  "file": "src/api/auth.ts",
  "line": 15,
  "endLine": 20,
  "severity": "critical",
  "dimension": "security",
  "description": "SQL injection vulnerability: user input concatenated directly into query",
  "suggestion": "Use parameterized queries with placeholders",
  "confidence": 0.95,
  "foundBy": "security-agent",
  "codeSnippet": "const query = 'SELECT * FROM users WHERE id = ' + userId;"
}
```

### IssueJudgment from Adversary
```json
{
  "existingIssueIndex": 0,
  "judgment": "disputed",
  "reason": "The variable is initialized on line 10, so it won't be undefined",
  "suggestedConfidenceAdjustment": 0.3,
  "suggestedSeverityAdjustment": "low"
}
```

---

## 📈 Performance Characteristics

### Complexity Analysis

| Operation | Time | Space | Notes |
|-----------|------|-------|-------|
| `review()` | O(1) | O(n) | Wraps performReview, n=issue count |
| `challenge()` | O(1) | O(m) | Wraps performAdversary, m=adversary results |
| `calibrate()` | O(n log n) | O(n) | Due to sorting, n=total issues |
| `applyAdjustments()` | O(n) | O(1) | Linear scan, in-place |
| `filterFalsePositives()` | O(n) | O(1) | Linear scan with Set lookup |
| `mergeeDuplicates()` | O(n) | O(n) | Map of unique keys |
| `sortIssues()` | O(n log n) | O(1) | JavaScript's sort |

### Parallel Execution Benefit
```
Sequential (5 agents):
T_total = T_logic + T_security + T_performance + T_maintainability + T_edge_cases
        = 5 × T_agent = ~5 seconds (with placeholder: instant)

Parallel (Promise.all):
T_total = max(T_logic, T_security, T_performance, T_maintainability, T_edge_cases)
        = T_agent = ~1 second (with placeholder: instant)

Speedup = 5x for equivalent real implementations
```

---

## 🎓 Design Patterns Used

### 1. **Template Method Pattern**
```typescript
// AgentRunner defines algorithm
abstract class AgentRunner {
  async review(files, context) {
    const issues = await this.performReview(files, context);
    // ... wrapping logic ...
    return result;
  }
  
  protected abstract performReview(files, context): Promise<ReviewIssue[]>;
}

// Subclasses provide specifics
class LogicAgent extends AgentRunner {
  protected async performReview(files, context) {
    // Logic-specific implementation
  }
}
```

### 2. **Strategy Pattern**
```typescript
// Different agents = different strategies
const agents: AgentRunner[] = [
  new LogicAgent(),
  new SecurityAgent(),
  // ... etc
];

// Same interface, different behaviors
for (const agent of agents) {
  const result = await agent.review(files, context);
}
```

### 3. **Factory Pattern (Implicit)**
```typescript
// Each agent creates its own config
constructor() {
  const defaultConfig = {
    id: 'logic-agent',
    systemPrompt: LOGIC_AGENT_PROMPT,
    // ...
  };
  super(defaultConfig);
}
```

### 4. **Chain of Responsibility**
```typescript
// Issues flow through pipeline
dimensionAgents.review()
  → combine issues
  → adversary.challenge()
  → calibrator.calibrate()
  → final report
```

### 5. **Pipeline/Fluent Pattern**
```typescript
// IssueCalibrtor orchestrates sequence
calibrate(issues, adversaryResult)
  .applyConfidenceAdjustments()
  .filterFalsePositives()
  .addAdversaryIssues()
  .mergeeDuplicates()
  .sortIssues()
  // Internal chaining, single public interface
```

