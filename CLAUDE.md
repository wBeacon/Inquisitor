
---
# Claude-Forever Harness Context

This project is managed by claude-forever, an autonomous coding harness.
IMPORTANT files to read at the start of each session:
- `claude-progress.txt` — session-by-session progress log (READ first, APPEND when done)
- `git log --oneline -10` — recent commit history

**Goal:** 我想做一个高强度review代码的工具，给Agent使用，它需要完全不在意消耗的token，只为找到代码的任何问题。
这个工具我想可以以sub-agent的形式存在，或者你可以有更好的想法。
该工具每次review的时候应该和调用它的Agent有隔离的上下文，以避免上下文带来的影响，以找到更深层的bug。

如果你想参考业内最高水平的实现，可以看这几个方向：
CodeRabbit / Qodo (原 CodiumAI)： 它们通过分析 AST（抽象语法树）结合 LLM，不是只读 diff，而是理解整棵代码树。
Claude Code (Anthropic) 的子任务模式： Claude Code 在处理复杂任务时，会启动独立的子任务进程去“探索”和“校验”，主进程只负责编排。
SWE-bench 冠军方案（如 OpenHands/Devin）： 它们通常包含一个 Verifier Agent。这个 Agent 的唯一任务是证明 Code Agent 写的代码是错的，直到它找不到错为止。

我的想法就是像最后一个方向一样，证明CodeAgent写的代码是错的，直到它找不到错位置。
工具可以只负责review不负责修改，也可以同时负责修改并再次进入review-修改的循环，这个你可以定或者我们先讨论再定。

**Completed features:**
- [x] Feature #1: 项目脚手架与核心类型系统 -- 建立 TypeScript 项目结构、定义所有核心接口（ReviewRequest、ReviewIssue、ReviewReport 等），以及 review 维度枚举（逻辑正确性、安全性、性能、可维护性、边界情况）
- [x] Feature #2: 输入采集层 -- 实现 Git diff 解析器和文件/目录扫描器，能将待审查代码转化为结构化的 ReviewRequest，包含变更代码及其周围上下文
- [x] Feature #3: 维度审查 Agent 系统 -- 实现多个独立的维度审查 Agent，每个 Agent 专注一个审查维度，拥有独立的 system prompt 和审查策略，通过 Claude Code 的 Agent tool 以隔离上下文运行
- [x] Feature #4: 对抗式 Adversary Agent -- 实现独立的对抗审查器，接收所有维度 Agent 的审查结果，以全新视角重新审视代码，专门寻找被遗漏的问题并挑战已有结论中的误报
- [x] Feature #5: 编排器 (Orchestrator) -- 实现整个 review 流程的编排逻辑: 采集输入 -> 并行维度审查 -> 对抗审查 -> 去重校准 -> 生成报告
- [x] Feature #6: 输出层与报告生成 -- 实现 JSON 和 Markdown 双格式报告生成器，JSON 供 CodeAgent 程序化消费，Markdown 供人类阅读
- [x] Feature #7: Claude Code Skill 集成 -- 将整个 review 引擎封装为 Claude Code Skill，支持 /review 命令调用，处理参数解析、配置加载、进度反馈
- [x] Feature #8: 实现 severityThreshold 过滤与清理死代码 -- config-loader 加载的 severityThreshold 从未在审查流程中生效，review-orchestrator.ts 是被 orchestrator.ts 替代的遗留文件（0% 覆盖率）。需要：(1) 在 Orchestrator 或 ReportGenerator 中根据 severityThreshold 过滤低于阈值的问题；(2) 删除 review-orchestrator.ts 死代码；(3) 清理 config.dimensions/formats 字段在 ReviewSkill 中的透传逻辑
- [x] Feature #9: 修复 Timer 泄漏与加固 execSync 安全性 -- ParallelScheduler.createTimeoutPromise 创建的 setTimeout 在任务正常完成后不会被清除，导致 Timer 泄漏（Jest 报告 detectOpenHandles）。GitDiffCollector.getDiffOutput 使用 execSync 拼接 ref 参数，存在命令注入风险（如 ref='HEAD; rm -rf /'）。需要：(1) 使用 AbortController 或手动 clearTimeout 清理已完成任务的定时器；(2) 对 git ref 参数进行白名单校验

**Current feature:** #10: 消除 inferLanguage 三处重复实现与 AdversaryAgent/AgentRunner 代码重复 -- inferLanguage 在 GitDiffCollector、FileCollector、ContextEnricher 三处各自维护一份语言映射表，维护成本高且容易不一致。AdversaryAgent 独立重写了 callClaudeAPI 和 JSON 解析逻辑而非继承 AgentRunner。需要：(1) 抽取共享 language-util 模块；(2) 让 AdversaryAgent 继承 AgentRunner 复用 API 调用和解析能力

**Rules:**
- Do NOT remove or weaken existing tests
- Self-verify all features before considering them done
- Commit with descriptive messages
- Append progress summary to claude-progress.txt before exiting

