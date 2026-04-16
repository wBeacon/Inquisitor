# Inquisitor 项目结构完整分析

## 1. 项目概况
- **名称**: Inquisitor（高强度代码审查工具）
- **主语言**: TypeScript
- **代码行数**: ~5050 行
- **主要框架**: Claude API 3.5 Sonnet/Opus

## 2. 核心架构

### 2.1 项目文件树
```
src/
├── agents/              # Agent 实现层（6个维度Agent + 对抗Agent）
│   ├── logic-agent.ts
│   ├── security-agent.ts
│   ├── performance-agent.ts
│   ├── maintainability-agent.ts
│   ├── edge-case-agent.ts
│   ├── adversary-agent.ts       # 二次审查Agent
│   ├── issue-calibrator.ts       # 结果校准器
│   ├── agent-runner.ts           # Agent执行基础类
│   ├── prompts/                  # Prompt模板
│   └── index.ts
│
├── orchestrator/        # 流程编排层
│   ├── orchestrator.ts             # ⭐ 主编排器（新实现）
│   ├── review-orchestrator.ts       # 🗑️ 旧编排器（死代码）
│   ├── config.ts                   # 编排器配置模块
│   ├── parallel-scheduler.ts       # 并行任务调度器
│   ├── result-merger.ts            # 结果合并去重器
│   └── index.ts
│
├── input/               # 输入采集层
│   ├── file-collector.ts
│   ├── git-diff-collector.ts
│   ├── context-enricher.ts
│   └── index.ts
│
├── output/              # 报告生成层
│   ├── report-generator.ts         # ⭐ 报告生成器
│   ├── json-reporter.ts
│   ├── markdown-reporter.ts
│   ├── summary-generator.ts
│   └── index.ts
│
├── skill/               # Skill接口层
│   ├── review-skill.ts             # ⭐ Claude Code Skill实现
│   ├── review-command.ts
│   ├── config-loader.ts            # 项目配置加载器
│   ├── progress-reporter.ts
│   └── index.ts
│
├── types/               # 类型定义
│   ├── review.ts                   # 审查相关类型（⭐⭐⭐ 核心）
│   ├── agent.ts                    # Agent接口类型
│   └── index.ts
│
└── index.ts             # 主导出
```

## 3. 核心模块详解

### 3.1 类型系统（src/types/review.ts）
```typescript
// 审查维度枚举（5个）
enum ReviewDimension {
  Logic = 'logic'              // 逻辑正确性
  Security = 'security'        // 安全性
  Performance = 'performance'  // 性能
  Maintainability = 'maintainability'  // 可维护性
  EdgeCases = 'edge_cases'     // 边界情况
}

// 严重等级（4级）
type Severity = 'critical' | 'high' | 'medium' | 'low'

// 核心接口
- ReviewIssue      # 单个问题
- ReviewRequest    # 审查请求
- ReviewReport     # 审查报告
- ReviewSummary    # 统计摘要
- TokenUsage       # Token消耗
```

### 3.2 编排器层（src/orchestrator/）

#### 主编排器（orchestrator.ts）- ⭐ 当前实现
**特点**:
- 完整的5阶段流程：输入→维度审查→对抗审查→校准→报告
- 阶段级别的耗时跟踪（StageTimings）
- Per-agent token使用统计
- 支持维度跳过（skipDimensions）
- 失败维度标记（incompleteDimensions）
- 使用 ParallelScheduler 进行任务调度
- 使用 ResultMerger 进行结果合并

**配置参数**:
```typescript
interface OrchestratorConfig {
  model?: string                    // 默认: 'claude-opus'
  maxParallel?: number              // 默认: 5
  agentTimeout?: number             // 默认: 300000ms (5分钟)
  totalTimeout?: number             // 默认: 600000ms (10分钟)
  enableAdversary?: boolean         // 默认: true
  enableCache?: boolean             // 默认: false
  skipDimensions?: ReviewDimension[] // 默认: []
}
```

#### 旧编排器（review-orchestrator.ts）- 🗑️ 死代码
- 使用基础的 Promise.all() 实现
- 没有阶段级别耗时跟踪
- 缺少 ParallelScheduler
- 不支持 skipDimensions
- **当前未被使用，应删除**

#### 并行调度器（parallel-scheduler.ts）
- 支持并发限制（maxParallel）
- 支持单任务超时（taskTimeout）
- 失败/超时不阻塞整体流程
- 批次执行模式

#### 结果合并器（result-merger.ts）
- 去重（基于文件/行号/维度/严重级别）
- Token使用聚合
- 按严重程度和置信度排序
- 与IssueCalibrator配合进行置信度调整

### 3.3 Skill 层（src/skill/review-skill.ts）

**职责**:
- 作为 Claude Code Skill 的入口
- 接收用户参数
- 调用编排器执行审查
- 生成输出报告

**支持的模式**:
- `diff`: 基于 git diff
- `file`: 单文件
- `directory`: 目录审查

**配置加载器**（config-loader.ts）:
- 从 `.inquisitor.json` 加载项目级配置
- 支持参数：
  - `ignore`: 文件忽略模式（glob）
  - `rules`: 自定义规则
  - `severityThreshold`: 严重程度阈值 ⚠️（定义但未使用）
  - `dimensions`: 启用的审查维度
  - `formats`: 输出格式

### 3.4 报告生成（src/output/report-generator.ts）

**功能**:
- 生成 JSON 格式报告
- 生成 Markdown 格式报告
- 分别为程序化消费和人类阅读优化
- 包含执行摘要、统计数据、问题详情、元数据

**配置**:
```typescript
interface GeneratorConfig {
  formats?: Array<'json' | 'markdown'>
  theme?: 'dark' | 'light'
  templates?: {
    jsonIndent?: number
    markdownTitle?: string
    markdownTemplate?: string
  }
  includeCodeSnippets?: boolean
}
```

## 4. 关键发现

### 4.1 死代码
- **src/orchestrator/review-orchestrator.ts**
  - 完整的第二个 ReviewOrchestrator 实现
  - 功能较简单，缺乏现代特性
  - 非导出代码（不在 index.ts 中）
  - **技术风险**: 维护困惑、误用风险

### 4.2 配置相关

#### severityThreshold 的状态
- **定义**: src/skill/config-loader.ts 中定义为 `InquisitorConfig.severityThreshold?: string`
- **使用**: 仅在文档示例中出现，**实际代码中未使用**
- **位置**: config-loader.ts L20, L73-75
- **测试覆盖**: 有基础测试，但不完整

#### dimensions 使用情况
```typescript
// 在 config-loader.ts 中定义和加载
dimensions?: string[]

// 在 review-skill.ts 中使用
const dimensions = params.dimensions
  ? (params.dimensions.split(',').map((d) => d.trim()) as ReviewDimension[])
  : undefined
```

#### formats 使用情况
```typescript
// 定义在 GeneratorConfig 中
formats?: Array<'json' | 'markdown'>

// 实际使用在 report-generator.ts L292
const formats = this.config.formats
```

### 4.3 Token 使用统计

新旧编排器的差异：
- **新（orchestrator.ts）**: 
  - Per-agent token 统计（agentTokenUsage）
  - 总 token 使用
- **旧（review-orchestrator.ts）**: 
  - 仅总 token 使用

### 4.4 错误处理

新编排器特点：
- 每个阶段都有错误捕获
- 失败的维度被标记为 incomplete
- 但整体不抛出异常

## 5. 测试结构

### 测试目录树
```
__tests__/
├── orchestrator/
│   ├── config.test.ts              # 配置模块测试（✅ 完整）
│   ├── parallel-scheduler.test.ts  # 调度器测试
│   ├── result-merger.test.ts       # 合并器测试
│   └── review-orchestrator.test.ts # 编排器测试
├── agents/
│   ├── dimension-agents.test.ts
│   ├── adversary-agent.test.ts
│   └── issue-calibrator.test.ts
├── output/
│   ├── report-generator.test.ts    # 报告生成测试
│   ├── feature6-reporters.test.ts  # 扩展报告测试
│   └── ...
├── skill/
│   ├── config-loader.test.ts       # 配置加载测试
│   ├── review-skill.test.ts        # Skill集成测试
│   └── ...
└── input/
    └── ...
```

## 6. 关键引用分析

### severityThreshold 引用
- config-loader.ts: 定义和解析
- 测试文件中有验证
- **未在任何地方被消费/应用** ⚠️

### review-orchestrator 引用
- orchestrator/index.ts: 不导出
- src/index.ts: 不导出
- 完全隔离的死代码

### config.dimensions 使用
- review-skill.ts: 参数解析
- 转换为 ReviewDimension[] 传给编排器

### config.formats 使用
- review-skill.ts: 参数解析
- report-generator.ts: 决定输出格式

## 7. 编排流程

```
ReviewRequest
    ↓
┌───────────────────────────────────────────┐
│ Stage 1: Input Collection                  │
│ - Collect files                            │
│ - Build context string                     │
└────────────────────┬──────────────────────┘
                     ↓
┌───────────────────────────────────────────┐
│ Stage 2: Parallel Dimension Review         │
│ - Logic, Security, Performance,            │
│   Maintainability, EdgeCases               │
│ - Using ParallelScheduler (maxParallel=5) │
└────────────────────┬──────────────────────┘
                     ↓
┌───────────────────────────────────────────┐
│ Stage 3: Adversary Review (Optional)       │
│ - Challenge existing findings              │
│ - Identify false positives                 │
└────────────────────┬──────────────────────┘
                     ↓
┌───────────────────────────────────────────┐
│ Stage 4: Calibration & Merging             │
│ - Dedup issues                             │
│ - Adjust confidence scores                 │
│ - Sort by severity                         │
└────────────────────┬──────────────────────┘
                     ↓
┌───────────────────────────────────────────┐
│ Stage 5: Report Generation                 │
│ - Build summary statistics                 │
│ - Generate metadata                        │
│ - Return ReviewReport                      │
└────────────────────┬──────────────────────┘
                     ↓
                ReviewReport
```

## 8. 技术债和风险

| 项目 | 优先级 | 描述 | 位置 |
|------|--------|------|------|
| 删除死代码 | 高 | review-orchestrator.ts 完全未使用 | src/orchestrator/ |
| severityThreshold 实现 | 中 | 已定义但未使用 | src/skill/config-loader.ts |
| 边界情况处理 | 中 | 某些边界情况缺乏测试 | 各模块 |
| 文档更新 | 低 | review-orchestrator 引用还在文档中 | docs/ |

