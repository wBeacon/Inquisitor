# Inquisitor 项目详细探索报告

## 项目概述
**名称**: Inquisitor  
**描述**: 高强度代码审查工具 - 以对抗式 Agent 模式深度审查代码质量  
**版本**: 0.1.0  
**技术栈**: TypeScript, Anthropic SDK, Jest

---

## 1. 项目整体目录结构

```
Inquisitor/
├── src/                          # 源代码目录
│   ├── types/                    # 类型定义
│   │   ├── index.ts             # 统一导出入口
│   │   ├── review.ts            # 审查相关类型
│   │   └── agent.ts             # Agent 相关类型
│   │
│   ├── agents/                  # Agent 实现系统
│   │   ├── agent-runner.ts      # 基础抽象类
│   │   ├── logic-agent.ts       # 逻辑正确性 Agent
│   │   ├── security-agent.ts    # 安全性 Agent
│   │   ├── performance-agent.ts # 性能 Agent
│   │   ├── maintainability-agent.ts # 可维护性 Agent
│   │   ├── edge-case-agent.ts   # 边界情况 Agent
│   │   ├── adversary-agent.ts   # 对抗式审查 Agent
│   │   ├── issue-calibrator.ts  # 问题校准器
│   │   ├── prompts/
│   │   │   └── index.ts         # 所有 Agent 的 prompt 定义
│   │   └── index.ts             # Agent 模块导出
│   │
│   ├── orchestrator/            # 审查流程编排
│   │   ├── review-orchestrator.ts # 主编排器
│   │   └── index.ts             # 导出
│   │
│   ├── input/                   # 输入处理
│   │   ├── file-collector.ts    # 文件收集
│   │   ├── git-diff-collector.ts # Git diff 收集
│   │   ├── context-enricher.ts  # 上下文增强
│   │   └── index.ts             # 导出
│   │
│   ├── output/                  # 输出处理
│   │   ├── report-generator.ts  # 报告生成
│   │   └── index.ts             # 导出
│   │
│   └── skill/                   # 技能模块
│       ├── review-skill.ts      # 审查技能
│       └── index.ts             # 导出
│
├── __tests__/                   # 测试目录
├── dist/                        # 编译输出
├── node_modules/                # 依赖
├── package.json                 # 项目配置
├── tsconfig.json                # TypeScript 配置
└── jest.config.js               # Jest 配置
```

---

## 2. 核心类型定义 (src/types/)

### 2.1 审查维度枚举 (ReviewDimension)

```typescript
enum ReviewDimension {
  Logic = 'logic',           // 逻辑正确性
  Security = 'security',     // 安全性
  Performance = 'performance', // 性能
  Maintainability = 'maintainability', // 可维护性
  EdgeCases = 'edge_cases',  // 边界情况
}
```

### 2.2 问题严重程度 (Severity)

```typescript
type Severity = 'critical' | 'high' | 'medium' | 'low';
```

### 2.3 核心接口

#### ReviewIssue - 单个审查问题
```typescript
interface ReviewIssue {
  file: string;              // 问题所在文件路径
  line: number;              // 问题行号
  endLine?: number;          // 结束行号（可选，用于标记范围）
  severity: Severity;        // 问题严重程度
  dimension: ReviewDimension; // 所属审查维度
  description: string;       // 问题描述
  suggestion: string;        // 修复建议
  confidence: number;        // 置信度 (0-1)
  foundBy?: string;          // 发现该问题的 Agent 标识
  codeSnippet?: string;      // 相关代码片段
}
```

#### ReviewSummary - 统计摘要
```typescript
interface ReviewSummary {
  bySeverity: SeverityCount;  // 按严重程度统计
  byDimension: Record<ReviewDimension, number>; // 按维度统计
  totalIssues: number;        // 问题总数
}
```

#### ReviewReport - 最终审查报告
```typescript
interface ReviewReport {
  issues: ReviewIssue[];      // 所有问题
  summary: ReviewSummary;     // 统计摘要
  metadata: ReviewMetadata;   // 审查元数据
}
```

#### ReviewMetadata - 审查元数据
```typescript
interface ReviewMetadata {
  durationMs: number;         // 审查总耗时（毫秒）
  tokenUsage: TokenUsage;     // Token 消耗统计
  startedAt: string;          // 审查开始时间
  completedAt: string;        // 审查结束时间
  agents: string[];           // 参与审查的 Agent 列表
}
```

#### TokenUsage - Token 消耗
```typescript
interface TokenUsage {
  input: number;              // 输入 token 数量
  output: number;             // 输出 token 数量
  total: number;              // 总 token 数量
}
```

#### ReviewRequest - 审查请求
```typescript
interface ReviewRequest {
  files: FileToReview[];      // 待审查的文件列表
  diff?: string;              // diff 内容
  context: ContextConfig;     // 上下文配置
  dimensions?: ReviewDimension[]; // 指定审查维度（空则审查所有）
  mode: 'review' | 'review-fix'; // 审查模式
  maxIterations?: number;     // 最大审查轮次
}
```

### 2.4 Agent 相关类型

#### AgentConfig - Agent 配置
```typescript
interface AgentConfig {
  id: string;                 // Agent 唯一标识
  name: string;               // Agent 名称
  description: string;        // Agent 描述
  dimension?: ReviewDimension; // 负责的审查维度
  systemPrompt: string;       // system prompt 模板
  model?: string;             // 模型选择
  maxTokens?: number;         // 最大输出 token 数
  temperature?: number;       // 温度参数
}
```

#### AgentResult - Agent 执行结果
```typescript
interface AgentResult {
  agentId: string;            // 执行该结果的 Agent ID
  issues: ReviewIssue[];      // 发现的问题列表
  durationMs: number;         // 执行耗时
  tokenUsage: { input, output, total };
  success: boolean;           // 是否成功
  error?: string;             // 错误信息
}
```

#### AdversaryResult - 对抗审查结果
```typescript
interface AdversaryResult extends AgentResult {
  falsePositives: number[];   // 被标记为误报的问题索引
  confidenceAdjustments: Array<{
    issueIndex: number;       // 问题索引
    newConfidence: number;    // 新的置信度
    reason: string;           // 调整理由
  }>;
}
```

#### DimensionAgent - 维度 Agent 接口
```typescript
interface DimensionAgent {
  config: AgentConfig;
  review(files: string[], context: string): Promise<AgentResult>;
}
```

#### AdversaryAgent - 对抗 Agent 接口
```typescript
interface AdversaryAgent {
  config: AgentConfig;
  challenge(
    files: string[],
    context: string,
    existingIssues: ReviewIssue[]
  ): Promise<AdversaryResult>;
}
```

---

## 3. src/agents/ 目录详细分析

### 3.1 已有 Agent 文件列表

| 文件名 | 类名 | 审查维度 | 功能描述 |
|--------|------|--------|--------|
| agent-runner.ts | AgentRunner | - | 基础抽象类，提供通用 Agent 执行逻辑 |
| logic-agent.ts | LogicAgent | Logic | 检查逻辑正确性问题 |
| security-agent.ts | SecurityAgent | Security | 检查安全漏洞 |
| performance-agent.ts | PerformanceAgent | Performance | 检查性能问题 |
| maintainability-agent.ts | MaintainabilityAgent | Maintainability | 检查可维护性问题 |
| edge-case-agent.ts | EdgeCaseAgent | EdgeCases | 检查边界情况问题 |
| adversary-agent.ts | AdversaryAgent | - | 对抗式审查 Agent |
| issue-calibrator.ts | IssueCalibrtor | - | 问题校准和去重处理 |

### 3.2 AgentRunner - 基础抽象类

**主要职责**:
- 通过 Anthropic SDK 调用 Claude API
- 管理 Agent 执行生命周期（超时、错误处理）
- 解析 JSON 响应（处理 markdown fence、尾逗号、单引号等）
- 验证和修正 ReviewIssue 数据

**关键方法**:
```typescript
abstract class AgentRunner {
  constructor(config: AgentConfig, timeout?: number)
  async review(files: string[], context: string): Promise<AgentResult>
  protected async callClaudeAPI(userMessage: string): Promise<string>
  protected abstract performReview(...): Promise<ReviewIssue[]>
  protected parseJsonResponse(rawText: string): ReviewIssue[]
  protected validateAndFixIssues(rawIssues: unknown[]): ReviewIssue[]
}
```

**设计特点**:
- 每次 review 创建独立的 Anthropic 客户端实例（完全隔离）
- JSON 解析容错性强，支持多种格式变体
- 自动修正 dimension 为 Agent 负责的维度
- 置信度限制在 0-1 范围内

### 3.3 五个维度 Agent 的实现模式

所有五个维度 Agent 都遵循相同的模式：

```typescript
export class XxxAgent extends AgentRunner {
  constructor(config?: Partial<AgentConfig>, timeout?: number) {
    const defaultConfig: AgentConfig = {
      id: config?.id || 'xxx-agent',
      name: config?.name || '...',
      description: config?.description || '...',
      dimension: ReviewDimension.Xxx,
      systemPrompt: config?.systemPrompt || XXX_AGENT_PROMPT,
      model: config?.model,
      maxTokens: config?.maxTokens || 4000,
      temperature: config?.temperature || 0.5,
    };
    super(defaultConfig, timeout);
  }

  protected async performReview(
    files: string[],
    context: string
  ): Promise<ReviewIssue[]> {
    const userMessage = this.buildUserMessage(files, context);
    const responseText = await this.callClaudeAPI(userMessage);
    return this.parseJsonResponse(responseText);
  }

  private buildUserMessage(files: string[], context: string): string {
    // 构建审查请求消息
  }
}
```

### 3.4 AdversaryAgent - 对抗式审查

**特点**:
- 不继承 AgentRunner（独立实现）
- 接收已有问题列表作为输入
- 执行两个主要任务:
  1. **寻找被遗漏的问题** - 从全新视角审视代码
  2. **质疑已有问题** - 标记为 confirmed / disputed / false_positive

**关键方法**:
```typescript
async challenge(
  files: string[],
  context: string,
  existingIssues: ReviewIssue[]
): Promise<AdversaryResult>
```

**返回结构**:
```typescript
interface AdversaryResult extends AgentResult {
  falsePositives: number[];   // 误报的索引
  confidenceAdjustments: Array<{
    issueIndex: number;
    newConfidence: number;
    reason: string;
  }>;
}
```

### 3.5 IssueCalibrtor - 问题校准器

**职责**:
1. 应用对抗 Agent 的置信度调整建议
2. 删除/降级被标记为误报的问题
3. 合并来自不同 Agent 的重复问题
4. 按严重程度和置信度排序

**关键方法**:
```typescript
class IssueCalibrtor {
  calibrate(
    originalIssues: ReviewIssue[],
    adversaryResult: AdversaryResult
  ): ReviewIssue[]

  private applyConfidenceAdjustments(...)
  private filterFalsePositives(...)
  private mergeeDuplicates(...)
  private sortIssues(...)
  generateCalibrationSummary(...)
}
```

**去重策略**:
- 生成问题的唯一标识: `${file}:${line}:${dimension}:${severity}`
- 保留置信度最高的重复问题

---

## 4. Agent Prompts 详细说明 (src/agents/prompts/index.ts)

### 4.1 Prompt 设计原则

1. **明确的维度定义** - 每个 prompt 清晰定义该维度的审查目标
2. **10+ 具体检查点** - 列出该维度应重点关注的问题类型
3. **具体触发条件** - 要求 Agent 提供具体的触发条件或复现步骤
4. **标准 JSON 输出格式** - 所有 prompt 要求返回 JSON ReviewIssue 格式
5. **鼓励对抗思维** - 以"证明代码是错的"为目标

### 4.2 五个维度的 Prompt

#### LOGIC_AGENT_PROMPT - 逻辑正确性
**检查点**:
1. 控制流错误 (if/else/switch 分支遗漏)
2. 数据流错误 (变量初始化、传递)
3. 循环错误 (条件、死循环、off-by-one)
4. 空值处理 (null/undefined/empty)
5. 类型不匹配 (隐式类型强制转换)
6. 边界条件 (数组索引、字符串长度)
7. 竞态条件 (异步代码)
8. 逻辑反转 (!= 应该是 ==)
9. 操作符错误 (位运算、逻辑运算)
10. 返回值处理 (错误返回值遗漏)

#### SECURITY_AGENT_PROMPT - 安全性
**检查点**:
1. 注入漏洞 (SQL、命令、模板、XPath)
2. 跨站脚本 (XSS - 用户输入渲染)
3. 权限绕过 (权限检查遗漏)
4. 敏感数据泄露 (日志、错误信息)
5. 不安全的依赖 (已知恶意或过时版本)
6. 身份验证/授权缺陷
7. 加密和哈希问题 (弱算法、不正确生成)
8. 会话管理 (token 生成、存储、超时)
9. 不安全的序列化 (不可信数据反序列化)
10. 错误处理信息泄露
11. 密钥管理 (硬编码、缺少轮换)
12. 文件操作安全 (路径遍历)

#### PERFORMANCE_AGENT_PROMPT - 性能
**检查点**:
1. N+1 查询问题 (循环中的数据库查询)
2. 内存泄漏 (未释放资源、循环引用)
3. 不必要的计算 (循环中重复计算)
4. 阻塞操作 (主线程阻塞)
5. 算法复杂度 (O(n²)、O(2^n) 等)
6. 字符串拼接 (循环中使用 +)
7. 正则表达式效率 (复杂回溯)
8. 集合操作效率 (多次遍历、Array vs Set)
9. DOM 操作 (频繁查询、重排)
10. 序列化/反序列化优化

#### MAINTAINABILITY_AGENT_PROMPT - 可维护性
**检查点**:
1. 代码重复 (DRY 原则)
2. 圈复杂度过高 (过多分支)
3. 命名不当 (歧义、不清晰)
4. 缺少文档 (复杂逻辑注释)
5. 函数过长 (> 50 行)
6. 嵌套过深 (> 3-4 层)
7. 魔法数字 (未定义的常数)
8. 缺失错误处理 (try-catch)
9. SOLID 原则违反
10. 代码风格不一致

#### EDGE_CASE_AGENT_PROMPT - 边界情况
**检查点**:
1. 空输入处理 ([], "", null, undefined)
2. 极端值处理 (min/max/zero/negative)
3. 大数据输入 (100MB 文件、百万级数组)
4. 并发场景 (竞态条件、并发修改)
5. 网络失败 (超时、中断、DNS 失败)
6. 资源耗尽 (磁盘满、内存溢出)
7. 时间边界 (闰年、月末、午夜、时区)
8. 浮点精度 (比较精度误差)
9. 编码问题 (UTF-8、特殊字符、emoji)
10. 路径和文件 (符号链接、权限)

### 4.3 对抗审查 Prompt (ADVERSARY_AGENT_PROMPT)

**独特特点**:
- 要求完全独立的视角（不受已有问题影响）
- 两个任务: 寻找遗漏 + 质疑已有问题
- 质疑分类: confirmed / disputed / false_positive
- 建议调整置信度和严重程度

**输出格式**:
```json
{
  "newIssues": [/* ReviewIssue[] */],
  "issueJudgments": [
    {
      "existingIssueIndex": 0,
      "judgment": "confirmed|disputed|false_positive",
      "reason": "...",
      "suggestedConfidenceAdjustment": 0.5,
      "suggestedSeverityAdjustment": "high"
    }
  ]
}
```

---

## 5. 编排器 (ReviewOrchestrator)

**职责**:
1. 并行启动 5 个维度 Agent
2. 收集所有维度的审查结果
3. 启动对抗审查 Agent
4. 应用校准处理
5. 生成最终报告

**执行流程**:
```
1. prepareReviewContext()
   ├─ 收集文件列表
   └─ 构建上下文字符串

2. executeDimensionAgents() [并行]
   ├─ LogicAgent.review()
   ├─ SecurityAgent.review()
   ├─ PerformanceAgent.review()
   ├─ MaintainabilityAgent.review()
   └─ EdgeCaseAgent.review()

3. executeAdversaryReview() [如果启用]
   └─ AdversaryAgent.challenge(所有已有问题)

4. calibrateResults()
   └─ IssueCalibrtor.calibrate()

5. generateReport()
   ├─ generateSummary()
   └─ generateMetadata()
```

**配置项**:
```typescript
interface OrchestratorConfig {
  model?: string;              // 使用的 AI 模型
  maxParallel?: number;        // 最大并行 Agent 数
  agentTimeout?: number;       // 单个 Agent 超时 (默认 120s)
  totalTimeout?: number;       // 总体超时 (默认 600s)
  enableAdversary?: boolean;   // 是否启用对抗审查 (默认 true)
  enableCache?: boolean;       // 是否启用缓存 (默认 false)
}
```

---

## 6. 其他模块概览

### 6.1 Input 模块 (src/input/)
- **file-collector.ts** - 收集待审查的文件列表
- **git-diff-collector.ts** - 收集 Git diff 内容
- **context-enricher.ts** - 丰富审查上下文

### 6.2 Output 模块 (src/output/)
- **report-generator.ts** - 生成审查报告
- 支持多种输出格式（JSON、HTML、Markdown）

### 6.3 Skill 模块 (src/skill/)
- **review-skill.ts** - 代码审查技能
- 与 Claude Code Agent 集成

---

## 7. 关键设计模式

### 7.1 Agent 隔离设计
- 每次 review 创建独立的 Anthropic 客户端实例
- 不共享任何可变状态
- 配置对象深拷贝，确保线程安全

### 7.2 JSON 解析容错性
```typescript
// 支持多种格式变体:
// 1. ```json ... ``` markdown fence
// 2. 前后有多余文本: "here are issues: [...] done"
// 3. Trailing commas: { key: value, }
// 4. 单引号: { 'key': 'value' }
// 5. 无引号属性名: { key: value }
```

### 7.3 问题去重策略
- 唯一标识: `${file}:${line}:${dimension}:${severity}`
- 保留置信度最高的重复问题
- 按严重程度和置信度排序

### 7.4 对抗审查循环
```
初始审查结果 → 对抗审查 → 置信度调整 → 误报过滤 → 新问题添加 → 最终排序
```

---

## 8. 是否已有相关文件

### ✅ 已有的文件
- ✅ `adversary-agent.ts` - 对抗 Agent 实现
- ✅ `issue-calibrator.ts` - 问题校准器实现

### ❌ 缺少的文件
- ❌ 没有专门的 "adversary" 目录
- ❌ 没有单独的 "issue-calibrator" 目录
- ❌ 所有相关功能都在 agents/ 目录中

---

## 9. 文件导出接口总结

### src/agents/index.ts
```typescript
export { AgentRunner } from './agent-runner'
export { LogicAgent } from './logic-agent'
export { SecurityAgent } from './security-agent'
export { PerformanceAgent } from './performance-agent'
export { MaintainabilityAgent } from './maintainability-agent'
export { EdgeCaseAgent } from './edge-case-agent'
export { AdversaryAgent, IssueJudgment, AdversaryReviewResponse } from './adversary-agent'
export { IssueCalibrtor } from './issue-calibrator'
export * from './prompts'
```

### src/types/index.ts
```typescript
export * from './review'  // 所有审查相关类型
export * from './agent'   // 所有 Agent 相关类型
```

### src/prompts/index.ts
```typescript
export const LOGIC_AGENT_PROMPT
export const SECURITY_AGENT_PROMPT
export const PERFORMANCE_AGENT_PROMPT
export const MAINTAINABILITY_AGENT_PROMPT
export const EDGE_CASE_AGENT_PROMPT
export const ADVERSARY_AGENT_PROMPT
export const AGENT_PROMPTS
export const AGENT_PROMPTS_WITH_ADVERSARY
export type AgentPromptKey
export type AgentPromptKeyWithAdversary
```

---

## 10. 统计数据

| 指标 | 数值 |
|-----|------|
| 总 TypeScript 文件数 | 23 |
| Agent 类数量 | 7 (5个维度 + AdversaryAgent + IssueCalibrtor) |
| 核心类型定义 | 15+ |
| Prompt 数量 | 6 |
| 审查维度 | 5 |
| 问题严重程度级别 | 4 (critical, high, medium, low) |

