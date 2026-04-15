# Inquisitor 项目 - 详细探索报告

**生成日期**: 2026-04-15  
**项目**: 高强度代码审查工具 - 以对抗式 Agent 模式深度审查代码质量

---

## 1. 项目整体架构

### 1.1 项目目录结构

```
Inquisitor/
├── src/
│   ├── types/                      # 核心类型定义
│   │   ├── review.ts              # 审查相关类型 (ReviewRequest, ReviewIssue, ReviewReport)
│   │   ├── agent.ts               # Agent 相关类型 (AgentConfig, AgentResult, etc.)
│   │   └── index.ts               # 类型导出入口
│   │
│   ├── agents/                     # 维度审查 Agent 实现
│   │   ├── agent-runner.ts        # Agent 基础类（包含 Claude API 调用、JSON 解析）
│   │   ├── logic-agent.ts         # 逻辑正确性审查 Agent
│   │   ├── security-agent.ts      # 安全性审查 Agent
│   │   ├── performance-agent.ts   # 性能审查 Agent
│   │   ├── maintainability-agent.ts   # 可维护性审查 Agent
│   │   ├── edge-case-agent.ts     # 边界情况审查 Agent
│   │   ├── adversary-agent.ts     # 对抗审查 Agent
│   │   ├── issue-calibrator.ts    # 问题校准器（处理对抗结果）
│   │   ├── prompts/               # Agent 的系统提示词
│   │   │   ├── adversary-prompt.ts
│   │   │   └── index.ts
│   │   └── index.ts               # Agent 模块导出
│   │
│   ├── orchestrator/               # 审查流程编排器
│   │   ├── orchestrator.ts        # 主编排器（5 个阶段流程）
│   │   ├── config.ts              # 配置管理和解析
│   │   ├── parallel-scheduler.ts  # 并行任务调度器
│   │   ├── result-merger.ts       # 结果合并去重
│   │   └── index.ts               # 编排器模块导出
│   │
│   ├── input/                      # 输入采集层
│   │   ├── git-diff-collector.ts  # Git Diff 采集
│   │   ├── file-collector.ts      # 文件系统采集
│   │   ├── context-enricher.ts    # 上下文自动发现
│   │   └── index.ts               # 输入模块导出
│   │
│   ├── output/                     # 输出报告生成
│   │   ├── json-reporter.ts       # JSON 格式报告（SARIF-like）
│   │   ├── markdown-reporter.ts   # Markdown 格式报告
│   │   ├── report-generator.ts    # 兼容接口的报告生成器
│   │   ├── summary-generator.ts   # 统计摘要生成
│   │   └── index.ts               # 输出模块导出
│   │
│   ├── skill/                      # Claude Code Skill 集成
│   │   ├── review-skill.ts        # 代码审查 Skill 主类
│   │   └── index.ts               # Skill 模块导出
│   │
│   └── index.ts                   # 项目入口（暂为空）
│
├── __tests__/                      # 测试文件
├── package.json                    # 项目配置和依赖
├── tsconfig.json                   # TypeScript 配置
├── jest.config.js                  # Jest 测试配置
└── README.md                        # 项目说明

```

### 1.2 核心依赖

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.89.0",    // Claude API 调用
    "glob": "^13.0.6"                  // 文件匹配
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "@types/node": "^20.11.0",
    "@types/jest": "^29.5.11"
  }
}
```

### 1.3 执行脚本

```bash
npm run typecheck    # TypeScript 类型检查
npm run build        # 编译 TypeScript 到 dist/
npm run lint         # ESLint 代码检查
npm run clean        # 清除 dist/ 目录
npm run test         # 运行单元测试
npm run test:watch   # 监听模式测试
npm run test:coverage # 覆盖率测试
```

---

## 2. 核心类型定义详解

### 2.1 ReviewRequest - 审查请求

```typescript
interface ReviewRequest {
  files: FileToReview[];           // 待审查的文件列表
  diff?: string;                   // 整体 diff 内容
  context: ContextConfig;          // 上下文配置
  dimensions?: ReviewDimension[];  // 指定审查维度（空则审查所有）
  mode: 'review' | 'review-fix';   // 审查模式
  maxIterations?: number;          // 最大审查轮次
}

interface FileToReview {
  path: string;                    // 文件路径
  content?: string;                // 文件完整内容
  diff?: string;                   // 文件的 diff 内容
  language?: string;               // 文件语言标识
}

interface ContextConfig {
  contextLines: number;            // diff 前后的上下文行数
  includeFullFile: boolean;        // 是否包含完整文件内容
  includeDependencies: boolean;    // 是否包含依赖文件
  projectRoot: string;             // 项目根目录
}
```

### 2.2 ReviewIssue - 审查问题

```typescript
interface ReviewIssue {
  file: string;                    // 问题所在文件
  line: number;                    // 行号
  endLine?: number;                // 结束行号（范围）
  severity: 'critical'|'high'|'medium'|'low';  // 严重程度
  dimension: ReviewDimension;      // 审查维度
  description: string;             // 问题描述
  suggestion: string;              // 修复建议
  confidence: number;              // 置信度 (0-1)
  foundBy?: string;                // 发现者 Agent ID
  codeSnippet?: string;            // 相关代码片段
  adversaryVerdict?: 'confirmed'|'disputed'|'false_positive';  // 对抗判定
}

enum ReviewDimension {
  Logic = 'logic',                 // 逻辑正确性
  Security = 'security',           // 安全性
  Performance = 'performance',     // 性能
  Maintainability = 'maintainability',  // 可维护性
  EdgeCases = 'edge_cases',        // 边界情况
}
```

### 2.3 ReviewReport - 审查报告

```typescript
interface ReviewReport {
  issues: ReviewIssue[];           // 所有发现的问题
  summary: ReviewSummary;          // 统计摘要
  metadata: ReviewMetadata;        // 审查元数据
}

interface ReviewSummary {
  bySeverity: SeverityCount;       // 按严重程度统计
  byDimension: Record<ReviewDimension, number>;  // 按维度统计
  totalIssues: number;             // 问题总数
}

interface ReviewMetadata {
  durationMs: number;              // 审查耗时（毫秒）
  tokenUsage: TokenUsage;          // Token 消耗
  startedAt: string;               // 开始时间 (ISO 8601)
  completedAt: string;             // 完成时间 (ISO 8601)
  agents: string[];                // 参与的 Agent 列表
}

interface TokenUsage {
  input: number;                   // 输入 token 数
  output: number;                  // 输出 token 数
  total: number;                   // 总计 token 数
}
```

### 2.4 Agent 相关类型

```typescript
interface AgentConfig {
  id: string;                      // Agent 唯一 ID
  name: string;                    // Agent 名称
  description: string;             // Agent 描述
  dimension?: ReviewDimension;     // 审查维度
  systemPrompt: string;            // 系统提示词
  model?: string;                  // 模型选择
  maxTokens?: number;              // 最大输出 token
  temperature?: number;            // 温度参数
}

interface AgentResult {
  agentId: string;                 // Agent ID
  issues: ReviewIssue[];           // 发现的问题
  durationMs: number;              // 执行耗时
  tokenUsage: TokenUsage;          // Token 消耗
  success: boolean;                // 是否成功
  error?: string;                  // 错误信息
}

interface AdversaryResult extends AgentResult {
  falsePositives: number[];        // 误报问题的索引
  confidenceAdjustments: Array<{
    issueIndex: number;
    newConfidence: number;
    reason: string;
  }>;
}
```

---

## 3. Orchestrator 编排器实现

### 3.1 ReviewOrchestrator 工作流程

**5 个执行阶段**：

1. **输入准备 (Input Preparation)**
   - 收集待审查文件列表
   - 构建审查上下文（文件内容、diff 等）

2. **并行维度审查 (Dimension Review)**
   - 并行执行 5 个维度 Agent
   - 支持超时保护和失败降级
   - 支持跳过指定维度

3. **对抗审查 (Adversary Review)**
   - 执行对抗 Agent，审视已有结果
   - 寻找遗漏的问题
   - 标记误报问题

4. **结果校准 (Calibration)**
   - 应用置信度调整
   - 处理误报问题
   - 合并去重
   - 排序最终结果

5. **报告生成 (Report Generation)**
   - 统计摘要计算
   - 元数据收集
   - 输出最终报告

### 3.2 核心代码片段

**主执行流程** (`src/orchestrator/orchestrator.ts`):

```typescript
async run(request: ReviewRequest): Promise<ReviewReport> {
  // 阶段 1: 输入采集
  const { files, contextString } = await this.prepareReviewContext(request);

  // 阶段 2: 并行维度审查
  await this.executeDimensionAgents(files, contextString, request, context);

  // 阶段 3: 对抗审查
  if (this.config.enableAdversary) {
    await this.executeAdversaryReview(files, contextString, context);
  }

  // 阶段 4: 结果校准
  const finalIssues = await this.calibrateResults(context);

  // 阶段 5: 生成报告
  const report = this.generateReport(finalIssues, context);

  return report;
}
```

### 3.3 编排器配置

**OrchestratorConfig 接口**:

```typescript
interface OrchestratorConfig {
  model?: string;                  // AI 模型（默认: claude-opus）
  maxParallel?: number;            // 最大并行 Agent 数（默认: 5）
  agentTimeout?: number;           // 单 Agent 超时（默认: 300000ms = 5分钟）
  totalTimeout?: number;           // 总超时（默认: 600000ms = 10分钟）
  enableAdversary?: boolean;       // 启用对抗审查（默认: true）
  enableCache?: boolean;           // 启用缓存（默认: false）
  skipDimensions?: ReviewDimension[];  // 跳过的维度（默认: []）
}
```

**默认值常量** (`src/orchestrator/config.ts`):

```typescript
DEFAULT_MODEL = 'claude-opus'
DEFAULT_MAX_PARALLEL = 5
DEFAULT_AGENT_TIMEOUT = 300000        // 5 分钟
DEFAULT_TOTAL_TIMEOUT = 600000        // 10 分钟
DEFAULT_ENABLE_ADVERSARY = true
DEFAULT_ENABLE_CACHE = false
DEFAULT_SKIP_DIMENSIONS = []
```

---

## 4. Agent 系统详解

### 4.1 Agent 基础类 (AgentRunner)

**职责**:
- Claude API 调用接口
- JSON 响应解析（支持错误恢复）
- Token 使用统计
- 超时控制
- Issue 验证和修正

**关键方法**:

```typescript
abstract class AgentRunner {
  // 执行审查
  async review(files: string[], context: string): Promise<AgentResult>
  
  // 调用 Claude API（每次创建新的独立客户端实例）
  protected async callClaudeAPI(userMessage: string): Promise<string>
  
  // 健壮的 JSON 解析（处理 markdown fence、trailing comma 等）
  protected parseJsonResponse(rawText: string): ReviewIssue[]
  
  // 验证和修正 Issue 数据
  protected validateAndFixIssues(rawIssues: unknown[]): ReviewIssue[]
}
```

**JSON 解析容错机制**:
1. 移除 markdown code fence (```json ... ```)
2. 尝试提取 JSON 数组（处理前后多余文本）
3. 移除 trailing commas (,])
4. 尝试单引号→双引号替换
5. 修复无引号的属性名

**Issue 验证逻辑**:
- 检查必填字段完整性 (file, line, description, suggestion)
- 限制 severity 在有效值范围
- 强制修正 dimension 为 Agent 负责的维度
- 限制 confidence 在 [0, 1] 范围
- 过滤掉无效的 Issue

### 4.2 五个维度 Agent

| Agent | 维度 | 职责 | 示例问题 |
|-------|------|------|--------|
| LogicAgent | Logic | 逻辑正确性 | 控制流错误、空值处理、类型匹配 |
| SecurityAgent | Security | 安全性 | 注入漏洞、认证绕过、敏感数据泄露 |
| PerformanceAgent | Performance | 性能 | 时间复杂度、资源泄露、不必要计算 |
| MaintainabilityAgent | Maintainability | 可维护性 | 代码重复、耦合度、命名规范 |
| EdgeCaseAgent | EdgeCases | 边界情况 | 空值处理、溢出、并发问题、异常路径 |

**所有维度 Agent 继承 AgentRunner，遵循相同的实现模式**。

### 4.3 对抗审查 Agent (AdversaryAgent)

**特殊设计**:
- 完全独立上下文（与其他 Agent 无共享状态）
- 更高的 temperature (0.7) 鼓励创意思考
- 审视已有问题，寻找遗漏和误报
- 生成新问题同时评估现有问题

**输出格式**:

```typescript
interface AdversaryReviewResponse {
  newIssues: ReviewIssue[];        // 新发现的问题
  issueJudgments: IssueJudgment[];  // 对已有问题的判断
}

interface IssueJudgment {
  existingIssueIndex: number;
  judgment: 'confirmed'|'disputed'|'false_positive';
  reason: string;
  suggestedConfidenceAdjustment?: number;
  suggestedSeverityAdjustment?: string;
}
```

### 4.4 问题校准器 (IssueCalibrator)

**校准流程**:

1. 应用置信度调整
2. 处理 false_positive 问题：
   - 置信度 < 0.3：直接移除
   - 其他情况：severity 降一级
3. 过滤低置信度问题 (< 0.3)
4. 添加对抗 Agent 发现的新问题
5. 合并重复问题（相同 file:line:dimension:severity）
6. 最终排序（critical > high > medium > low）

---

## 5. 并行执行和调度

### 5.1 ParallelScheduler

**功能**:
- 并行执行多个独立任务
- 统一超时管理
- 错误隔离和捕获

**配置**:

```typescript
interface ParallelSchedulerConfig {
  maxParallel: number;             // 最大并行数
  taskTimeout: number;             // 单任务超时（毫秒）
}

interface ScheduledTask<T> {
  id: string;                      // 任务 ID
  execute: () => Promise<T>;       // 执行函数
}
```

**用法**:

```typescript
const scheduler = new ParallelScheduler({
  maxParallel: 5,
  taskTimeout: 300000,
});

const results = await scheduler.executeAll(tasks);
```

### 5.2 ResultMerger

**功能**:
- 去重（基于 file:line:dimension:severity key）
- 排序（按 severity 和 confidence）
- Token 使用统计聚合
- 置信度调整应用

**典型操作**:

```typescript
const merger = new ResultMerger();

// 收集所有 issues
const allIssues = merger.collectIssues(agentResults);

// 去重
const dedupIssues = merger.dedup(allIssues);

// 排序
const sortedIssues = merger.sort(dedupIssues);

// 聚合 token 使用
const tokenUsage = merger.aggregateTokenUsage(agentResults);
```

---

## 6. 输入采集层

### 6.1 GitDiffCollector

**职责**: 解析 git diff，提取变更文件和上下文

```typescript
interface DiffHunk {
  file: string;
  fromLine: number;
  toLine: number;
  lines: DiffLine[];
}

interface DiffLine {
  type: 'add'|'remove'|'context';
  content: string;
  lineNumber: number;
}

class GitDiffCollector {
  async collect(ref?: string): Promise<FileToReview[]>
}
```

### 6.2 FileCollector

**职责**: 读取文件系统中的代码文件

```typescript
class FileCollector {
  async collect(pathOrPattern: string): Promise<FileToReview[]>
  // 支持单文件、目录、glob 模式
}
```

### 6.3 ContextEnricher

**职责**: 自动发现依赖文件作为审查上下文

```typescript
class ContextEnricher {
  async enrich(files: FileToReview[]): Promise<FileToReview[]>
  // 根据 import/require 自动添加相关文件
}
```

---

## 7. 输出报告生成

### 7.1 JsonReporter - JSON 格式报告

**输出格式** (类 SARIF):

```typescript
interface JsonReportOutput {
  $schema: string;                 // Schema URI
  version: string;                 // 报告版本
  tool: {
    name: string;                  // "Inquisitor"
    version: string;               // "1.0.0"
  };
  issues: JsonReportIssue[];       // 问题列表
  summary: ReviewSummary;          // 统计摘要
  metadata: ReviewMetadata;        // 审查元数据
}
```

**使用**:

```typescript
// 从完整报告生成
const json = JsonReporter.generate(report, indent);

// 从 issues 数组生成
const json = JsonReporter.generateFromIssues(issues, metadata, indent);
```

### 7.2 MarkdownReporter - Markdown 格式报告

**生成结构**:
1. 标题
2. 概要统计（severity 分布、dimension 分布）
3. 问题详情（按 severity 分组）
4. 元数据（耗时、token、时间戳、Agent 列表）

**中文本地化**:
- Severity 标签: 严重、高、中、低
- Dimension 标签: 逻辑正确性、安全性、性能、可维护性、边界情况
- Verdict 标签: 已确认、存疑、误报

**使用**:

```typescript
const markdown = MarkdownReporter.generate(report);
```

### 7.3 ReportGenerator - 兼容接口生成器

**功能**:
- 支持多种输出格式 (json, markdown, both)
- 自定义模板和主题
- 写入文件（支持时间戳）

**配置**:

```typescript
interface GeneratorConfig {
  formats?: Array<'json'|'markdown'>;
  theme?: 'dark'|'light';
  templates?: {
    jsonIndent?: number;
    markdownTitle?: string;
    markdownTemplate?: string;
  };
  includeCodeSnippets?: boolean;
}
```

**使用**:

```typescript
const generator = new ReportGenerator({
  formats: ['json', 'markdown'],
  includeCodeSnippets: true
});

// 生成 JSON
const json = generator.toJSON(report);

// 生成 Markdown
const md = generator.toMarkdown(report);

// 写入文件
await generator.toFile(report, './reports', 'review');
```

### 7.4 SummaryGenerator - 统计摘要生成

```typescript
class SummaryGenerator {
  static generate(issues: ReviewIssue[]): ReviewSummary
}

// 生成摘要统计：
// - 按 severity 分组计数
// - 按 dimension 分组计数
// - 总数统计
```

---

## 8. Claude Code Skill 集成

### 8.1 ReviewSkill 类

**职责**: 将审查引擎封装为可调用的 Skill

**参数接口**:

```typescript
interface SkillParams {
  mode: 'diff'|'file'|'directory';  // 审查模式
  path?: string;                    // 文件或目录路径
  dimensions?: string;              // 指定维度（逗号分隔）
  formats?: string;                 // 输出格式（逗号分隔）
  enableAdversary?: boolean;        // 启用对抗审查
  projectRoot?: string;             // 项目根目录
  outputDir?: string;               // 输出目录
}

interface SkillResult {
  success: boolean;
  report?: ReviewReport;
  message: string;
  error?: string;
  reportFiles?: string[];
}
```

**执行流程**:

```typescript
// 验证参数
validateParams(params)

// 构建审查请求
const request = await buildReviewRequest(params)

// 执行审查
const report = await orchestrator.run(request)

// 生成报告
const reportFiles = await generateReports(report, outputDir, formats)

// 返回结果
return { success: true, report, reportFiles }
```

**支持的操作模式**:

| 模式 | 说明 | 参数要求 |
|------|------|--------|
| diff | 审查 git diff | 无需 path |
| file | 审查单个文件 | 需要 path |
| directory | 审查整个目录 | 需要 path |

### 8.2 Skill 帮助信息

```
/review [模式] [选项]

模式:
  - diff (默认)      审查 git diff
  - file             审查单个文件
  - directory        审查整个目录

选项:
  --path             文件或目录路径 (file/directory 模式必需)
  --dimensions       审查维度 (逗号分隔)
  --formats          输出格式 (逗号分隔，默认: markdown)
  --enable-adversary 启用对抗审查 (默认: true)
  --project-root     项目根目录 (默认: ./)
  --output-dir       输出目录

示例:
  /review diff
  /review file --path src/app.ts
  /review directory --path src --dimensions security
  /review diff --formats json,markdown --output-dir ./reports
```

---

## 9. 配置加载机制

### 9.1 配置解析流程

**resolveConfig 函数** (`src/orchestrator/config.ts`):

```typescript
function resolveConfig(config?: OrchestratorConfig): ResolvedOrchestratorConfig {
  return {
    model: config?.model ?? DEFAULT_MODEL,
    maxParallel: config?.maxParallel ?? DEFAULT_MAX_PARALLEL,
    agentTimeout: config?.agentTimeout ?? DEFAULT_AGENT_TIMEOUT,
    totalTimeout: config?.totalTimeout ?? DEFAULT_TOTAL_TIMEOUT,
    enableAdversary: config?.enableAdversary ?? DEFAULT_ENABLE_ADVERSARY,
    enableCache: config?.enableCache ?? DEFAULT_ENABLE_CACHE,
    skipDimensions: config?.skipDimensions ?? [...DEFAULT_SKIP_DIMENSIONS],
  };
}
```

### 9.2 配置优先级

1. 用户传入的配置值（最高优先级）
2. 默认常量值（最低优先级）

### 9.3 是否有 .inquisitor.json

**当前状态**: 暂无

项目目前不存在 `.inquisitor.json` 配置文件。配置通过 `OrchestratorConfig` 接口以编程方式传入。

**未来可增强**:
- 支持从 `.inquisitor.json` 文件加载配置
- 支持环境变量覆盖
- 支持 CLI 参数传递

---

## 10. 项目入口和导出

### 10.1 主要导出模块

```typescript
// types/index.ts - 类型导出
export * from './review';
export * from './agent';

// agents/index.ts - Agent 系统导出
export { AgentRunner } from './agent-runner';
export { LogicAgent } from './logic-agent';
export { SecurityAgent } from './security-agent';
export { PerformanceAgent } from './performance-agent';
export { MaintainabilityAgent } from './maintainability-agent';
export { EdgeCaseAgent } from './edge-case-agent';
export { AdversaryAgent } from './adversary-agent';
export { IssueCalibrator } from './issue-calibrator';

// orchestrator/index.ts - 编排器导出
export { ReviewOrchestrator } from './orchestrator';
export { OrchestratorConfig, resolveConfig } from './config';
export { ParallelScheduler } from './parallel-scheduler';
export { ResultMerger } from './result-merger';

// output/index.ts - 输出报告导出
export { JsonReporter } from './json-reporter';
export { MarkdownReporter } from './markdown-reporter';
export { SummaryGenerator } from './summary-generator';
export { ReportGenerator } from './report-generator';

// input/index.ts - 输入采集导出
export { GitDiffCollector } from './git-diff-collector';
export { FileCollector } from './file-collector';
export { ContextEnricher } from './context-enricher';

// skill/index.ts - Skill 导出
export { ReviewSkill } from './review-skill';
```

### 10.2 典型使用流程

```typescript
import {
  ReviewOrchestrator,
  ReviewRequest,
  ReviewDimension,
  JsonReporter,
  MarkdownReporter,
  GitDiffCollector,
  FileCollector,
} from 'inquisitor';

// 1. 收集输入
const gitCollector = new GitDiffCollector();
const files = await gitCollector.collect();

// 2. 构建审查请求
const request: ReviewRequest = {
  files,
  context: {
    contextLines: 50,
    includeFullFile: true,
    includeDependencies: true,
    projectRoot: './',
  },
  dimensions: [ReviewDimension.Security, ReviewDimension.Logic],
  mode: 'review',
};

// 3. 执行审查
const orchestrator = new ReviewOrchestrator({
  enableAdversary: true,
  maxParallel: 5,
});
const report = await orchestrator.run(request);

// 4. 生成报告
const jsonReport = JsonReporter.generate(report);
const markdownReport = MarkdownReporter.generate(report);

console.log(report.summary);  // 统计摘要
console.log(jsonReport);       // JSON 报告
console.log(markdownReport);   // Markdown 报告
```

---

## 11. Skill 相关的文件

### 11.1 已有的 Skill 文件

**位置**: `src/skill/`

```
src/skill/
├── review-skill.ts    # 代码审查 Skill 主类
└── index.ts          # Skill 模块导出
```

### 11.2 ReviewSkill 的职责

1. **参数验证**: 检查输入参数的合法性
2. **请求构建**: 将 Skill 参数转换为 ReviewRequest
3. **审查执行**: 调用 Orchestrator 执行审查
4. **报告生成**: 生成 JSON 和 Markdown 格式报告
5. **结果返回**: 返回格式化的 SkillResult

### 11.3 Skill 集成方式

ReviewSkill 可以通过以下方式集成到 Claude Code:

```typescript
// 在 Claude Code 环境中注册 Skill
const skill = new ReviewSkill();
const result = await skill.execute({
  mode: 'diff',
  formats: 'markdown,json',
  outputDir: './reports'
});

// 或获取帮助信息
console.log(ReviewSkill.getHelpText());
```

---

## 12. 项目完成度评估

### 12.1 已实现的功能

✅ **核心审查引擎**
- 5 个维度 Agent 完整实现
- 对抗审查 Agent 完整实现
- 问题校准和去重逻辑

✅ **编排系统**
- 5 阶段流程编排
- 并行任务调度
- 超时保护机制

✅ **输入采集**
- Git Diff 采集
- 文件系统采集
- 上下文自动发现

✅ **输出报告**
- JSON 格式报告
- Markdown 格式报告
- 统计摘要生成

✅ **Skill 集成**
- ReviewSkill 主类完整
- 参数验证和请求构建
- 多种审查模式

### 12.2 可能的增强方向

🔄 **配置管理**
- 从 `.inquisitor.json` 加载配置
- 环境变量支持
- CLI 参数传递

🔄 **缓存机制**
- API 响应缓存
- 审查结果缓存
- 加速重复审查

🔄 **更多输出格式**
- HTML 报告
- CSV 导出
- SARIF 标准格式

🔄 **集成增强**
- GitHub PR 评论集成
- GitLab MR 集成
- Slack 通知

---

## 13. 快速参考

### 13.1 常见类的初始化

```typescript
// 编排器
const orchestrator = new ReviewOrchestrator({
  model: 'claude-opus',
  maxParallel: 5,
  agentTimeout: 300000,
  enableAdversary: true,
});

// 单个维度 Agent
const logicAgent = new LogicAgent();
const securityAgent = new SecurityAgent();

// 对抗审查 Agent
const adversaryAgent = new AdversaryAgent();

// 问题校准器
const calibrator = new IssueCalibrator();

// 报告生成器
const jsonReporter = JsonReporter;
const markdownReporter = MarkdownReporter;
const reportGenerator = new ReportGenerator({
  formats: ['json', 'markdown'],
  includeCodeSnippets: true,
});

// 输入采集器
const gitCollector = new GitDiffCollector();
const fileCollector = new FileCollector();

// Skill
const skill = new ReviewSkill();
```

### 13.2 常见错误处理

```typescript
// 超时处理
try {
  const result = await agent.review(files, context);
  if (!result.success) {
    console.error('Agent 失败:', result.error);
  }
} catch (error) {
  console.error('审查超时或异常');
}

// JSON 解析容错
// - AgentRunner 内置健壮的 JSON 解析
// - 自动处理 markdown fence、trailing comma 等

// 低置信度问题过滤
const highConfidenceIssues = issues.filter(i => i.confidence >= 0.5);
```

---

## 14. 项目统计

- **总文件数**: 30+ TypeScript 文件
- **核心类**: 15+
- **类型定义**: 10+
- **Agent 数量**: 6 (5 个维度 + 1 个对抗)
- **处理维度**: 5
- **代码行数**: ~3500 行（不含测试和文档）

---

**探索完成！** 🎉

这份文档提供了 Inquisitor 项目的完整架构和设计概览。

