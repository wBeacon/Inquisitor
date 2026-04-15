# 🚀 Inquisitor 类型定义快速参考

## 📥 输入类型

### ReviewRequest (审查请求)
```typescript
interface ReviewRequest {
  files: FileToReview[]              // 待审查的文件
  diff?: string                      // 总体 diff
  context: ContextConfig             // 上下文配置
  dimensions?: ReviewDimension[]     // 指定维度（空=全部）
  mode: 'review' | 'review-fix'      // 模式
  maxIterations?: number             // review-fix 模式最大迭代数
}
```

### FileToReview (待审查文件)
```typescript
interface FileToReview {
  path: string          // 文件路径
  content?: string      // 完整内容（可选）
  diff?: string         // Diff 内容（可选）
  language?: string     // 语言标识
}
```

### ContextConfig (上下文配置)
```typescript
interface ContextConfig {
  contextLines: number           // 上下文行数（推荐 50）
  includeFullFile: boolean       // 包含完整文件？
  includeDependencies: boolean   // 包含依赖？
  projectRoot: string            // 项目根目录
}
```

---

## 🔍 问题类型

### ReviewDimension (审查维度)
```typescript
enum ReviewDimension {
  Logic = 'logic'                           // 逻辑正确性
  Security = 'security'                    // 安全性
  Performance = 'performance'               // 性能
  Maintainability = 'maintainability'      // 可维护性
  EdgeCases = 'edge_cases'                 // 边界情况
}
```

### Severity (严重等级)
```typescript
type Severity = 'critical' | 'high' | 'medium' | 'low'
```

### ReviewIssue (单个问题)
```typescript
interface ReviewIssue {
  // 必需
  file: string                    // 文件路径
  line: number                    // 行号
  severity: Severity              // 严重等级
  dimension: ReviewDimension      // 所属维度
  description: string             // 问题描述
  suggestion: string              // 修复建议
  confidence: number              // 置信度 0-1
  
  // 可选
  endLine?: number                // 结束行号
  foundBy?: string                // 发现该问题的 Agent
  codeSnippet?: string            // 代码片段
}
```

---

## 📊 输出类型

### ReviewReport (审查报告)
```typescript
interface ReviewReport {
  issues: ReviewIssue[]           // 发现的所有问题
  summary: ReviewSummary          // 统计摘要
  metadata: ReviewMetadata        // 运行信息
}
```

### ReviewSummary (统计摘要)
```typescript
interface ReviewSummary {
  bySeverity: SeverityCount                      // 按等级统计
  byDimension: Record<ReviewDimension, number>   // 按维度统计
  totalIssues: number                            // 问题总数
}
```

### SeverityCount (等级统计)
```typescript
interface SeverityCount {
  critical: number
  high: number
  medium: number
  low: number
}
```

### ReviewMetadata (元数据)
```typescript
interface ReviewMetadata {
  durationMs: number      // 总耗时
  tokenUsage: TokenUsage  // Token 统计
  startedAt: string       // 开始时间
  completedAt: string     // 结束时间
  agents: string[]        // 参与的 Agent 列表
}
```

### TokenUsage (Token 统计)
```typescript
interface TokenUsage {
  input: number    // 输入 token
  output: number   // 输出 token
  total: number    // 总计
}
```

---

## 🤖 Agent 类型

### AgentConfig (Agent 配置)
```typescript
interface AgentConfig {
  id: string                      // 唯一标识
  name: string                    // 名称
  description: string             // 描述
  dimension?: ReviewDimension     // 负责维度
  systemPrompt: string            // System Prompt
  model?: string                  // 模型（可选）
  maxTokens?: number              // 最大输出 token
  temperature?: number            // 温度参数
}
```

### AgentResult (Agent 执行结果)
```typescript
interface AgentResult {
  agentId: string                 // Agent 标识
  issues: ReviewIssue[]           // 发现的问题
  durationMs: number              // 执行耗时
  tokenUsage: TokenUsage          // Token 统计
  success: boolean                // 是否成功
  error?: string                  // 错误信息
}
```

### DimensionAgent (维度审查 Agent)
```typescript
interface DimensionAgent {
  config: AgentConfig
  review(files: string[], context: string): Promise<AgentResult>
}
```

### AdversaryAgent (对抗审查 Agent)
```typescript
interface AdversaryAgent {
  config: AgentConfig
  challenge(
    files: string[],
    context: string,
    existingIssues: ReviewIssue[]
  ): Promise<AdversaryResult>
}
```

### AdversaryResult (对抗审查结果)
```typescript
interface AdversaryResult extends AgentResult {
  falsePositives: number[]                    // 误报索引
  confidenceAdjustments: Array<{
    issueIndex: number                        // 问题索引
    newConfidence: number                     // 新置信度
    reason: string                            // 调整理由
  }>
}
```

### Orchestrator (编排器)
```typescript
interface Orchestrator {
  run(request: ReviewRequest): Promise<ReviewReport>
}
```

---

## 📐 类型依赖关系

```
ReviewRequest → ReviewDimension, FileToReview, ContextConfig
ReviewIssue → ReviewDimension, Severity
ReviewReport → ReviewIssue, ReviewSummary, ReviewMetadata
ReviewSummary → SeverityCount, ReviewDimension
ReviewMetadata → TokenUsage

AgentConfig → ReviewDimension
AgentResult → ReviewIssue, TokenUsage
DimensionAgent → AgentConfig, AgentResult
AdversaryAgent → AgentConfig, AdversaryResult, ReviewIssue
AdversaryResult → AgentResult
Orchestrator → ReviewRequest, ReviewReport
```

---

## 🎯 常见用法

### 创建审查请求
```typescript
const request: ReviewRequest = {
  files: [
    { path: 'src/app.ts', content: '...', language: 'typescript' }
  ],
  context: {
    contextLines: 50,
    includeFullFile: true,
    includeDependencies: true,
    projectRoot: '/project'
  },
  mode: 'review'
};
```

### 创建问题
```typescript
const issue: ReviewIssue = {
  file: 'src/app.ts',
  line: 42,
  severity: 'high',
  dimension: ReviewDimension.Logic,
  description: '可能的空指针异常',
  suggestion: '添加 null 检查',
  confidence: 0.85
};
```

### 处理审查报告
```typescript
const report: ReviewReport = {
  issues: [...],
  summary: {
    bySeverity: { critical: 2, high: 5, medium: 3, low: 1 },
    byDimension: { logic: 3, security: 2, ... },
    totalIssues: 11
  },
  metadata: {
    durationMs: 5230,
    tokenUsage: { input: 12450, output: 3280, total: 15730 },
    startedAt: '2026-04-15T10:00:00Z',
    completedAt: '2026-04-15T10:01:30Z',
    agents: ['logic-agent', 'security-agent', ...]
  }
};
```

---

## ✅ 验收标准一览

Feature #1 已完成 ✓ （11/11 验收标准通过）

1. ✅ tsc --noEmit 零错误、零警告
2. ✅ ReviewIssue 包含必要字段
3. ✅ ReviewReport 包含 issues、summary、metadata
4. ✅ 6 个模块目录存在
5. ✅ ReviewDimension 包含 5 个维度
6. ✅ ReviewRequest 已定义
7. ✅ AgentConfig 和 AgentResult 已定义
8. ✅ src/types/index.ts 重新导出所有类型
9. ✅ package.json 配置正确
10. ✅ tsconfig.json 启用 strict 模式
11. ✅ 所有模块目录包含占位文件

---

## 🔗 文件映射

| 类型 | 文件 | 行号范围 |
|------|------|---------|
| ReviewDimension | src/types/review.ts | 5-16 |
| Severity | src/types/review.ts | 18-21 |
| ReviewIssue | src/types/review.ts | 26-47 |
| SeverityCount | src/types/review.ts | 52-57 |
| ReviewSummary | src/types/review.ts | 62-69 |
| TokenUsage | src/types/review.ts | 90-97 |
| ReviewMetadata | src/types/review.ts | 74-85 |
| ReviewReport | src/types/review.ts | 102-109 |
| FileToReview | src/types/review.ts | 114-123 |
| ContextConfig | src/types/review.ts | 128-137 |
| ReviewRequest | src/types/review.ts | 142-155 |
| AgentConfig | src/types/agent.ts | 6-23 |
| AgentResult | src/types/agent.ts | 28-45 |
| DimensionAgent | src/types/agent.ts | 50-55 |
| AdversaryAgent | src/types/agent.ts | 61-70 |
| AdversaryResult | src/types/agent.ts | 75-84 |
| Orchestrator | src/types/agent.ts | 89-92 |

---

## 📝 编译产物

```
dist/types/
├── review.d.ts (编译后的类型声明)
├── review.js (空文件，占位)
├── review.d.ts.map (源映射)
├── agent.d.ts (编译后的类型声明)
├── agent.js (空文件，占位)
├── agent.d.ts.map (源映射)
├── index.d.ts (统一导出)
├── index.js (统一导出)
└── index.d.ts.map (源映射)
```

