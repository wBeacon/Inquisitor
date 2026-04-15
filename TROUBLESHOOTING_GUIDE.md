# Inquisitor - Troubleshooting & Debugging Guide

**Purpose**: Help developers diagnose and resolve issues in development and deployment  
**Last Updated**: April 15, 2026  
**Difficulty Levels**: 🟢 Beginner | 🟡 Intermediate | 🔴 Advanced

---

## Table of Contents

1. [Common Issues & Solutions](#common-issues--solutions)
2. [Debug Mode Activation](#debug-mode-activation)
3. [Error Messages Reference](#error-messages-reference)
4. [Performance Diagnosis](#performance-diagnosis)
5. [API Integration Issues](#api-integration-issues)
6. [Testing Issues](#testing-issues)
7. [Build & Compilation Issues](#build--compilation-issues)
8. [Production Issues](#production-issues)

---

## Common Issues & Solutions

### 🟢 Tests Failing After Changes

**Problem**: Some tests pass locally but fail in CI/CD

**Diagnosis**:
```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test suite
npm test -- __tests__/agents/logic-agent.test.ts

# Run with coverage report
npm test -- --coverage

# Check which test failed
npm test -- --bail  # Stop on first failure
```

**Common Causes**:

1. **Import Path Issues**
   ```typescript
   // ❌ Wrong
   import { ReviewIssue } from '../types';
   
   // ✅ Correct
   import { ReviewIssue } from '../types/review';
   ```
   **Fix**: Use absolute imports from project root in tests

2. **Mock Data Inconsistency**
   ```typescript
   // Ensure all required fields present
   const mockIssue: ReviewIssue = {
     file: 'test.ts',
     line: 1,
     severity: 'high',
     dimension: ReviewDimension.Logic,
     description: 'Test issue',
     suggestion: 'Fix this',
     confidence: 0.8,
     // ✅ Include optional fields that tests expect
     codeSnippet: 'const x = 1;',
   };
   ```

3. **Async/Await Timing**
   ```typescript
   // ❌ Might timeout
   it('should process', () => {
     processor.process();
     expect(result).toBeDefined();
   });
   
   // ✅ Correct
   it('should process', async () => {
     await processor.process();
     expect(result).toBeDefined();
   });
   ```

4. **Token Tracking Not Initialized**
   ```typescript
   // If _lastTokenUsage is undefined in tests
   // Ensure callClaudeAPI is called before checking tokenUsage
   
   const result = await agent.review(files, context);
   expect(result.tokenUsage.input).toBeGreaterThan(0);
   ```

**Solution Checklist**:
- [ ] Run: `npm test -- --no-cache`
- [ ] Run: `npm run build` (check for compile errors)
- [ ] Run: `npm test -- --verbose` (identify exact failing test)
- [ ] Check git diff for unintended changes: `git diff src/`
- [ ] If jest cache issue: `npm test -- --clearCache`

---

### 🟢 Build Errors with TypeScript

**Problem**: `npm run build` fails with TypeScript errors

**Diagnosis**:
```bash
# See full error list
npm run build

# Run type checker only (faster iteration)
npx tsc --noEmit

# Check specific file
npx tsc --noEmit src/agents/logic-agent.ts
```

**Common Causes**:

1. **Missing Type Annotations**
   ```typescript
   // ❌ Error: parameter implicit any
   function review(files) {
     return files.map(f => f);
   }
   
   // ✅ Correct
   function review(files: string[]): string[] {
     return files.map(f => f);
   }
   ```

2. **Incorrect Type Imports**
   ```typescript
   // ❌ Error: ReviewIssue not exported
   import { ReviewIssue } from './agent-runner';
   
   // ✅ Correct
   import { ReviewIssue } from '../types';
   ```

3. **Strict Mode Violations**
   ```typescript
   // ❌ Error: not assignable to never
   const config: AgentConfig = { ...baseConfig };
   config.model = null; // null not in AgentConfig
   
   // ✅ Correct
   const config: AgentConfig = { ...baseConfig };
   if (someCondition) {
     config.model = 'claude-opus';
   }
   ```

4. **Async/Promise Issues**
   ```typescript
   // ❌ Missing await
   const result = callClaudeAPI(message);
   return result;
   
   // ✅ Correct
   const result = await callClaudeAPI(message);
   return result;
   ```

**Solution Checklist**:
- [ ] Read full error message (VS Code hover also helps)
- [ ] Check type definition in `src/types/`
- [ ] Verify imports use correct paths
- [ ] Use strict null checking: check for `| null`
- [ ] Add explicit type annotations instead of relying on inference

---

### 🟡 API Calls Not Working (401/403 Errors)

**Problem**: `Error: Invalid API key` or authentication fails

**Diagnosis**:
```bash
# Check environment setup
echo $ANTHROPIC_API_KEY | head -c 10

# Verify key format (should start with sk-)
# Valid key pattern: sk-ant-*

# Check if key is empty
test -z "$ANTHROPIC_API_KEY" && echo "KEY NOT SET" || echo "Key exists"
```

**Common Causes**:

1. **Missing Environment Variable**
   ```bash
   # ❌ Not set
   $ANTHROPIC_API_KEY
   
   # ✅ Set correctly
   export ANTHROPIC_API_KEY="sk-ant-..."
   npm test
   ```

2. **Wrong API Key Format**
   ```bash
   # ✅ Correct format (Anthropic)
   sk-ant-xxxxx
   
   # ❌ Wrong (OpenAI format)
   sk-proj-xxxxx
   ```

3. **API Key Expired**
   - Check Anthropic console for key rotation
   - Generate new key if needed
   - Update environment variable

4. **Network/Firewall Issues**
   ```bash
   # Test connectivity to Anthropic API
   curl -H "x-api-key: $ANTHROPIC_API_KEY" \
     https://api.anthropic.com/v1/messages \
     -d '{}' \
     --compressed
   ```

**Solution Checklist**:
- [ ] Verify key set: `echo $ANTHROPIC_API_KEY`
- [ ] Verify key format starts with `sk-ant-`
- [ ] Check key not revoked in Anthropic console
- [ ] Check network connectivity to api.anthropic.com
- [ ] Try with fresh key from console
- [ ] Check key has sufficient rate limit quota

---

### 🟡 Timeout Issues During Reviews

**Problem**: `Error: Agent logic-agent timeout after 120000ms`

**Diagnosis**:
```bash
# Check which agent is timing out
npm test 2>&1 | grep -i timeout

# Run with increased timeout for debugging
npm test -- --testTimeout=300000

# Check API response times
# Add console.log timestamps in callClaudeAPI
```

**Common Causes**:

1. **API Latency**
   - Anthropic API is slow (valid reason for timeout)
   - Check API status: https://status.anthropic.com
   - Network latency to API endpoint

2. **Agent Configuration**
   ```typescript
   // ❌ Too short timeout
   const agent = new LogicAgent({ maxTokens: 100 });
   // Implied timeout: 100 * 100 = 10 seconds
   
   // ✅ Reasonable timeout
   const agent = new LogicAgent({ maxTokens: 4000 });
   // Implied timeout: 4000 * 100 = 400 seconds
   ```

3. **Large Input Context**
   - Review request with very large files (>100MB)
   - Too many files in single request
   - Solution: Split into smaller batches

4. **Concurrent API Rate Limiting**
   - All 5 agents calling API simultaneously
   - Anthropic rate limiting kicks in
   - Solution: Implement backoff/retry with exponential backoff

**Solution Checklist**:
- [ ] Check Anthropic API status
- [ ] Check network connectivity: `ping api.anthropic.com`
- [ ] Increase timeout in OrchestratorConfig: `agentTimeout: 300000`
- [ ] Reduce context size: smaller files or fewer files
- [ ] Run agents serially instead of parallel (for debugging only)
- [ ] Add exponential backoff for API retries

---

### 🔴 JSON Parsing Failures in Agents

**Problem**: `Failed to parse adversary response: {invalid json...}`

**Diagnosis**:
```bash
# Enable debug logging
DEBUG=inquisitor:* npm test

# Check raw API response in tests
console.log('Raw response:', rawResponse);

# Try JSON parsing stages
node -e "
const text = 'your response text';
// Try each parsing stage
console.log(text.match(/\`\`\`/g));
"
```

**Common Causes**:

1. **Claude Output Format Changed**
   - Claude sometimes wraps JSON in markdown
   - Uses single quotes instead of double quotes
   - Includes explanatory text before/after JSON

2. **Implementation Issue**
   ```typescript
   // Check parseJsonResponse handles all cases:
   // 1. Markdown code fence wrapping
   const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
   
   // 2. Multiple objects/array wrapping
   const objectMatch = text.match(/\[[\s\S]*\]|{\s*[\s\S]*\}/);
   
   // 3. Trailing commas
   text = text.replace(/,\s*([\]}])/g, '$1');
   
   // 4. Single quote to double quote conversion
   text = text.replace(/'/g, '"');
   ```

3. **LLM Hallucination**
   - Claude generates invalid JSON structure
   - Missing required fields
   - Type mismatches

**Solution Checklist**:
- [ ] Check parseJsonResponse has all 5 parsing stages
- [ ] Add logging to see which stage succeeds/fails
- [ ] Verify JSON schema matches ReviewIssue type
- [ ] Test with `adversary-agent.test.ts` examples
- [ ] Add fallback default values for missing fields
- [ ] Increase strictness of JSON validation

---

### 🟡 Memory Leaks or Growing Memory Usage

**Problem**: Node process memory grows over time, doesn't garbage collect

**Diagnosis**:
```bash
# Run test with open handle detection
npm test -- --detectOpenHandles

# Check for unclosed promises/timers
npm test 2>&1 | grep -i "worker\|handle\|leak"

# Monitor memory during test
node --max-old-space-size=4096 node_modules/.bin/jest
```

**Common Causes**:

1. **Unclosed Timeouts**
   ```typescript
   // ❌ Timeout not cleared
   setTimeout(() => {
     // Some task
   }, 60000);
   
   // ✅ Use AbortController or clear
   const timeoutId = setTimeout(task, 60000);
   // Later...
   clearTimeout(timeoutId);
   ```

2. **Shared State in Agents**
   ```typescript
   // ❌ Class-level array accumulating
   class Agent {
     private results: ReviewIssue[] = [];
     async review() {
       this.results.push(...issues); // Growing!
     }
   }
   
   // ✅ Local scope
   async review() {
     const issues: ReviewIssue[] = [];
     return issues;
   }
   ```

3. **Event Listener Not Removed**
   ```typescript
   // ❌ Listeners accumulate
   client.on('message', handler);
   
   // ✅ Remove listeners
   client.off('message', handler);
   ```

4. **Circular References**
   - Ensure no agent holds reference to orchestrator
   - Ensure no issue references parent agent
   - Use WeakMap for caches

**Solution Checklist**:
- [ ] Run: `npm test -- --detectOpenHandles`
- [ ] Check for timeouts: search `setTimeout` in code
- [ ] Check for event listeners: search `.on(` in code
- [ ] Check Agent class fields don't accumulate
- [ ] Run: `node --max-old-space-size=8192 node_modules/.bin/jest`

---

## Debug Mode Activation

### Enable Detailed Logging

```typescript
// Add to src/agents/agent-runner.ts
const DEBUG = process.env.DEBUG === 'inquisitor:*' || process.env.DEBUG === 'inquisitor:agents';

protected async callClaudeAPI(userMessage: string): Promise<string> {
  if (DEBUG) {
    console.log(`[${this.config.id}] Request tokens: ${userMessage.length}`);
    console.log(`[${this.config.id}] API endpoint: ${this.config.model}`);
    console.time(`${this.config.id}-api-call`);
  }
  
  try {
    const response = await client.messages.create(...);
    
    if (DEBUG) {
      console.timeEnd(`${this.config.id}-api-call`);
      console.log(`[${this.config.id}] Response tokens: ${response.usage.output_tokens}`);
    }
    
    return textContent.text;
  } catch (error) {
    if (DEBUG) {
      console.error(`[${this.config.id}] API error:`, error);
    }
    throw error;
  }
}
```

### Run with Debug Output

```bash
# Enable all debugging
DEBUG=inquisitor:* npm test

# Enable only agents debugging
DEBUG=inquisitor:agents npm test

# Enable specific agent
DEBUG=inquisitor:agents:logic npm test

# Run specific test with debugging
DEBUG=inquisitor:* npm test -- logic-agent.test.ts --verbose
```

---

## Error Messages Reference

### API Errors

```
Error: "Unexpected token < in JSON at position 0"
→ API returned HTML error page (check API key, network)

Error: "Invalid API Key"
→ $ANTHROPIC_API_KEY not set or invalid format (sk-ant-*)

Error: "Rate limit exceeded"
→ Too many concurrent requests, implement backoff

Error: "Context length exceeded"
→ Input too large, reduce file size or count

Error: "Model not found: model-name"
→ Check model name in OrchestratorConfig, verify it exists
```

### Parsing Errors

```
Error: "Failed to parse adversary response: [object Object]"
→ JSON parsing failed in parseAdversaryResponse()
→ Check raw response format, add logging

Error: "Invalid issue format"
→ ReviewIssue missing required field (file, line, etc.)
→ Check validateAndFixIssues()

Error: "Cannot read property 'issues' of undefined"
→ Agent result is undefined
→ Check agent initialization, error handling
```

### File/Path Errors

```
Error: "ENOENT: no such file or directory"
→ File path doesn't exist
→ Check path is absolute, files exist

Error: "EACCES: permission denied"
→ Don't have read permissions for file
→ Check file permissions, run with sudo if needed

Error: "Not a git repository"
→ git-diff-collector.ts called outside git repo
→ Initialize git repo or provide file content directly
```

### Type Errors

```
Error: "Property 'x' does not exist on type 'ReviewIssue'"
→ Try to access non-existent property
→ Check ReviewIssue type definition, use optional chaining

Error: "Type 'string | null' is not assignable to type 'string'"
→ Null safety issue
→ Add null checks: if (value !== null) { ... }

Error: "Argument of type 'X' is not assignable to parameter of type 'Y'"
→ Type mismatch in function call
→ Check expected type, convert if needed
```

---

## Performance Diagnosis

### Profiling Agent Execution

```typescript
// Add to orchestrator
private async executeAgentWithProfiling(
  agent: AgentRunner,
  files: string[],
  context: string
): Promise<AgentResult> {
  const start = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  
  const result = await agent.review(files, context);
  
  const duration = Date.now() - start;
  const memoryDelta = process.memoryUsage().heapUsed - startMemory;
  
  console.log(`${agent.getId()}:`);
  console.log(`  Time: ${duration}ms`);
  console.log(`  Memory: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB`);
  console.log(`  Issues: ${result.issues.length}`);
  console.log(`  Tokens: ${result.tokenUsage.total}`);
  
  return result;
}
```

### Benchmarking Commands

```bash
# Basic timing
time npm test

# With memory profiling
node --expose-gc --trace-gc node_modules/.bin/jest 2>&1 | grep -i "gc\|heap"

# Generate flame graph (requires clinic.js)
npm install -g clinic
clinic doctor -- node_modules/.bin/jest

# CPU profiling
node --prof node_modules/.bin/jest
node --prof-process isolate-*.log > profile.txt
```

---

## API Integration Issues

### Token Usage Not Tracking

**Problem**: `tokenUsage.input` and `tokenUsage.output` are 0

```typescript
// Check callClaudeAPI sets _lastTokenUsage
private _lastTokenUsage = { input: 0, output: 0, total: 0 };

protected async callClaudeAPI(userMessage: string): Promise<string> {
  const response = await client.messages.create({ ... });
  
  // ✅ Must set this
  this._lastTokenUsage = {
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
    total: response.usage.input_tokens + response.usage.output_tokens,
  };
  
  return textContent.text;
}
```

### Model Parameter Not Working

**Problem**: Wrong model used, ignores OrchestratorConfig

```typescript
// In agent-runner.ts
const response = await client.messages.create({
  model: this.config.model || 'claude-sonnet-4-20250514', // ✅ Use config.model
  // ...
});

// Verify config passed correctly to agent
const agent = new LogicAgent({ 
  model: 'claude-opus' // Must pass here
});
```

---

## Testing Issues

### Test Timeout in CI/CD

**Problem**: Tests pass locally but timeout in CI

**Solutions**:
1. Increase Jest timeout: `npm test -- --testTimeout=600000`
2. Check CI resource constraints (CPU, memory, network)
3. Mock API calls: create `.json` fixtures instead of real calls
4. Run tests serially: `npm test -- --runInBand`

### Snapshot Tests Failing

**Problem**: Snapshots don't match between runs

```bash
# Update snapshots if intentional changes made
npm test -- --updateSnapshot

# Review snapshot changes carefully
git diff __snapshots__/
```

### Mock Not Working

**Problem**: Agent still calls real API in tests

```typescript
// ✅ Proper mocking
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        usage: { input_tokens: 100, output_tokens: 50 },
        content: [{ type: 'text', text: '[]' }],
      }),
    },
  })),
}));
```

---

## Build & Compilation Issues

### Cannot Find Module

**Problem**: `Cannot find module 'src/agents'`

```typescript
// ❌ Wrong
import { LogicAgent } from 'src/agents';

// ✅ Correct (relative from file)
import { LogicAgent } from '../agents';

// ✅ Correct (from types at root level)
import { ReviewIssue } from '@/types';
```

### Dist Folder Not Generated

**Problem**: `npm run build` succeeds but no dist/ folder

```bash
# Check build script in package.json
cat package.json | grep -A 2 '"build"'

# Should have: "build": "tsc"
# Which generates dist/ from tsconfig.json settings

# Verify tsconfig.json has:
# "outDir": "./dist"

# Force rebuild
rm -rf dist/ && npm run build
```

---

## Production Issues

### API Rate Limiting in Production

**Problem**: `Error: Rate limit exceeded` when handling multiple reviews

**Solution**:
```typescript
// Implement request queue with backoff
import pQueue from 'p-queue';

const queue = new pQueue({ 
  concurrency: 1, // Max concurrent API calls
  interval: 1000, // Per interval (ms)
  intervalCap: 10, // Max requests per interval
});

// Use queue for API calls
await queue.add(() => client.messages.create(...));
```

### Memory Exhaustion in Production

**Problem**: Node process crashes with OOM after many reviews

**Solution**:
```bash
# Increase heap size
node --max-old-space-size=4096 app.js

# Implement result streaming instead of accumulation
# Process and discard results instead of keeping in memory
# Implement periodic garbage collection
```

### Stale Cache Causing Incorrect Results

**Problem**: Review results are outdated/incorrect due to caching

**Solution**:
```typescript
// Add cache invalidation
cache.clear(fileHash); // Clear on file change
cache.setTTL(60000); // 60 second TTL
cache.validate(entry); // Check entry still valid
```

---

## Debugging Checklist

Use this when nothing else works:

- [ ] Restart: `npm test` after `npm install`
- [ ] Clean: `rm -rf node_modules dist coverage && npm install`
- [ ] Build: `npm run build` (check for errors)
- [ ] Test: `npm test -- --verbose` (single test first)
- [ ] Check logs: grep error logs for patterns
- [ ] Verify environment: check `env`, `npm -v`, `node -v`
- [ ] Git status: `git diff` (any unintended changes?)
- [ ] Dependencies: `npm audit` (any security issues?)
- [ ] API key: `echo $ANTHROPIC_API_KEY | head -c 10`

---

## Getting Help

When stuck:

1. **Check existing tests**: Find similar test case
2. **Check types**: Verify type definitions match usage
3. **Read error carefully**: Most errors are self-explanatory
4. **Enable debug logging**: See what's actually happening
5. **Minimal reproduction**: Isolate the issue
6. **Search git history**: `git log -p -S "error_phrase"`

---

**Need More Help?**
- See: `FINAL_PROJECT_STATUS.md` (Architecture)
- See: `AGENTS_CODE_FLOW.md` (Execution flow)
- See: `START_HERE.md` (Getting started)

**Report Issues:**
- Create detailed bug report with:
  - Exact error message
  - Steps to reproduce
  - Expected vs actual behavior
  - Environment (node version, OS, API key status)

---

*Last Updated: April 15, 2026*
