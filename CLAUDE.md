# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Inquisitor 是一个对抗式高强度代码审查引擎，设计为供 Agent 调用的 sub-agent。核心思想：多个维度 Agent 并行审查代码，再由对抗 Agent (Adversary) 挑战审查结果、寻找遗漏，直到找不到问题为止。

## 常用命令

```bash
npm run build          # TypeScript 编译 (tsc)
npm run typecheck      # 类型检查 (tsc --noEmit)
npm test               # 运行全部测试 (Jest)
npm test -- --testPathPattern="agents"   # 运行匹配路径的测试
npm test -- __tests__/agents/adversary-agent.test.ts  # 运行单个测试文件
npm run test:coverage  # 运行测试并生成覆盖率报告
npm run lint           # ESLint 检查 src/
```

Jest 配置: `ts-jest` preset，测试文件匹配 `**/__tests__/**/*.test.ts`，路径别名 `@/` -> `src/`。

## 架构

审查流程由 `ReviewOrchestrator` 编排，五个阶段顺序执行：

1. **输入采集** (`src/input/`) - `GitDiffCollector` 解析 git diff，`FileCollector` 扫描文件/目录，`ContextEnricher` 补充上下文
2. **并行维度审查** (`src/agents/`) - 5 个维度 Agent (Logic/Security/Performance/Maintainability/EdgeCase) 通过 `ParallelScheduler` 并发执行，每个调用 Claude API 独立审查
3. **对抗审查** (`src/agents/adversary-agent.ts`) - `AdversaryAgent` 接收所有维度结果，以全新视角寻找遗漏并挑战误报
4. **校准合并** (`src/orchestrator/result-merger.ts`, `src/agents/issue-calibrator.ts`) - 去重、合并、根据对抗结果调整置信度，按 `severityThreshold` 过滤
5. **报告生成** (`src/output/`) - `ReportGenerator` 输出 JSON 和 Markdown 双格式报告

### 关键类继承关系

- `AgentRunner` (抽象基类) - 封装 Claude API 调用、超时控制、JSON 响应解析、issue 校验修正
  - `LogicAgent` / `SecurityAgent` / `PerformanceAgent` / `MaintainabilityAgent` / `EdgeCaseAgent` - 各维度具体 Agent
  - `AdversaryAgent` - 继承 AgentRunner，额外提供 `challenge()` 方法

### Skill 集成层 (`src/skill/`)

- `ReviewSkill` - 封装完整审查流程，对外暴露 `execute(params)` 接口
- `review-command.ts` - 解析 `/review` 命令行参数
- `config-loader.ts` - 加载项目根目录的 `.inquisitor.json` 配置文件
- `progress-reporter.ts` - 审查进度回调

### 共享工具 (`src/utils/`)

- `language-util.ts` - 统一的文件扩展名到语言映射（消除了三处重复实现）
- `severity.ts` - severity 级别比较工具

## 类型系统 (`src/types/`)

核心类型定义在 `review.ts` 和 `agent.ts` 中：
- `ReviewRequest` / `ReviewReport` / `ReviewIssue` - 审查输入输出
- `ReviewDimension` 枚举: logic / security / performance / maintainability / edge_cases / adversary-found
- `Severity`: critical > high > medium > low
- `AgentConfig` / `AgentResult` / `AdversaryResult` - Agent 配置和结果

## 开发规则

- 不要移除或弱化已有测试
- 所有代码注释使用中文
- 所有对话使用中文
- 不使用 emoji

---

## Claude-Forever Harness Context

This project is managed by claude-forever, an autonomous coding harness.
IMPORTANT files to read at the start of each session:
- `claude-progress.txt` — session-by-session progress log (READ first, APPEND when done)
- `git log --oneline -10` — recent commit history

**Completed features:**
- [x] Feature #1: 项目脚手架与核心类型系统
- [x] Feature #2: 输入采集层 (Git diff 解析器 + 文件/目录扫描器)
- [x] Feature #3: 维度审查 Agent 系统 (5 个独立维度 Agent)
- [x] Feature #4: 对抗式 Adversary Agent
- [x] Feature #5: 编排器 (Orchestrator)
- [x] Feature #6: 输出层与报告生成 (JSON + Markdown)
- [x] Feature #7: Claude Code Skill 集成 (/review 命令)
- [x] Feature #8: severityThreshold 过滤与死代码清理
- [x] Feature #9: Timer 泄漏修复与 execSync 安全加固
- [x] Feature #10: inferLanguage 去重与 AdversaryAgent 继承重构

**Current feature:** None - All core features completed. Ready for optimization/enhancement phase.

**Rules:**
- Do NOT remove or weaken existing tests
- Self-verify all features before considering them done
- Commit with descriptive messages
- Append progress summary to claude-progress.txt before exiting
