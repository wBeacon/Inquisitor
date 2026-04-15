# Inquisitor 项目完整探索报告

## 📋 项目概览

**项目名称**: Inquisitor  
**版本**: 0.1.0  
**描述**: 高强度代码审查工具 - 以对抗式 Agent 模式深度审查代码质量  
**目的**: 为 Agent 提供一个完全不在意消耗 token、只为找到代码任何问题的审查工具

---

## 1️⃣ 项目目录结构

```
/Users/verneywang/personal/project/Inquisitor/
├── .cf/                              # Claude Forever 配置目录
│   ├── contracts/
│   │   └── feature_1.json            # Feature #1 验收标准
│   ├── plan.json                      # 完整的 7 个 Feature 规划
│   └── tasks/
│       └── 2cb4ef5d333a/             # 当前任务状态
│           ├── task-state.json
│           └── progress.json
├── dist/                              # 编译输出
│   ├── types/
│   │   ├── review.d.ts
│   │   ├── review.js
│   │   ├── agent.d.ts
│   │   ├── agent.js
│   │   ├── index.d.ts
│   │   └── index.js
│   ├── input/
│   ├── output/
│   ├── agents/
│   ├── orchestrator/
│   ├── skill/
│   └── [其他编译文件]
├── src/                               # 源代码目录
│   ├── types/
│   │   ├── review.ts                  # 核心审查相关类型定义
│   │   ├── agent.ts                   # Agent 接口定义
│   │   └── index.ts                   # 类型统一导出入口
│   ├── input/
│   │   └── index.ts                   # 输入采集模块（占位）
│   ├── output/
│   │   └── index.ts                   # 输出生成模块（占位）
│   ├── agents/
│   │   └── index.ts                   # Agent 实现模块（占位）
│   ├── orchestrator/
│   │   └── index.ts                   # 编排器模块（占位）
│   └── skill/
│       └── index.ts                   # Skill 集成模块（占位）
├── node_modules/                      # npm 依赖
├── .git/                              # Git 仓库
├── .gitignore
├── package.json
├── tsconfig.json
├── CLAUDE.md                          # Claude Forever 项目说明
├── claude-progress.txt                # 进度日志
└── control.json                       # 控制文件

```

---

## 2️⃣ 核心类型定义详解

### 📝 Types 模块结构

源文件位置：`src/types/`
编译输出：`dist/types/`

#### **A. ReviewDimension 枚举** (`src/types/review.ts`)

定义了代码审查的 **5 个独立维度**：

```typescript
enum ReviewDimension {
  Logic = 'logic'              // 逻辑正确性
  Security = 'security'        // 安全性
  Performance = 'performance'  // 性能
  Maintainability = 'maintainability'  // 可维护性
  EdgeCases = 'edge_cases'     // 边界情况
}
```

**说明**:
- 每个维度对应一个独立的审查 Agent
- 每个 Agent 专注于该维度的深度分析
- 维度之间彼此独立且可并行执行

---

#### **B. Severity 类型** (`src/types/review.ts`)

问题严重等级定义：

```typescript
type Severity = 'critical' | 'high' | 'medium' | 'low';
```

**严重等级说明**:
- `critical`: 影响功能正确性或造成安全漏洞的关键问题
- `high`: 明显的逻辑错误或重要的非功能性问题
- `medium`: 需要注意的代码质量或性能问题
- `low`: 建议改进的风格或最佳实践问题

---

#### **C. ReviewIssue 接口** (`src/types/review.ts`)

单个审查问题的完整定义：

```typescript
interface ReviewIssue {
  // 必需字段
  file: string;                    // 问题所在文件路径
  line: number;                    // 问题所在行号
  severity: Severity;              // 严重等级
  dimension: ReviewDimension;      // 所属审查维度
  description: string;             // 问题描述（为什么这是一个问题？）
  suggestion: string;              // 修复建议
  confidence: number;              // 置信度 (0-1)，表示 Agent 的确信程度
  
  // 可选字段
  endLine?: number;                // 问题结束行号（用于标记代码块范围）
  foundBy?: string;                // 发现该问题的 Agent 标识
  codeSnippet?: string;            // 相关代码片段
}
```

**关键字段说明**:
- `confidence`: 0-1 范围，表示 Agent 对该问题判断的确信程度
  - 1.0: 高度确信这是一个真实问题
  - 0.5: 中等确信，可能需要进一步验证
  - 0.3: 低确信，可能是误报
- `foundBy`: 追踪该问题是由哪个 Agent 发现的，便于去重和置信度校准
- `codeSnippet`: 便于输出时直接展示问题代码

---

#### **D. SeverityCount 接口** (`src/types/review.ts`)

按严重等级统计：

```typescript
interface SeverityCount {
  critical: number;
  high: number;
  medium: number;
  low: number;
}
```

---

#### **E. ReviewSummary 接口** (`src/types/review.ts`)

审查报告的统计摘要：

```typescript
interface ReviewSummary {
  bySeverity: SeverityCount;                    // 按严重等级分组统计
  byDimension: Record<ReviewDimension, number>; // 按审查维度分组统计
  totalIssues: number;                          // 问题总数
}
```

**用途**: 提供快速的审查结果概览

---

#### **F. TokenUsage 接口** (`src/types/review.ts`)

Token 消耗统计：

```typescript
interface TokenUsage {
  input: number;   // 输入 token 数量
  output: number;  // 输出 token 数量
  total: number;   // 总 token 数量
}
```

---

#### **G. ReviewMetadata 接口** (`src/types/review.ts`)

审查过程的运行信息：

```typescript
interface ReviewMetadata {
  durationMs: number;      // 审查总耗时（毫秒）
  tokenUsage: TokenUsage;  // Token 消耗统计
  startedAt: string;       // 审查开始时间（ISO 8601）
  completedAt: string;     // 审查结束时间
  agents: string[];        // 参与审查的 Agent 列表（标识符）
}
```

---

#### **H. ReviewReport 接口** (`src/types/review.ts`)

整个审查流程的最终输出：

```typescript
interface ReviewReport {
  issues: ReviewIssue[];      // 发现的所有问题列表
  summary: ReviewSummary;     // 统计摘要
  metadata: ReviewMetadata;   // 审查元数据
}
```

**结构说明**:
- `issues`: 按发现顺序或优先级排列
- `summary`: 快速统计数据，便于报告生成
- `metadata`: 用于性能分析、成本追踪、Agent 效果评估

---

#### **I. FileToReview 接口** (`src/types/review.ts`)

单个待审查文件的输入：

```typescript
interface FileToReview {
  path: string;         // 文件路径
  content?: string;     // 完整文件内容（可选）
  diff?: string;        // Diff 内容（可选）
  language?: string;    // 文件语言标识 (e.g., 'typescript', 'python')
}
```

**设计意图**:
- 支持审查完整文件（`content`）
- 支持仅审查变更（`diff`）
- 支持混合模式：diff + 周围上下文

---

#### **J. ContextConfig 接口** (`src/types/review.ts`)

上下文配置 - 控制审查时的上下文信息：

```typescript
interface ContextConfig {
  contextLines: number;        // 包含的上下文行数（diff 前后各 N 行）
  includeFullFile: boolean;    // 是否包含完整文件内容
  includeDependencies: boolean;// 是否包含依赖文件
  projectRoot: string;         // 项目根目录（用于解析相对路径）
}
```

**参数说明**:
- `contextLines`: 通常设为 50（前后各 50 行）
- `includeFullFile`: 当审查新增文件时设为 true
- `includeDependencies`: 当需要理解跨文件影响时设为 true
- `projectRoot`: 用于相对路径转换、依赖查找

---

#### **K. ReviewRequest 接口** (`src/types/review.ts`)

发起一次代码审查的完整输入：

```typescript
interface ReviewRequest {
  files: FileToReview[];              // 待审查的文件列表
  diff?: string;                      // 总体 diff 内容（可选）
  context: ContextConfig;             // 上下文配置（必需）
  dimensions?: ReviewDimension[];     // 指定审查维度
  mode: 'review' | 'review-fix';      // 审查模式
  maxIterations?: number;             // review-fix 模式下的最大迭代次数
}
```

**字段说明**:
- `dimensions`: 空数组或未指定时审查所有维度
- `mode`:
  - `'review'`: 仅输出问题，不修复
  - `'review-fix'`: 审查 → 修复 → 再审查的迭代循环
- `maxIterations`: 防止无限循环，默认建议值为 3

---

### 🤖 Agent 模块类型 (`src/types/agent.ts`)

#### **L. AgentConfig 接口**

单个 Agent 的基本配置：

```typescript
interface AgentConfig {
  id: string;                    // Agent 唯一标识 (e.g., 'logic-agent-1')
  name: string;                  // Agent 名称 (e.g., 'Logic Reviewer')
  description: string;           // Agent 描述
  dimension?: ReviewDimension;   // 负责的审查维度（维度 Agent 使用）
  systemPrompt: string;          // System prompt 模板
  model?: string;                // 模型选择（默认使用编排器配置）
  maxTokens?: number;            // 最大输出 token 数
  temperature?: number;          // 温度参数 (0.0-1.0)
}
```

---

#### **M. AgentResult 接口**

Agent 执行结果：

```typescript
interface AgentResult {
  agentId: string;               // 执行该结果的 Agent 标识
  issues: ReviewIssue[];         // 发现的问题列表
  durationMs: number;            // 执行耗时（毫秒）
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  success: boolean;              // 执行是否成功
  error?: string;                // 错误信息（失败时）
}
```

---

#### **N. DimensionAgent 接口**

维度审查 Agent 接口 - 专注于单一审查维度：

```typescript
interface DimensionAgent {
  config: AgentConfig;
  
  review(
    files: string[],      // 待审查文件路径列表
    context: string       // 完整的代码上下文（可能包含多个文件）
  ): Promise<AgentResult>;
}
```

**职责**:
- 专注于一个审查维度（e.g., 仅关注逻辑错误）
- 返回在该维度发现的所有问题
- 可与其他维度 Agent 并行执行

---

#### **O. AdversaryAgent 接口**

对抗审查 Agent - 以对抗视角重新审视已有结果：

```typescript
interface AdversaryAgent {
  config: AgentConfig;
  
  challenge(
    files: string[],              // 待审查文件路径列表
    context: string,              // 完整代码上下文
    existingIssues: ReviewIssue[] // 所有维度 Agent 已发现的问题
  ): Promise<AdversaryResult>;
}
```

**职责**:
- 在全新隔离上下文中运行，不继承维度 Agent 的偏见
- 尝试找出被遗漏的问题
- 挑战已有结论中的误报
- 调整问题的置信度

---

#### **P. AdversaryResult 接口**

对抗审查结果（继承 `AgentResult`）：

```typescript
interface AdversaryResult extends AgentResult {
  // 继承的字段：agentId, issues, durationMs, tokenUsage, success, error
  
  // 新增字段
  falsePositives: number[];        // 被标记为误报的已有问题索引
  confidenceAdjustments: Array<{
    issueIndex: number;            // 原 issues 数组的索引
    newConfidence: number;         // 调整后的置信度
    reason: string;                // 调整理由
  }>;
}
```

**说明**:
- `falsePositives`: 数组中的数字是 `existingIssues` 的索引
- `issues`: 新发现的问题列表
- `confidenceAdjustments`: 对已有问题置信度的调整建议

---

#### **Q. Orchestrator 接口**

编排器接口 - 管理整个审查流程：

```typescript
interface Orchestrator {
  run(request: ReviewRequest): Promise<ReviewReport>;
}
```

**职责**:
- 采集输入（处理 Git diff、文件扫描）
- 启动并行维度审查 Agent
- 聚合结果
- 执行对抗审查阶段
- 生成最终报告

---

## 3️⃣ Package.json 配置

```json
{
  "name": "inquisitor",
  "version": "0.1.0",
  "description": "高强度代码审查工具 - 以对抗式 Agent 模式深度审查代码质量",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "lint": "eslint src/",
    "clean": "rm -rf dist/"
  },
  "keywords": [
    "code-review",
    "agent",
    "adversarial",
    "static-analysis"
  ],
  "license": "MIT",
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.11.0"
  }
}
```

**特点**:
- 暂无运行时依赖，仅 TypeScript 和类型文件
- 入口：`dist/index.js` + `dist/index.d.ts`
- 脚本：typecheck / build / lint / clean

---

## 4️⃣ Tsconfig.json 配置

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,                    // 严格模式启用
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,               // 生成 .d.ts
    "declarationMap": true,            // 生成 .d.ts.map
    "sourceMap": true                  // 生成 .js.map
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**配置特点**:
- ✅ `strict: true` - 启用所有严格检查
- ✅ `ES2022` 目标 - 现代 JavaScript 特性
- ✅ `bundler` 模块解析 - 支持 ESM bundler
- ✅ 完整的源映射和声明文件

**编译验证状态**: ✅ **零错误、零警告**

---

## 5️⃣ 测试结构

**当前状态**: ❌ **不存在测试文件**

搜索结果：
- 无 `*.test.ts` 或 `*.spec.ts` 文件
- 无 `__tests__` 目录
- 无测试框架配置（jest/mocha/vitest）

**建议**: Feature #2-7 实现时需添加测试框架和测试用例

---

## 6️⃣ 目录内容检查

### ✅ src/input/ - 已存在
```
src/input/
└── index.ts     # 占位文件，包含模块说明注释
```

**状态**: 目录存在，等待实现

---

### ✅ .cf/contracts/ - 已存在
```
.cf/contracts/
└── feature_1.json    # Feature #1 的验收标准和风险分析
```

**内容**: 
- Feature #1 的 11 个协议化验收标准
- 技术风险分析
- 复杂度评估（S - Small）

---

## 7️⃣ 项目规划（.cf/plan.json）

项目规划了 **7 个 Feature**，分阶段实现：

| Feature | 名称 | 状态 | 优先级 | 复杂度 |
|---------|------|------|--------|--------|
| #1 | 项目脚手架与核心类型系统 | ✅ 完成 | 高 | M |
| #2 | 输入采集层 | 🔄 进行中 | 高 | M |
| #3 | 维度审查 Agent 系统 | ⏳ 待处理 | 高 | L |
| #4 | 对抗式 Adversary Agent | ⏳ 待处理 | 高 | L |
| #5 | 编排器 (Orchestrator) | ⏳ 待处理 | 高 | L |
| #6 | 输出层与报告生成 | ⏳ 待处理 | 中 | M |
| #7 | Claude Code Skill 集成 | ⏳ 待处理 | 中 | M |

---

## 8️⃣ 项目元数据

**Git 仓库**: ✅ 已初始化  
**编译状态**: ✅ 零错误  
**类型检查**: ✅ 通过  
**当前活跃任务**: Feature #2 - 输入采集层  
**Claude Forever 状态**: 运行中（Loop 2/50）  

---

## 📊 核心类型导出关系图

```
src/types/index.ts
├── export * from './review.ts'
│   ├── ReviewDimension (enum)
│   ├── Severity (type)
│   ├── ReviewIssue (interface)
│   ├── SeverityCount (interface)
│   ├── ReviewSummary (interface)
│   ├── TokenUsage (interface)
│   ├── ReviewMetadata (interface)
│   ├── ReviewReport (interface)
│   ├── FileToReview (interface)
│   ├── ContextConfig (interface)
│   └── ReviewRequest (interface)
└── export * from './agent.ts'
    ├── AgentConfig (interface)
    ├── AgentResult (interface)
    ├── DimensionAgent (interface)
    ├── AdversaryAgent (interface)
    ├── AdversaryResult (interface)
    └── Orchestrator (interface)
```

---

## 🎯 下一步行动

### Feature #2: 输入采集层（当前）

需实现的文件：
```
src/input/
├── git-diff-collector.ts      # 解析 git diff
├── file-collector.ts           # 文件读取
├── context-enricher.ts         # 依赖发现
└── index.ts                    # 导出入口
```

核心功能：
- ✔️ Unified diff 格式解析
- ✔️ 文件内容读取 + glob 支持
- ✔️ 自动依赖发现（2 层深度）
- ✔️ 大文件自动截断处理

---

## 📚 类型设计特点总结

### ✅ 优点

1. **分离的职责**: 清晰区分输入(ReviewRequest)、处理(Agent 接口)、输出(ReviewReport)
2. **可扩展性**: ReviewDimension 枚举易于添加新维度
3. **可观测性**: ReviewMetadata 记录完整执行信息
4. **置信度追踪**: confidence 字段支持误报识别和精准度评估
5. **对抗验证**: AdversaryResult 支持误报挑战和校准
6. **并行友好**: DimensionAgent 接口设计支持并行执行

### ⚠️ 需要注意的点

1. **confidence 约束**: 0-1 范围在纯 TypeScript 层无法完全表达，需运行时校验 (建议使用 zod)
2. **ReviewRequest 设计**: dimension 字段的可选性需要在文档中明确处理"空值=全部维度"的含义
3. **Token 估算**: metadata 中的 tokenUsage 需要实际的 Claude API 调用才能统计
4. **并行失败处理**: 需要定义当某个维度 Agent 超时/失败时的处理策略

---

## ✨ 结论

Inquisitor 项目已建立了坚实的类型基础，所有核心接口都设计得当。
Feature #1 100% 完成，**11 个验收标准全部满足**。
项目现在可以安全地进入 Feature #2（输入采集层）的实现阶段。

