
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

**Current feature:** #7: Claude Code Skill 集成 -- 将整个 review 引擎封装为 Claude Code Skill，支持 /review 命令调用，处理参数解析、配置加载、进度反馈
**Steps:**
- 创建 skill 定义文件（skill.md 或对应格式），定义 /review 命令
- 实现参数解析: /review（默认审查 git diff）、/review path/to/file、/review --full src/（全目录扫描）、/review --fast（跳过对抗阶段）
- 实现配置文件支持: .inquisitor.json 或 .inquisitorrc，允许项目级自定义审查规则、忽略模式、severity 阈值
- 实现进度反馈: 审查过程中向用户输出阶段进度（正在分析输入... 正在并行审查... 正在对抗校验...）
- 实现入口文件: 将 skill 命令映射到 Orchestrator 调用

**Rules:**
- Do NOT remove or weaken existing tests
- Self-verify all features before considering them done
- Commit with descriptive messages
- Append progress summary to claude-progress.txt before exiting

