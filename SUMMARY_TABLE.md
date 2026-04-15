# Inquisitor 项目 - 总结速查表

## 📊 项目概览

| 项目名称 | Inquisitor |
|---------|-----------|
| 描述 | 高强度代码审查工具 - 以对抗式 Agent 模式深度审查代码质量 |
| 主要语言 | TypeScript |
| 依赖框架 | @anthropic-ai/sdk (Claude API) |
| 总文件数 | 30+ |
| 核心模块 | 8 |
| Agent 数量 | 6 |
| 审查维度 | 5 |
| 代码行数 | ~3500 (不含测试) |

---

## 🏗️ 系统架构概览

```
Inquisitor 系统架构
│
├─ 输入层 (Input)
│  ├─ GitDiffCollector      → 从 git diff 提取文件变更
│  ├─ FileCollector         → 从文件系统读取代码
│  └─ ContextEnricher       → 自动发现依赖上下文
│
├─ 编排层 (Orchestrator)
│  ├─ ReviewOrchestrator    → 5 阶段流程编排
│  ├─ ParallelScheduler     → 并行任务调度
│  └─ ResultMerger          → 结果去重和排序
│
├─ 审查层 (Agent System)
│  ├─ AgentRunner           → Agent 基础类
│  ├─ LogicAgent            → 逻辑正确性审查
│  ├─ SecurityAgent         → 安全性审查
│  ├─ PerformanceAgent      → 性能审查
│  ├─ MaintainabilityAgent  → 可维护性审查
│  ├─ EdgeCaseAgent         → 边界情况审查
│  ├─ AdversaryAgent        → 对抗式审查
│  └─ IssueCalibrator       → 问题校准处理
│
├─ 输出层 (Output)
│  ├─ JsonReporter          → JSON 格式报告
│  ├─ MarkdownReporter      → Markdown 格式报告
│  ├─ ReportGenerator       → 兼容接口生成器
│  └─ SummaryGenerator      → 统计摘要生成
│
└─ Skill 层 (Claude Code Skill)
   └─ ReviewSkill           → 代码审查 Skill 包装
```

---

## 🔄 5 阶段审查流程

| 阶段 | 名称 | 功能 | 耗时 | 可失败 |
|------|------|------|------|--------|
| 1 | Input Preparation | 收集文件和构建上下文 | < 1s | ❌ 否 |
| 2 | Dimension Review | 并行执行 5 个维度 Agent | 可配 | ⚠️ 有超时降级 |
| 3 | Adversary Review | 对抗式二次审查 | 可配 | ⚠️ 可选&超时 |
| 4 | Calibration | 去重和置信度调整 | < 1s | ❌ 否 |
| 5 | Report Generation | 生成最终报告 | < 1s | ❌ 否 |

---

## 🎯 5 个审查维度详解

| 维度 | Agent 类 | 关键职责 | 示例问题 | 温度 |
|------|---------|--------|---------|------|
| Logic | LogicAgent | 逻辑正确性检查 | 控制流错误、空值处理、类型匹配 | 0.5 |
| Security | SecurityAgent | 安全漏洞检查 | 注入、认证绕过、敏感数据泄露 | 0.5 |
| Performance | PerformanceAgent | 性能问题检查 | 时间复杂度、资源泄露、冗余计算 | 0.5 |
| Maintainability | MaintainabilityAgent | 可维护性检查 | 重复代码、高耦合、命名不规范 | 0.5 |
| EdgeCases | EdgeCaseAgent | 边界条件检查 | 空值、溢出、并发、异常路径 | 0.5 |
| Adversary | AdversaryAgent | 对抗式质疑 | 寻找遗漏问题、标记误报 | 0.7 |

**关键特性**:
- 所有维度 Agent 独立上下文（完全隔离）
- 并行执行，互不阻塞
- 支持维度跳过或选择性执行
- 超时时自动降级（不中断流程）

---

## 📋 核心类型速查

### ReviewRequest（审查请求）
```typescript
{
  files: FileToReview[],           // 待审查的文件列表
  diff?: string,                   // 整体 diff（可选）
  context: ContextConfig,          // 上下文配置
  dimensions?: ReviewDimension[],  // 指定维度（可选，空则全部）
  mode: 'review'|'review-fix',     // 审查模式
  maxIterations?: number           // 最大迭代次数
}
```

### ReviewIssue（审查问题）
```typescript
{
  file: string,                    // 文件路径
  line: number,                    // 行号
  endLine?: number,                // 结束行（范围）
  severity: 'critical'|'high'|'medium'|'low',  // 严重程度
  dimension: ReviewDimension,      // 审查维度
  description: string,             // 问题描述
  suggestion: string,              // 修复建议
  confidence: number,              // 置信度 [0, 1]
  foundBy?: string,                // 发现者 Agent
  codeSnippet?: string,            // 代码片段
  adversaryVerdict?: 'confirmed'|'disputed'|'false_positive'  // 对抗判定
}
```

### ReviewReport（审查报告）
```typescript
{
  issues: ReviewIssue[],           // 所有问题
  summary: {
    bySeverity: { critical, high, medium, low },  // 按严重程度
    byDimension: { logic, security, ... },         // 按维度
    totalIssues: number
  },
  metadata: {
    durationMs: number,            // 审查耗时（毫秒）
    tokenUsage: { input, output, total },
    startedAt: string,             // ISO 8601 时间
    completedAt: string,
    agents: string[]               // 参与的 Agent 列表
  }
}
```

---

## ⚙️ 配置参数详解

### OrchestratorConfig

| 参数 | 默认值 | 含义 | 范围 |
|------|--------|------|------|
| model | claude-opus | 使用的 AI 模型 | claude-opus/claude-sonnet |
| maxParallel | 5 | 最大并行 Agent 数 | 1-10 |
| agentTimeout | 300000 | 单 Agent 超时（毫秒） | 60000-600000 |
| totalTimeout | 600000 | 总超时（毫秒） | 300000-3600000 |
| enableAdversary | true | 启用对抗审查 | true/false |
| enableCache | false | 启用缓存 | true/false |
| skipDimensions | [] | 跳过的维度数组 | ReviewDimension[] |

### GeneratorConfig (报告生成)

| 参数 | 默认值 | 含义 |
|------|--------|------|
| formats | ['markdown'] | 输出格式 |
| theme | 'light' | 主题 |
| includeCodeSnippets | true | 是否包含代码片段 |

---

## 🔀 关键流程图

### 对抗审查工作流程

```
维度 Agent 审查
    ↓
[发现 issues]
    ↓
对抗 Agent 接收 issues
    ↓
对抗 Agent 独立审查代码
    ↓
对抗 Agent 输出：
├─ 新发现的问题
└─ 对已有问题的判断
    ├─ confirmed        ← 确认无误（保留）
    ├─ disputed         ← 存疑（需证实）
    └─ false_positive   ← 误报（处理）
         ├─ confidence < 0.3  → 直接移除
         └─ confidence ≥ 0.3  → severity 降级
    ↓
IssueCalibrator 校准
    ↓
最终 issues
```

---

## 📊 JSON 解析容错机制

AgentRunner 内置 **5 层** JSON 解析容错：

```
1. 移除 markdown code fence
   ```json ... ``` → 提取内容
   
2. 尝试提取 JSON 数组
   (前文) [ ... ] (后文) → [ ... ]
   
3. 移除 trailing commas
   { a: 1, } → { a: 1 }
   
4. 单引号→双引号替换
   { 'key': 'value' } → { "key": "value" }
   
5. 修复无引号属性名
   { key: value } → { "key": value }

失败降级: 返回空数组 []（不中断流程）
```

---

## 🎪 ReviewSkill 支持的模式

### Skill 参数

```typescript
{
  mode: 'diff'|'file'|'directory',   // 审查模式
  path?: string,                     // 文件/目录路径
  dimensions?: string,               // 维度（逗号分隔）
  formats?: string,                  // 格式（逗号分隔）
  enableAdversary?: boolean,         // 对抗审查开关
  projectRoot?: string,              // 项目根目录
  outputDir?: string                 // 输出目录
}
```

### 支持的审查模式

| 模式 | 输入 | 参数要求 | 场景 |
|------|------|---------|------|
| diff | git diff | - | 审查 PR/MR 变更 |
| file | 单个文件路径 | path | 审查特定文件 |
| directory | 目录路径 | path | 审查整个模块 |

### 输出格式

| 格式 | 文件扩展名 | 特点 | 用途 |
|------|----------|------|------|
| json | .json | SARIF-like 结构 | 程序化处理 |
| markdown | .md | 中文本地化 | 人类阅读 |

---

## 🔌 集成点汇总

### 前置集成（输入）
- ✅ Git Diff 集成（自动采集）
- ✅ 文件系统集成（支持 glob）
- ✅ 上下文自动发现（import/require 追踪）

### 后置集成（输出）
- ✅ JSON 报告（SARIF-like）
- ✅ Markdown 报告（本地化）
- ✅ 文件写入（带时间戳）
- 🔄 GitHub PR 集成（可扩展）
- 🔄 GitLab MR 集成（可扩展）
- 🔄 Slack 通知（可扩展）

---

## ⚡ 性能指标

| 项目 | 默认值 | 建议范围 | 备注 |
|------|--------|---------|------|
| 单 Agent 超时 | 5 分钟 | 3-10 分钟 | 超时自动降级 |
| 总超时 | 10 分钟 | 10-30 分钟 | 包含所有阶段 |
| 最大并行 | 5 | 3-8 | 受 API 频率限制 |
| 置信度过滤 | 0.3 | 0.2-0.5 | 低于此值的误报移除 |

---

## 🚨 错误处理策略

| 错误类型 | 处理方式 | 流程继续 |
|---------|--------|--------|
| Agent 超时 | 标记 incomplete，返回 success:false | ✅ 继续 |
| API 调用失败 | 返回 success:false，保留已有结果 | ✅ 继续 |
| JSON 解析失败 | 返回空数组 [] | ✅ 继续 |
| 数据验证失败 | 过滤无效 issue，保留有效的 | ✅ 继续 |
| 整体编排失败 | 抛出异常，中止流程 | ❌ 中止 |

---

## 📚 文档导航

| 文档 | 路径 | 用途 |
|------|------|------|
| 完整架构 | PROJECT_EXPLORATION_DETAILED.md | 详细设计说明 |
| 快速导航 | QUICK_NAVIGATION.md | Q&A 和示例 |
| 本文档 | SUMMARY_TABLE.md | 速查表 |
| 项目说明 | README.md | 项目概述 |

---

## 🎓 快速学习路径

### 初级理解（15 分钟）
1. 阅读本文档的"系统架构概览"和"5阶段流程"
2. 查看 `ReviewRequest` 和 `ReviewReport` 的数据结构
3. 理解 5 个审查维度

### 中级掌握（1 小时）
1. 阅读 `QUICK_NAVIGATION.md` 的常见问题部分
2. 学习如何构建 ReviewRequest
3. 理解对抗审查的工作流程

### 高级应用（2-3 小时）
1. 阅读 `PROJECT_EXPLORATION_DETAILED.md` 的完整内容
2. 研究关键类的实现（AgentRunner、ReviewOrchestrator）
3. 尝试扩展（如添加新维度）

---

## 💬 常见命令速查

```bash
# 编译
npm run build && npm run typecheck

# 快速测试
npm run test

# 开发模式
npm run test:watch

# 覆盖率分析
npm run test:coverage

# 清理
npm run clean
```

---

## 🔗 关键代码位置速查

| 功能 | 文件 | 行数 |
|------|------|------|
| Agent 基础类 | src/agents/agent-runner.ts | 1-263 |
| 主编排器 | src/orchestrator/orchestrator.ts | 1-352 |
| 对抗 Agent | src/agents/adversary-agent.ts | 1-150+ |
| 问题校准 | src/agents/issue-calibrator.ts | 1-150+ |
| 并行调度 | src/orchestrator/parallel-scheduler.ts | 1-100+ |
| 结果合并 | src/orchestrator/result-merger.ts | 1-150+ |
| JSON 报告 | src/output/json-reporter.ts | 1-128 |
| Markdown 报告 | src/output/markdown-reporter.ts | 1-187 |

---

**最后更新**: 2026-04-15  
**完整性**: 100% ✅

