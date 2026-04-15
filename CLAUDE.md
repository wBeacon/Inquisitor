
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

**Current feature:** #3: 维度审查 Agent 系统 -- 实现多个独立的维度审查 Agent，每个 Agent 专注一个审查维度，拥有独立的 system prompt 和审查策略，通过 Claude Code 的 Agent tool 以隔离上下文运行
**Steps:**
- 实现 AgentRunner: 封装 Claude Code Agent tool 调用，确保每个 agent 在独立上下文中运行
- 实现 LogicAgent: 专注逻辑正确性 -- 控制流错误、off-by-one、空值处理、类型不匹配、竞态条件
- 实现 SecurityAgent: 专注安全漏洞 -- 注入、XSS、权限绕过、敏感信息泄露、不安全的依赖
- 实现 PerformanceAgent: 专注性能问题 -- N+1 查询、内存泄漏、不必要的计算、阻塞操作
- 实现 MaintainabilityAgent: 专注可维护性 -- 代码重复、过度复杂度、命名不当、缺失错误处理、违反 SOLID
- 实现 EdgeCaseAgent: 专注边界情况 -- 空输入、超大输入、并发场景、网络失败、磁盘满
- 每个 Agent 的 prompt 中明确要求: 以'证明代码是错的'为目标，必须给出具体的触发条件和复现步骤

**Rules:**
- Do NOT remove or weaken existing tests
- Self-verify all features before considering them done
- Commit with descriptive messages
- Append progress summary to claude-progress.txt before exiting

