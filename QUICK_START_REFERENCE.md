# Inquisitor 快速参考指南

## 1. 核心 API 速查表

### ReviewRequest - 发起审查

```typescript
const request: ReviewRequest = {
  files: [
    {
      path: 'src/app.ts',
      content: '...',  // 可选
      diff: '...',     // 可选
      language: 'typescript'  // 可选
    }
  ],
  diff: '...',  // 全局 diff (可选)
  context: {
    contextLines: 5,
    includeFullFile: true,
    includeDependencies: false,
    projectRoot: '/path/to/project'
  },
  dimensions: [ReviewDimension.Logic, ReviewDimension.Security],  // 空则审查全部
  mode: 'review',
  maxIterations: 1
};
```

### ReviewOrchestrator - 执行审查

```typescript
const orchestrator = new ReviewOrchestrator({
  model: 'claude-opus',
  maxParallel: 5,
  agentTimeout: 120000,      // 2 minutes per agent
  totalTimeout: 600000,      // 10 minutes total
  enableAdversary: true,     // 启用对抗审查
  enableCache: false
});

const report = await orchestrator.run(request);
```

### ReviewReport - 审查结果

```typescript
interface ReviewReport {
  issues: ReviewIssue[];      // 所有发现的问题
  summary: ReviewSummary;     // 统计信息
  metadata: ReviewMetadata;   // 执行元数据
}

// 访问结果
report.issues.forEach(issue => {
  console.log(`${issue.file}:${issue.line} - ${issue.description}`);
});

console.log(`Total issues: ${report.summary.totalIssues}`);
console.log(`Critical: ${report.summary.bySeverity.critical}`);
console.log(`Duration: ${report.metadata.durationMs}ms`);
console.log(`Tokens used: ${report.metadata.tokenUsage.total}`);
```

---

## 2. Agent 使用指南

### 直接使用单个 Agent

```typescript
// 逻辑审查
const logicAgent = new LogicAgent({
  model: 'claude-opus',
  maxTokens: 4000,
  temperature: 0.5
});

const result = await logicAgent.review(
  ['src/app.ts'],
  'file content here'
);

console.log(`Found ${result.issues.length} logic issues`);
console.log(`Token usage: ${result.tokenUsage.total}`);
```

### 所有可用 Agent

```typescript
// 五个维度 Agent
import {
  LogicAgent,
  SecurityAgent,
  PerformanceAgent,
  MaintainabilityAgent,
  EdgeCaseAgent,
  AdversaryAgent,
  IssueCalibrtor
} from '@inquisitor/agents';

// 或从顶级导出
import { LogicAgent /* ... */ } from 'inquisitor';
```

---

## 3. Prompt 参考

### 获取 Prompt

```typescript
import { AGENT_PROMPTS, ADVERSARY_AGENT_PROMPT } from '@inquisitor/agents/prompts';

// 所有维度 prompt
const logicPrompt = AGENT_PROMPTS.logic;
const securityPrompt = AGENT_PROMPTS.security;
const performancePrompt = AGENT_PROMPTS.performance;
const maintainabilityPrompt = AGENT_PROMPTS.maintainability;
const edgeCasePrompt = AGENT_PROMPTS.edge_cases;

// 对抗审查 prompt
const adversaryPrompt = ADVERSARY_AGENT_PROMPT;

// 所有 prompt
const allPrompts = AGENT_PROMPTS_WITH_ADVERSARY;
```

### 自定义 Prompt

```typescript
const customLogicAgent = new LogicAgent({
  systemPrompt: `你是一个自定义的代码审查 Agent...`
});
```

---

## 4. 类型快速查询

### 问题严重程度

```typescript
type Severity = 'critical' | 'high' | 'medium' | 'low';

// 优先级排序
const severityOrder = {
  critical: 0,  // 最高
  high: 1,
  medium: 2,
  low: 3        // 最低
};
```

### 审查维度

```typescript
enum ReviewDimension {
  Logic = 'logic',                   // 逻辑正确性
  Security = 'security',             // 安全性
  Performance = 'performance',       // 性能
  Maintainability = 'maintainability', // 可维护性
  EdgeCases = 'edge_cases'          // 边界情况
}
```

### ReviewIssue 字段说明

```typescript
interface ReviewIssue {
  file: string;              // 问题文件路径 ✓必需
  line: number;              // 问题行号 ✓必需 (> 0)
  endLine?: number;          // 结束行号（可选）
  severity: Severity;        // 问题严重程度 ✓必需
  dimension: ReviewDimension; // 审查维度 ✓必需
  description: string;       // 详细描述 ✓必需
  suggestion: string;        // 修复建议 ✓必需
  confidence: number;        // 置信度 (0-1) ✓必需
  foundBy?: string;          // 发现者 Agent ID (可选)
  codeSnippet?: string;      // 代码片段 (可选)
}
```

---

## 5. 常见用法模式

### 模式 1: 完整审查流程

```typescript
const orchestrator = new ReviewOrchestrator();

const report = await orchestrator.run({
  files: [
    {
      path: 'src/app.ts',
      content: fs.readFileSync('src/app.ts', 'utf-8')
    }
  ],
  context: {
    contextLines: 5,
    includeFullFile: true,
    includeDependencies: false,
    projectRoot: process.cwd()
  },
  mode: 'review'
});

// 按严重程度分组
const critical = report.issues.filter(i => i.severity === 'critical');
const high = report.issues.filter(i => i.severity === 'high');

console.log(`Critical: ${critical.length}`);
console.log(`High: ${high.length}`);
```

### 模式 2: 仅审查特定维度

```typescript
const report = await orchestrator.run({
  files: [/* ... */],
  context: {/* ... */},
  dimensions: [
    ReviewDimension.Security,
    ReviewDimension.Performance
  ],  // 仅审查这两个维度
  mode: 'review'
});
```

### 模式 3: 禁用对抗审查

```typescript
const orchestrator = new ReviewOrchestrator({
  enableAdversary: false  // 跳过对抗审查步骤
});

const report = await orchestrator.run(request);
```

### 模式 4: 手动组装审查流程

```typescript
// 不使用 Orchestrator，手动组装
const agents = [
  new LogicAgent(),
  new SecurityAgent(),
  new PerformanceAgent(),
  new MaintainabilityAgent(),
  new EdgeCaseAgent()
];

// 并行执行所有 Agent
const results = await Promise.all(
  agents.map(agent => agent.review(files, context))
);

// 收集所有问题
const allIssues = results.flatMap(r => r.issues);

// 执行对抗审查
const adversary = new AdversaryAgent();
const adversaryResult = await adversary.challenge(files, context, allIssues);

// 校准问题
const calibrator = new IssueCalibrtor();
const finalIssues = calibrator.calibrate(allIssues, adversaryResult);
```

### 模式 5: 处理审查结果

```typescript
const report = await orchestrator.run(request);

// 统计信息
console.log('=== Summary ===');
console.log(`Total issues: ${report.summary.totalIssues}`);
console.log(`By severity:`);
console.log(`  Critical: ${report.summary.bySeverity.critical}`);
console.log(`  High: ${report.summary.bySeverity.high}`);
console.log(`  Medium: ${report.summary.bySeverity.medium}`);
console.log(`  Low: ${report.summary.bySeverity.low}`);

console.log(`By dimension:`);
console.log(`  Logic: ${report.summary.byDimension.logic}`);
console.log(`  Security: ${report.summary.byDimension.security}`);
console.log(`  Performance: ${report.summary.byDimension.performance}`);
console.log(`  Maintainability: ${report.summary.byDimension.maintainability}`);
console.log(`  Edge Cases: ${report.summary.byDimension.edge_cases}`);

// 元数据
console.log(`\n=== Metadata ===`);
console.log(`Duration: ${report.metadata.durationMs}ms`);
console.log(`Tokens: ${report.metadata.tokenUsage.total}`);
console.log(`Started: ${report.metadata.startedAt}`);
console.log(`Agents: ${report.metadata.agents.join(', ')}`);

// 详细问题
console.log(`\n=== Issues ===`);
report.issues.forEach((issue, index) => {
  console.log(`\n${index + 1}. [${issue.severity.toUpperCase()}] ${issue.dimension}`);
  console.log(`   ${issue.file}:${issue.line}`);
  console.log(`   ${issue.description}`);
  console.log(`   Confidence: ${(issue.confidence * 100).toFixed(0)}%`);
  if (issue.suggestion) {
    console.log(`   → ${issue.suggestion}`);
  }
});
```

---

## 6. 错误处理

### 标准错误处理

```typescript
try {
  const report = await orchestrator.run(request);
  console.log(`Review completed: ${report.summary.totalIssues} issues found`);
} catch (error) {
  console.error('Review failed:', error instanceof Error ? error.message : error);
  // 处理错误...
}
```

### Agent 失败检查

```typescript
// 单个 Agent 执行
const result = await logicAgent.review(files, context);

if (!result.success) {
  console.error(`Agent failed: ${result.error}`);
} else {
  console.log(`Found ${result.issues.length} issues`);
}
```

### 超时处理

```typescript
// Agent 超时配置
const agent = new LogicAgent(
  {/* config */},
  300000  // 5 分钟超时
);

// Orchestrator 超时配置
const orchestrator = new ReviewOrchestrator({
  agentTimeout: 120000,   // 单个 Agent 2 分钟
  totalTimeout: 600000    // 总共 10 分钟
});
```

---

## 7. 配置选项速查

### Agent 配置 (AgentConfig)

```typescript
interface AgentConfig {
  id: string;                 // 唯一标识 (e.g., 'logic-agent')
  name: string;               // 显示名称
  description: string;        // 描述
  dimension?: ReviewDimension; // 专属维度 (维度 Agent 使用)
  systemPrompt: string;       // Claude system prompt
  model?: string;             // 模型 (默认 claude-sonnet-4)
  maxTokens?: number;         // 最大输出 token (默认 4000)
  temperature?: number;       // 温度 (0-1, 默认 0.5)
}
```

### Orchestrator 配置 (OrchestratorConfig)

```typescript
interface OrchestratorConfig {
  model?: string;              // 模型 (默认 claude-opus)
  maxParallel?: number;        // 最大并行数 (默认 5)
  agentTimeout?: number;       // Agent 超时 (默认 120000ms)
  totalTimeout?: number;       // 总超时 (默认 600000ms)
  enableAdversary?: boolean;   // 启用对抗审查 (默认 true)
  enableCache?: boolean;       // 启用缓存 (默认 false)
}
```

### Context 配置 (ContextConfig)

```typescript
interface ContextConfig {
  contextLines: number;           // diff 前后行数 (e.g., 5)
  includeFullFile: boolean;       // 包含完整文件
  includeDependencies: boolean;   // 包含依赖文件
  projectRoot: string;            // 项目根目录
}
```

---

## 8. Token 成本估算

### 典型审查成本

| 场景 | 输入 Token | 输出 Token | 总计 |
|------|-----------|----------|------|
| 小文件 (100 行) | 5K-10K | 2K-5K | 7K-15K |
| 中等文件 (500 行) | 20K-30K | 5K-10K | 25K-40K |
| 大文件 (1000+ 行) | 50K-80K | 10K-20K | 60K-100K |

### 成本优化

```typescript
// 1. 仅审查特定维度
dimensions: [ReviewDimension.Security]  // 减少 Agent 数量

// 2. 禁用对抗审查
enableAdversary: false  // 节省 ~30% token

// 3. 减少上下文
includeFullFile: false  // 仅包含 diff

// 4. 降低模型等级
model: 'claude-haiku'    // 更便宜的模型
```

---

## 9. 常见问题

### Q: 如何指定 Agent 模型?
```typescript
const agent = new LogicAgent({ model: 'claude-opus' });
```

### Q: 如何自定义 Prompt?
```typescript
const agent = new LogicAgent({
  systemPrompt: 'Custom prompt...'
});
```

### Q: 如何过滤低置信度问题?
```typescript
const highConfidence = report.issues.filter(i => i.confidence > 0.7);
```

### Q: 对抗审查耗时多久?
```typescript
// 通常与所有维度 Agent 耗时相同
// 总耗时 ≈ max(dimension agents) + adversary agent
```

### Q: 如何禁用某个维度?
```typescript
dimensions: [
  ReviewDimension.Logic,
  ReviewDimension.Security,
  // 不包括 Performance, Maintainability, EdgeCases
]
```

### Q: 如何获取 JSON 格式的报告?
```typescript
const json = JSON.stringify(report, null, 2);
fs.writeFileSync('report.json', json);
```

---

## 10. 导入速查

### 完整导入

```typescript
import {
  // 类型
  ReviewDimension,
  ReviewIssue,
  ReviewReport,
  ReviewRequest,
  ReviewSummary,
  ReviewMetadata,
  AgentConfig,
  AgentResult,
  AdversaryResult,
  
  // Agent 类
  AgentRunner,
  LogicAgent,
  SecurityAgent,
  PerformanceAgent,
  MaintainabilityAgent,
  EdgeCaseAgent,
  AdversaryAgent,
  IssueCalibrtor,
  
  // Orchestrator
  ReviewOrchestrator,
  
  // Prompts
  AGENT_PROMPTS,
  ADVERSARY_AGENT_PROMPT,
  LOGIC_AGENT_PROMPT,
  SECURITY_AGENT_PROMPT,
  PERFORMANCE_AGENT_PROMPT,
  MAINTAINABILITY_AGENT_PROMPT,
  EDGE_CASE_AGENT_PROMPT
} from 'inquisitor';
```

### 按用途分类导入

```typescript
// 仅需要类型
import type {
  ReviewDimension,
  ReviewIssue,
  ReviewReport
} from 'inquisitor';

// 仅需要 Orchestrator
import { ReviewOrchestrator } from 'inquisitor';

// 仅需要特定 Agent
import { LogicAgent, SecurityAgent } from 'inquisitor';

// 仅需要 Prompts
import { AGENT_PROMPTS } from 'inquisitor/agents/prompts';
```

