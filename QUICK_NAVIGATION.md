# Inquisitor 项目快速导航指南

## 📋 核心文件导航

### 类型定义
| 文件 | 位置 | 用途 |
|------|------|------|
| ReviewRequest | `src/types/review.ts` | 审查请求接口定义 |
| ReviewIssue | `src/types/review.ts` | 问题定义和属性 |
| ReviewReport | `src/types/review.ts` | 最终报告结构 |
| ReviewDimension | `src/types/review.ts` | 5个审查维度枚举 |
| AgentConfig | `src/types/agent.ts` | Agent 配置接口 |
| AgentResult | `src/types/agent.ts` | Agent 执行结果 |
| AdversaryResult | `src/types/agent.ts` | 对抗审查结果 |

### Agent 系统
| 文件 | 位置 | 职责 |
|------|------|------|
| AgentRunner | `src/agents/agent-runner.ts` | Agent 基础抽象类 |
| LogicAgent | `src/agents/logic-agent.ts` | 逻辑正确性审查 |
| SecurityAgent | `src/agents/security-agent.ts` | 安全性审查 |
| PerformanceAgent | `src/agents/performance-agent.ts` | 性能审查 |
| MaintainabilityAgent | `src/agents/maintainability-agent.ts` | 可维护性审查 |
| EdgeCaseAgent | `src/agents/edge-case-agent.ts` | 边界情况审查 |
| AdversaryAgent | `src/agents/adversary-agent.ts` | 对抗式审查 |
| IssueCalibrator | `src/agents/issue-calibrator.ts` | 问题校准处理 |

### 编排系统
| 文件 | 位置 | 职责 |
|------|------|------|
| ReviewOrchestrator | `src/orchestrator/orchestrator.ts` | 主编排器（5阶段流程） |
| OrchestratorConfig | `src/orchestrator/config.ts` | 配置管理和默认值 |
| ParallelScheduler | `src/orchestrator/parallel-scheduler.ts` | 并行任务调度 |
| ResultMerger | `src/orchestrator/result-merger.ts` | 结果去重和排序 |

### 输入采集
| 文件 | 位置 | 职责 |
|------|------|------|
| GitDiffCollector | `src/input/git-diff-collector.ts` | Git Diff 采集 |
| FileCollector | `src/input/file-collector.ts` | 文件系统采集 |
| ContextEnricher | `src/input/context-enricher.ts` | 上下文自动发现 |

### 输出报告
| 文件 | 位置 | 职责 |
|------|------|------|
| JsonReporter | `src/output/json-reporter.ts` | JSON 格式报告（SARIF-like） |
| MarkdownReporter | `src/output/markdown-reporter.ts` | Markdown 格式报告 |
| ReportGenerator | `src/output/report-generator.ts` | 兼容接口报告生成器 |
| SummaryGenerator | `src/output/summary-generator.ts` | 统计摘要生成 |

### Skill 集成
| 文件 | 位置 | 职责 |
|------|------|------|
| ReviewSkill | `src/skill/review-skill.ts` | 代码审查 Skill 主类 |

---

## 🔍 常见问题查询指南

### Q: 如何添加新的审查维度？
**步骤**:
1. 在 `src/types/review.ts` 的 `ReviewDimension` 枚举中添加新维度
2. 在 `src/agents/` 目录下创建新的 Agent 类（继承 `AgentRunner`）
3. 在 `src/agents/prompts/` 中添加对应的 prompt
4. 在 `ReviewOrchestrator` 的构造函数中注册新 Agent
5. 在 `src/agents/index.ts` 中导出新 Agent

**相关文件**:
- `src/types/review.ts` (ReviewDimension 枚举)
- `src/agents/agent-runner.ts` (基础类)
- `src/orchestrator/orchestrator.ts` (注册位置)

---

### Q: Agent 是如何调用 Claude API 的？
**答**:
- 所有 Agent 都继承 `AgentRunner` 基类
- `AgentRunner.callClaudeAPI()` 使用 `@anthropic-ai/sdk` 调用 Claude
- **重要**: 每次调用都会创建新的 Anthropic 客户端实例（确保隔离）
- 响应通过健壮的 `parseJsonResponse()` 解析，支持多种错误恢复

**相关文件**: `src/agents/agent-runner.ts` (第 82-109 行)

---

### Q: 如何处理 Agent 的 JSON 响应解析失败？
**答**: `AgentRunner` 内置多层容错机制：
1. 移除 markdown code fence (```json ... ```)
2. 尝试提取 JSON 数组（处理前后多余文本）
3. 移除 trailing commas
4. 单引号→双引号替换
5. 修复无引号的属性名

失败时自动返回空数组 `[]`，不中断流程。

**相关文件**: `src/agents/agent-runner.ts` (第 154-195 行)

---

### Q: 如何修改编排流程（如跳过某个维度）？
**答**:
```typescript
const orchestrator = new ReviewOrchestrator({
  skipDimensions: [ReviewDimension.Security],  // 跳过安全审查
  enableAdversary: false,                       // 禁用对抗审查
  agentTimeout: 120000,                         // 2分钟超时
});
```

**相关文件**: 
- `src/orchestrator/config.ts` (OrchestratorConfig 接口)
- `src/orchestrator/orchestrator.ts` (executeDimensionAgents 方法)

---

### Q: 如何理解对抗审查的工作原理？
**答**:
1. 收集所有维度 Agent 的问题
2. 调用 `AdversaryAgent.challenge()` 独立审视代码
3. 对抗 Agent 输出：新问题 + 对已有问题的判断
4. `IssueCalibrator` 根据判断结果调整置信度或标记误报
5. 置信度 < 0.3 的误报直接移除，其他误报 severity 降级

**相关文件**:
- `src/agents/adversary-agent.ts` (对抗 Agent 实现)
- `src/agents/issue-calibrator.ts` (校准逻辑)

---

### Q: 如何生成不同格式的报告？
**答**:
```typescript
// JSON 格式
const json = JsonReporter.generate(report, 2);

// Markdown 格式
const markdown = MarkdownReporter.generate(report);

// 两种格式
const generator = new ReportGenerator({
  formats: ['json', 'markdown'],
  includeCodeSnippets: true,
});
const json2 = generator.toJSON(report);
const md2 = generator.toMarkdown(report);
await generator.toFile(report, './reports', 'review');
```

**相关文件**:
- `src/output/json-reporter.ts`
- `src/output/markdown-reporter.ts`
- `src/output/report-generator.ts`

---

### Q: 如何处理审查超时？
**答**:
- 单 Agent 超时: 通过 `agentTimeout` 配置（默认 300s）
- 若超时，Agent 返回 `success: false` 且该维度标记为 `incomplete`
- 编排器继续执行其他 Agent 和对抗审查
- 最终报告中元数据包含 `incompleteDimensions` 字段

**相关文件**:
- `src/orchestrator/config.ts` (DEFAULT_AGENT_TIMEOUT)
- `src/orchestrator/parallel-scheduler.ts` (超时控制)
- `src/agents/agent-runner.ts` (review 方法)

---

### Q: 如何启用或禁用对抗审查？
**答**:
```typescript
const orchestrator = new ReviewOrchestrator({
  enableAdversary: true,  // 默认 true，启用对抗审查
});

// 禁用对抗审查
const orchestrator2 = new ReviewOrchestrator({
  enableAdversary: false,
});
```

**相关文件**:
- `src/orchestrator/config.ts` (DEFAULT_ENABLE_ADVERSARY)
- `src/orchestrator/orchestrator.ts` (第 136-144 行)

---

### Q: Issue 如何进行去重？
**答**: `ResultMerger.dedup()` 基于以下 key 去重：
```
${file}:${line}:${dimension}:${severity}
```
重复问题保留置信度最高的那个。

**相关文件**: `src/orchestrator/result-merger.ts` (dedup 方法)

---

### Q: 如何统计审查结果？
**答**:
```typescript
// ReviewSummary 包含：
// - bySeverity: 按严重程度统计 (critical, high, medium, low)
// - byDimension: 按审查维度统计 (logic, security, performance, etc.)
// - totalIssues: 问题总数

const summary = report.summary;
console.log(summary.bySeverity.critical);  // 严重问题数
console.log(summary.byDimension.security); // 安全问题数
```

**相关文件**:
- `src/types/review.ts` (ReviewSummary 接口)
- `src/output/summary-generator.ts`

---

### Q: ReviewSkill 支持哪些审查模式？
**答**:
| 模式 | 说明 | 是否需要 path |
|------|------|-------------|
| diff | 审查 git diff | 否 |
| file | 审查单个文件 | 是 |
| directory | 审查整个目录 | 是 |

**相关文件**: `src/skill/review-skill.ts` (execute 方法)

---

### Q: 如何扩展报告输出（如自定义 HTML）？
**答**:
1. 创建新的 Reporter 类（如 `HtmlReporter`）
2. 实现 `generate(report: ReviewReport): string` 方法
3. 在 `src/output/index.ts` 中导出
4. 可选：在 `ReportGenerator` 中集成

**参考实现**:
- `src/output/markdown-reporter.ts` (中文本地化示例)
- `src/output/json-reporter.ts` (格式化示例)

---

## 🚀 快速执行示例

### 审查 Git Diff
```typescript
import { ReviewOrchestrator, GitDiffCollector, MarkdownReporter } from 'inquisitor';

const orchestrator = new ReviewOrchestrator();
const gitCollector = new GitDiffCollector();

const files = await gitCollector.collect();
const report = await orchestrator.run({
  files,
  context: {
    contextLines: 50,
    includeFullFile: true,
    includeDependencies: true,
    projectRoot: './'
  },
  mode: 'review'
});

console.log(MarkdownReporter.generate(report));
```

### 审查单个文件
```typescript
import { ReviewOrchestrator, FileCollector } from 'inquisitor';

const orchestrator = new ReviewOrchestrator();
const fileCollector = new FileCollector();

const files = await fileCollector.collect('./src/app.ts');
const report = await orchestrator.run({
  files,
  context: {
    contextLines: 50,
    includeFullFile: true,
    includeDependencies: false,
    projectRoot: './'
  },
  mode: 'review'
});
```

### 仅审查安全问题
```typescript
const report = await orchestrator.run({
  // ... 其他配置
  dimensions: [ReviewDimension.Security],
  mode: 'review'
});
```

### 禁用对抗审查加快速度
```typescript
const orchestrator = new ReviewOrchestrator({
  enableAdversary: false,
  agentTimeout: 60000,  // 1分钟超时
});
const report = await orchestrator.run(request);
```

---

## 📦 项目依赖速查

| 包 | 版本 | 用途 |
|----|------|------|
| @anthropic-ai/sdk | ^0.89.0 | Claude API 调用 |
| glob | ^13.0.6 | 文件模式匹配 |
| typescript | ^5.4.0 | TypeScript 编译 |
| jest | ^29.7.0 | 单元测试框架 |
| ts-jest | ^29.1.1 | Jest TypeScript 支持 |

---

## 🔧 开发命令

```bash
# 类型检查
npm run typecheck

# 编译
npm run build

# 清除编译产物
npm run clean

# 运行测试
npm run test

# 监听模式运行测试
npm run test:watch

# 覆盖率测试
npm run test:coverage

# 代码检查
npm run lint
```

---

## 📚 相关文档

| 文档 | 位置 | 用途 |
|------|------|------|
| 项目说明 | `README.md` | 项目概述 |
| 详细探索 | `PROJECT_EXPLORATION_DETAILED.md` | 完整架构详解 |
| 快速导航 | `QUICK_NAVIGATION.md` | 本文档 |

---

## 💡 设计亮点

1. **5阶段编排流程**: 清晰的执行阶段，易于理解和扩展
2. **完全隔离的 Agent**: 每个 Agent 独立上下文，无共享状态
3. **健壮的 JSON 解析**: 多层容错机制应对 LLM 不稳定输出
4. **对抗审查**: 以全新视角质疑已有结论，提高准确率
5. **中文本地化**: 报告、标签完全本地化，易于阅读
6. **灵活的配置系统**: 支持维度跳过、超时控制、Agent 选择等

---

**最后更新**: 2026-04-15
