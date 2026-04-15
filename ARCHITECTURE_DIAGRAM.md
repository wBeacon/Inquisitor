# Inquisitor 系统架构图

## 1. 整体系统架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ReviewOrchestrator (编排器)                          │
│                    管理整个代码审查流程的调度和协调                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
         ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
         │  Input Processor │  │  5 Dimension     │  │  Output Handler  │
         ├──────────────────┤  │    Agents        │  ├──────────────────┤
         │ FileCollector    │  ├──────────────────┤  │ ReportGenerator  │
         │ GitDiffCollector │  │ LogicAgent       │  │                  │
         │ ContextEnricher  │  │ SecurityAgent    │  │ (JSON/HTML/MD)   │
         └──────────────────┘  │ PerfAgent        │  └──────────────────┘
                               │ MaintainAgent    │
                               │ EdgeCaseAgent    │
                               └──────────────────┘
                                      │
                                      ▼
                          ┌─────────────────────────┐
                          │  AdversaryAgent         │
                          │  (对抗式审查)            │
                          │ 寻找遗漏 + 质疑已有问题  │
                          └─────────────────────────┘
                                      │
                                      ▼
                          ┌─────────────────────────┐
                          │  IssueCalibrtor         │
                          │  (问题校准)             │
                          │ 置信度调整/去重/排序    │
                          └─────────────────────────┘
                                      │
                                      ▼
                          ┌─────────────────────────┐
                          │  ReviewReport           │
                          │  (最终报告)             │
                          │ Issues + Summary + Meta │
                          └─────────────────────────┘
```

---

## 2. Agent 执行流程详图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ReviewOrchestrator.run()                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
        ┌──────────────────────────┐       ┌──────────────────────────┐
        │  prepareReviewContext()  │       │                          │
        ├──────────────────────────┤       │                          │
        │ - 收集文件列表           │       │ (收集 input 并构建       │
        │ - 构建上下文字符串       │       │  审查的上下文)           │
        │ - 合并 diff 内容         │       │                          │
        └──────────────────────────┘       └──────────────────────────┘
                    │
                    ▼
        ┌──────────────────────────────────────────────────────────────┐
        │         executeDimensionAgents() [并行执行所有Agent]         │
        └──────────────────────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┬───────────┬───────────┐
        │           │           │           │           │
        ▼           ▼           ▼           ▼           ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │ Logic  │ │Security│ │Perf    │ │Maint   │ │EdgeCase│
    │ Agent  │ │ Agent  │ │ Agent  │ │ Agent  │ │ Agent  │
    └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
        │           │           │           │           │
        └───────────┼───────────┼───────────┼───────────┘
                    │
                    ▼
        ┌──────────────────────────┐
        │  收集所有 AgentResult[]   │
        │  - 合并所有发现的问题    │
        │  - 累计 token 统计       │
        └──────────────────────────┘
                    │
                    ▼
        ┌──────────────────────────────────────────────────────────────┐
        │              executeAdversaryReview() [如果启用]             │
        └──────────────────────────────────────────────────────────────┘
                    │
                    ▼
        ┌──────────────────────────┐
        │  AdversaryAgent.challenge │
        │  (existingIssues)        │
        └──────────────────────────┘
                    │
                    ├─ 发现新问题
                    └─ 质疑已有问题 (confirmed/disputed/false_positive)
                    │
                    ▼
        ┌──────────────────────────┐
        │  AdversaryResult         │
        │  - newIssues[]           │
        │  - issueJudgments[]      │
        │  - falsePositives[]      │
        │  - confidenceAdjustments │
        └──────────────────────────┘
                    │
                    ▼
        ┌──────────────────────────────────────────────────────────────┐
        │                  calibrateResults()                          │
        ├──────────────────────────────────────────────────────────────┤
        │  IssueCalibrtor.calibrate(allIssues, adversaryResult)        │
        │                                                              │
        │  步骤:                                                       │
        │  1. applyConfidenceAdjustments() - 调整置信度               │
        │  2. filterFalsePositives() - 过滤误报                       │
        │  3. 添加新问题                                              │
        │  4. mergeeDuplicates() - 去重 (保留最高置信度)             │
        │  5. sortIssues() - 排序 (按严重程度 + 置信度)             │
        └──────────────────────────────────────────────────────────────┘
                    │
                    ▼
        ┌──────────────────────────┐
        │  generateReport()        │
        │  - generateSummary()     │
        │  - generateMetadata()    │
        └──────────────────────────┘
                    │
                    ▼
        ┌──────────────────────────┐
        │   ReviewReport           │
        │   - issues[]             │
        │   - summary              │
        │   - metadata             │
        └──────────────────────────┘
```

---

## 3. Agent 类层级关系

```
┌────────────────────────────────┐
│      AgentRunner (抽象类)       │
├────────────────────────────────┤
│ - config: AgentConfig          │
│ - timeout: number              │
│ - review(files, context)       │
│ - callClaudeAPI(userMessage)   │
│ - parseJsonResponse(text)      │
│ - validateAndFixIssues(raw)    │
└────────────────────────────────┘
              △
              │ 继承
        ┌─────┴─────┬────────────┬──────────────┬──────────────┐
        │            │            │              │              │
        ▼            ▼            ▼              ▼              ▼
    ┌────────┐  ┌────────┐  ┌──────────┐  ┌─────────────┐  ┌─────────┐
    │ Logic  │  │Security│  │Perf Agent│  │Maint Agent  │  │EdgeCase │
    │ Agent  │  │ Agent  │  │          │  │             │  │ Agent   │
    └────────┘  └────────┘  └──────────┘  └─────────────┘  └─────────┘


┌────────────────────────────────┐
│    AdversaryAgent (独立)       │
├────────────────────────────────┤
│ - config: AgentConfig          │
│ - challenge(files, context,    │
│    existingIssues)             │
│ - 返回 AdversaryResult         │
└────────────────────────────────┘


┌────────────────────────────────┐
│   IssueCalibrtor (独立)        │
├────────────────────────────────┤
│ - calibrate(issues,            │
│    adversaryResult)            │
│ - applyConfidenceAdjustments() │
│ - filterFalsePositives()       │
│ - mergeeDuplicates()           │
│ - sortIssues()                 │
└────────────────────────────────┘
```

---

## 4. 数据流转图

```
输入:
┌──────────────────┐
│  ReviewRequest   │
├──────────────────┤
│ - files[]        │
│ - diff           │
│ - context        │
│ - dimensions     │
│ - mode           │
└──────────────────┘
      │
      ▼
┌──────────────────────────────────┐
│  prepareReviewContext()          │
│  - 收集文件内容                  │
│  - 合并 diff 内容                │
└──────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────┐
│  files[], contextString          │
│  发送给所有 Agent                │
└──────────────────────────────────┘
      │
      ├─────────────────────────────────────────────────┐
      │                                                 │
      ▼ (并行)                                          ▼ (并行)
  ┌────────────┐     ┌────────────┐     ┌────────────┐
  │ LogicAgent │     │SecurityAgent   │     │PerformanceAgent
  │   review() │     │   review()     │     │  review()
  └────────────┘     └────────────┘     └────────────┘
      │                   │                   │
      ▼                   ▼                   ▼
  ┌────────────┐     ┌────────────┐     ┌────────────┐
  │AgentResult │     │AgentResult │     │AgentResult │
  │(issues[])  │     │(issues[])  │     │(issues[])  │
  └────────────┘     └────────────┘     └────────────┘
      │                   │                   │
      └───────────────────┼───────────────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │  allIssues[]     │
                 │  (合并所有问题)   │
                 └──────────────────┘
                          │
                          ▼ (如果启用 adversary)
                 ┌──────────────────────────┐
                 │ AdversaryAgent.challenge │
                 │ (files, context,        │
                 │  allIssues)            │
                 └──────────────────────────┘
                          │
                          ▼
                 ┌──────────────────────────┐
                 │ AdversaryResult          │
                 │ - newIssues[]            │
                 │ - issueJudgments[]       │
                 └──────────────────────────┘
                          │
                          ▼
                 ┌──────────────────────────┐
                 │ IssueCalibrtor.calibrate │
                 │ (allIssues,              │
                 │  adversaryResult)        │
                 └──────────────────────────┘
                          │
                          ▼
                 ┌──────────────────────────┐
                 │ finalIssues[]            │
                 │ (调整/去重/排序后)       │
                 └──────────────────────────┘
                          │
                          ▼
                 ┌──────────────────────────┐
                 │ ReviewReport             │
                 │ - issues[]               │
                 │ - summary                │
                 │ - metadata               │
                 └──────────────────────────┘

输出:
┌──────────────────────────────┐
│     ReviewReport             │
├──────────────────────────────┤
│ issues: ReviewIssue[]        │
│ summary: ReviewSummary       │
│ metadata: ReviewMetadata     │
└──────────────────────────────┘
```

---

## 5. 对抗审查流程细节

```
┌─────────────────────────────────────────────────────┐
│         AdversaryAgent.challenge()                  │
│       (完全独立的审查视角)                          │
└─────────────────────────────────────────────────────┘

输入:
- files: string[]
- context: string
- existingIssues: ReviewIssue[]

┌─────────────────────────────────────────────────────┐
│         任务 1: 寻找被遗漏的问题                    │
├─────────────────────────────────────────────────────┤
│ 代码中是否存在其他 Agent 都没发现的问题?            │
│ 可能属于任何维度:                                  │
│ - 逻辑错误                                         │
│ - 安全漏洞                                         │
│ - 性能问题                                         │
│ - 可维护性问题                                     │
│ - 边界情况                                         │
│                                                    │
│ 输出: newIssues: ReviewIssue[]                    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│         任务 2: 对已有问题提出质疑                  │
├─────────────────────────────────────────────────────┤
│ 对每个已有问题评估:                                │
│                                                    │
│ ✓ Confirmed(确认)                                 │
│   → 这是真实且严重的问题，置信度维持或提高        │
│                                                    │
│ ⚠ Disputed(质疑)                                  │
│   → 不完全同意，问题可能被夸大                    │
│   → 建议降低置信度 (0.4-0.7)                     │
│                                                    │
│ ✗ False Positive(误报)                            │
│   → 不是问题，代码实际上是正确的                  │
│   → 建议降低置信度 (0.1-0.3)                     │
│                                                    │
│ 输出: issueJudgments: IssueJudgment[]            │
│ [{                                                │
│   existingIssueIndex: 0,                         │
│   judgment: 'confirmed|disputed|false_positive',│
│   reason: '...',                                 │
│   suggestedConfidenceAdjustment: 0.5,           │
│   suggestedSeverityAdjustment: 'high'           │
│ }]                                               │
└─────────────────────────────────────────────────────┘

输出: AdversaryResult
├─ agentId: 'adversary-agent'
├─ issues: ReviewIssue[]  (新发现的问题)
├─ falsePositives: number[]  (误报的索引)
└─ confidenceAdjustments: Array<{
    issueIndex: number,
    newConfidence: number,
    reason: string
  }>
```

---

## 6. 问题去重和排序流程

```
┌─────────────────────────────────────────────────────┐
│          IssueCalibrtor.calibrate()                │
└─────────────────────────────────────────────────────┘

输入:
- originalIssues: ReviewIssue[] (所有维度 Agent 发现的)
- adversaryResult: AdversaryResult

步骤 1: 应用置信度调整
┌────────────────────────────────────┐
│ applyConfidenceAdjustments()       │
├────────────────────────────────────┤
│ for each confidenceAdjustment:     │
│   issue[index].confidence =        │
│     newConfidence (限制在 0-1)    │
└────────────────────────────────────┘

步骤 2: 过滤误报
┌────────────────────────────────────┐
│ filterFalsePositives()             │
├────────────────────────────────────┤
│ for each issue:                    │
│   if index in falsePositives[]:    │
│     删除该问题                     │
│   else if confidence < 0.3:        │
│     (可选) 删除低置信度问题       │
└────────────────────────────────────┘

步骤 3: 添加新问题
┌────────────────────────────────────┐
│ [...filteredIssues,                │
│  ...adversaryResult.issues]        │
└────────────────────────────────────┘

步骤 4: 合并重复问题
┌────────────────────────────────────┐
│ mergeeDuplicates()                 │
├────────────────────────────────────┤
│ issueKey = `${file}:${line}:       │
│            ${dimension}:${severity}`
│                                    │
│ for each issue:                    │
│   if key exists:                   │
│     保留置信度更高的那个           │
│   else:                            │
│     添加到 map                     │
└────────────────────────────────────┘

步骤 5: 排序
┌────────────────────────────────────┐
│ sortIssues()                       │
├────────────────────────────────────┤
│ 首先按严重程度排序:                │
│   critical → high → medium → low   │
│                                    │
│ 然后按置信度排序 (高 → 低)        │
└────────────────────────────────────┘

输出: finalIssues[]
```

---

## 7. ReviewReport 结构图

```
┌──────────────────────────────────────────────────────┐
│          ReviewReport (最终审查报告)                 │
├──────────────────────────────────────────────────────┤
│                                                      │
│  issues: ReviewIssue[]                              │
│  ├─ {                                               │
│  │  file: 'src/app.ts',                            │
│  │  line: 42,                                       │
│  │  severity: 'high',                               │
│  │  dimension: 'logic',                             │
│  │  description: '...',                             │
│  │  suggestion: '...',                              │
│  │  confidence: 0.85                                │
│  │}                                                 │
│  └─ ...                                             │
│                                                      │
│  summary: ReviewSummary                             │
│  ├─ bySeverity: {                                   │
│  │  critical: 2,                                    │
│  │  high: 5,                                        │
│  │  medium: 12,                                     │
│  │  low: 8                                          │
│  │}                                                 │
│  ├─ byDimension: {                                  │
│  │  logic: 5,                                       │
│  │  security: 3,                                    │
│  │  performance: 8,                                 │
│  │  maintainability: 7,                             │
│  │  edge_cases: 4                                   │
│  │}                                                 │
│  └─ totalIssues: 27                                 │
│                                                      │
│  metadata: ReviewMetadata                           │
│  ├─ durationMs: 45230                               │
│  ├─ tokenUsage: {                                   │
│  │  input: 125000,                                  │
│  │  output: 32000,                                  │
│  │  total: 157000                                   │
│  │}                                                 │
│  ├─ startedAt: '2024-04-15T10:30:00Z'              │
│  ├─ completedAt: '2024-04-15T10:31:15Z'            │
│  └─ agents: ['logic-agent', 'security-agent',      │
│               'performance-agent', 'maintainability-agent',
│               'edge-case-agent', 'adversary-agent'] │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## 8. 配置覆盖优先级

```
用户配置 (Partial<AgentConfig>)
        │
        ▼
   合并到 defaultConfig
        │
        ▼
  最终配置 (AgentConfig)
        │
   ┌────┴───┬────────┬────────┬──────────┐
   │         │        │        │          │
   ▼         ▼        ▼        ▼          ▼
  id      name    description dimension systemPrompt
   │         │        │        │          │
   └─────────┴────────┴────────┴──────────┴─→ AgentRunner
                                             (执行审查)
```

---

## 9. Prompt 流转

```
AGENT_PROMPTS_WITH_ADVERSARY
├─ logic: LOGIC_AGENT_PROMPT
├─ security: SECURITY_AGENT_PROMPT
├─ performance: PERFORMANCE_AGENT_PROMPT
├─ maintainability: MAINTAINABILITY_AGENT_PROMPT
├─ edge_cases: EDGE_CASE_AGENT_PROMPT
└─ adversary: ADVERSARY_AGENT_PROMPT
        │
        ▼
   AgentConfig.systemPrompt
        │
        ▼
   callClaudeAPI(systemPrompt + userMessage)
        │
        ▼
   Claude API Response
        │
        ▼
   parseJsonResponse()
        │
        ▼
   ReviewIssue[]
```

---

## 10. 并行执行和超时管理

```
┌─────────────────────────────────────────────────────┐
│     ReviewOrchestrator.executeDimensionAgents()    │
└─────────────────────────────────────────────────────┘
        │
        ├─ 创建 5 个 Promise
        │  └─ 每个包装在 executeAgentWithTimeout()
        │
        ▼
    Promise.all([
      LogicAgent.review() + timeout(120s)
      SecurityAgent.review() + timeout(120s)
      PerformanceAgent.review() + timeout(120s)
      MaintainabilityAgent.review() + timeout(120s)
      EdgeCaseAgent.review() + timeout(120s)
    ])
        │
        ├─ 所有 Agent 并行执行
        │ (最多 5 个并发)
        │
        ├─ 最慢的 Agent 决定总耗时
        │
        └─ 如果任何 Agent 超时
           └─ 整个 Promise.all 失败 ✗
           
总体超时控制:
┌─────────────────────────────────────────────────────┐
│      ReviewOrchestrator.run()                       │
│      (totalTimeout: 600s)                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  prepareReviewContext() ... 5s                     │
│  │                                                 │
│  executeDimensionAgents() ... ~120s (并行)        │
│  │  (单个 agentTimeout: 120s)                      │
│  │                                                 │
│  executeAdversaryReview() ... ~120s                │
│  │  (单个 agentTimeout: 120s)                      │
│  │                                                 │
│  calibrateResults() ... 1s                        │
│  │                                                 │
│  generateReport() ... 1s                          │
│                                                    │
│  总耗时 ~250s (远小于 600s 总超时)               │
│                                                    │
└─────────────────────────────────────────────────────┘
```

