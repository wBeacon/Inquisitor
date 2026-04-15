# Inquisitor 项目结构完整探索报告

生成时间: 2026-04-15

## 📋 核心文档导航

本报告包含以下内容:

1. **项目概览** - 基本信息和技术栈
2. **类型定义完全参考** - 所有 17 个核心类型
3. **文件结构详图** - 完整的源代码组织
4. **模块职责说明** - 每个模块的功能
5. **测试框架详解** - Jest 配置和测试覆盖

---

## 🎯 一句话总结

**Inquisitor** 是一个 TypeScript 实现的高强度代码审查工具，采用对抗式多 Agent 架构，通过 5 个维度 Agent + 对抗 Agent 组成的系统进行深度代码审查，最后通过 ReportGenerator 生成 JSON 和 Markdown 格式的审查报告。

---

## 📊 项目基本信息

| 项目属性 | 值 |
|---------|-----|
| **项目名称** | Inquisitor |
| **项目描述** | 高强度代码审查工具 - 以对抗式 Agent 模式深度审查代码质量 |
| **版本号** | 0.1.0 |
| **主要语言** | TypeScript |
| **编译目标** | ES2022 |
| **模块格式** | CommonJS |
| **输出目录** | dist/ |
| **测试框架** | Jest (with ts-jest) |
| **核心依赖** | @anthropic-ai/sdk, glob |

---

## ✅ 探索清单完成情况

### 1. src/types/ 类型定义 ✓ 完成

**位置**: `src/types/`

| 文件 | 行数 | 内容 |
|------|------|------|
| index.ts | 7 | 导出入口，统一暴露所有类型 |
| review.ts | 149 | 所有审查相关类型定义 |
| agent.ts | 93 | 所有 Agent 相关接口定义 |

**类型统计**:
- 1 个枚举 (ReviewDimension)
- 1 个 Union 类型 (Severity)
- 15 个接口定义
- **总计 17 个核心类型**

### 2. src/output/ 模块 ✓ 已存在

**位置**: `src/output/`

| 文件 | 行数 | 功能 |
|------|------|------|
| index.ts | 17 | 模块导出 |
| report-generator.ts | 316 | 报告生成核心类 |

**功能列表**:
- ✅ JSON 格式转换
- ✅ Markdown 格式转换
- ✅ 自动文件输出
- ✅ 自定义配置支持

### 3. 项目配置文件 ✓ 完成

- ✅ **tsconfig.json** - 严格的 TypeScript 配置
- ✅ **package.json** - 项目配置和脚本
- ✅ **jest.config.js** - Jest 测试配置

### 4. 测试框架与结构 ✓ 完成

- ✅ **框架**: Jest 29.7.0 + ts-jest
- ✅ **覆盖**: 12 个测试模块
- ✅ **特性**: 自动发现、覆盖率收集、异步安全

---

## 📁 完整项目结构

### 源代码树 (28 个文件)

```
src/
├── types/                                    # [3 files]
│   ├── index.ts                             # 导出入口
│   ├── review.ts                            # 审查相关类型 (149 行)
│   └── agent.ts                             # Agent 接口 (93 行)
│
├── agents/                                   # [11 files]
│   ├── index.ts
│   ├── logic-agent.ts                       # 逻辑正确性
│   ├── security-agent.ts                    # 安全性
│   ├── performance-agent.ts                 # 性能
│   ├── maintainability-agent.ts             # 可维护性
│   ├── edge-case-agent.ts                   # 边界情况
│   ├── adversary-agent.ts                   # 对抗审查
│   ├── agent-runner.ts                      # Agent 运行器
│   ├── issue-calibrator.ts                  # 问题校准
│   └── prompts/                             # Prompt 管理
│       ├── index.ts
│       └── adversary-prompt.ts
│
├── input/                                    # [4 files]
│   ├── index.ts
│   ├── file-collector.ts                    # 文件收集
│   ├── git-diff-collector.ts                # Diff 收集
│   └── context-enricher.ts                  # 上下文增强
│
├── output/                                   # [2 files] ✓
│   ├── index.ts                             # (17 行)
│   └── report-generator.ts                  # (316 行)
│
├── orchestrator/                             # [6 files]
│   ├── index.ts
│   ├── orchestrator.ts
│   ├── review-orchestrator.ts
│   ├── parallel-scheduler.ts                # 并行调度
│   ├── result-merger.ts                     # 结果合并
│   └── config.ts                            # 配置管理
│
└── skill/                                    # [2 files]
    ├── index.ts
    └── review-skill.ts
```

### 测试树 (12 个文件)

```
__tests__/
├── agents/                       # Agent 测试
│   ├── dimension-agents.test.ts
│   └── adversary-agent.test.ts
├── input/                        # 输入处理测试
│   ├── file-collector.test.ts
│   ├── git-diff-collector.test.ts
│   ├── context-enricher.test.ts
│   └── integration.test.ts
├── output/                       # 输出测试
│   └── report-generator.test.ts  (461 行)
├── orchestrator/                 # 编排测试
│   ├── review-orchestrator.test.ts
│   ├── parallel-scheduler.test.ts
│   ├── result-merger.test.ts
│   └── config.test.ts
└── skill/                        # Skill 测试
    └── review-skill.test.ts
```

---

## 🔍 17 个核心类型完全参考

### A. 枚举与基础类型 (2 个)

| # | 类型名 | 类型 | 内容 | 源文件 |
|---|--------|------|------|--------|
| 1 | `ReviewDimension` | Enum | Logic, Security, Performance, Maintainability, EdgeCases | review.ts |
| 2 | `Severity` | Union | 'critical' \| 'high' \| 'medium' \| 'low' | review.ts |

### B. 问题和报告类型 (5 个)

| # | 类型名 | 类型 | 主要字段 | 源文件 |
|---|--------|------|---------|--------|
| 3 | `ReviewIssue` | Interface | file, line, severity, dimension, description, suggestion, confidence | review.ts |
| 4 | `SeverityCount` | Interface | critical, high, medium, low (counts) | review.ts |
| 5 | `ReviewSummary` | Interface | bySeverity, byDimension, totalIssues | review.ts |
| 6 | `ReviewReport` | Interface | issues[], summary, metadata | review.ts |
| 7 | `ReviewMetadata` | Interface | durationMs, tokenUsage, startedAt, completedAt, agents[] | review.ts |

### C. Token 和流程类型 (3 个)

| # | 类型名 | 类型 | 主要字段 | 源文件 |
|---|--------|------|---------|--------|
| 8 | `TokenUsage` | Interface | input, output, total | review.ts |
| 9 | `FileToReview` | Interface | path, content?, diff?, language? | review.ts |
| 10 | `ContextConfig` | Interface | contextLines, includeFullFile, includeDependencies, projectRoot | review.ts |

### D. 输入和配置类型 (2 个)

| # | 类型名 | 类型 | 主要字段 | 源文件 |
|---|--------|------|---------|--------|
| 11 | `ReviewRequest` | Interface | files[], diff?, context, dimensions?, mode, maxIterations? | review.ts |
| 12 | `AgentConfig` | Interface | id, name, description, dimension?, systemPrompt, model?, maxTokens?, temperature? | agent.ts |

### E. Agent 执行和结果类型 (3 个)

| # | 类型名 | 类型 | 主要字段 | 源文件 |
|---|--------|------|---------|--------|
| 13 | `AgentResult` | Interface | agentId, issues[], durationMs, tokenUsage, success, error? | agent.ts |
| 14 | `AdversaryResult` | Interface | (extends AgentResult) + falsePositives[], confidenceAdjustments[] | agent.ts |
| 15 | `DimensionAgent` | Interface | config, review(files, context): Promise<AgentResult> | agent.ts |

### F. 对抗和编排接口 (2 个)

| # | 类型名 | 类型 | 主要字段/方法 | 源文件 |
|---|--------|------|---------------|--------|
| 16 | `AdversaryAgent` | Interface | config, challenge(files, context, existingIssues): Promise<AdversaryResult> | agent.ts |
| 17 | `Orchestrator` | Interface | run(request): Promise<ReviewReport> | agent.ts |

---

## 🎯 核心数据流

```
ReviewRequest (输入)
    ↓
    ├→ [Logic Agent] ─→ AgentResult
    ├→ [Security Agent] ─→ AgentResult
    ├→ [Performance Agent] ─→ AgentResult
    ├→ [Maintainability Agent] ─→ AgentResult
    ├→ [EdgeCases Agent] ─→ AgentResult
    └→ [Adversary Agent] ─→ AdversaryResult
    
所有结果 ─→ Result Merger
    ↓
ReviewReport (输出)
    ├→ issues: ReviewIssue[]
    ├→ summary: ReviewSummary
    │   ├→ bySeverity: SeverityCount
    │   └→ byDimension: Record<ReviewDimension, number>
    └→ metadata: ReviewMetadata
        └→ tokenUsage: TokenUsage
        
ReportGenerator
    ├→ toJSON(report)
    ├→ toMarkdown(report)
    └→ toFile(report, outputDir)
```

---

## 🧪 测试配置详解

### Jest 配置 (jest.config.js)

```javascript
{
  preset: 'ts-jest',                        // TypeScript 支持
  testEnvironment: 'node',                  // Node.js 环境
  testMatch: ['**/__tests__/**/*.test.ts'], // 测试文件模式
  collectCoverageFrom: [
    'src/**/*.ts',                          // 源文件
    '!src/**/*.d.ts',                       // 排除类型定义
    '!src/types/**',                        // 排除 types 目录
  ],
  forceExit: true,                          // 强制退出（防止挂起）
}
```

### 测试脚本

```bash
npm run test              # 运行一次
npm run test:watch       # 监听模式
npm run test:coverage    # 生成覆盖率报告
```

---

## 📦 模块职责

### types/ - 类型定义
- 所有类型的唯一真实来源
- 统一的导出接口
- 详细的 JSDoc 文档
- 类型安全保证

### agents/ - 审查 Agent
- 5 个维度的独立 Agent
- 1 个对抗审查 Agent
- Agent 运行器
- 问题校准器

### input/ - 输入处理
- 文件收集和读取
- Git Diff 解析
- 上下文增强
- 依赖处理

### output/ - 输出生成 ✓
- JSON 序列化
- Markdown 生成
- 文件输出
- 样式和格式化

### orchestrator/ - 编排器
- Agent 并行调度
- 结果合并去重
- Token 统计
- 流程管理

### skill/ - 技能集成
- API 集成
- CLI 支持

---

## 💡 关键发现

| 项目 | 状态 | 说明 |
|------|------|------|
| 类型系统 | ✅ | 17 个核心类型，完整且规范 |
| 模块结构 | ✅ | 6 个独立模块，职责清晰 |
| 构建配置 | ✅ | TypeScript 严格模式 |
| 测试框架 | ✅ | Jest 完整配置 |
| 输出模块 | ✅ | ReportGenerator 已实现 (316+461 行) |
| 代码质量 | ✅ | 声明文件、Source Maps、ESLint |

---

**报告时间**: 2026-04-15
**项目版本**: 0.1.0
