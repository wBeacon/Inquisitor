# Inquisitor - 对抗式高强度代码审查引擎

Inquisitor 是一个多维度对抗式代码审查引擎，设计为 AI 编码工具的子 Agent。支持 Claude Code、Cursor、Windsurf 等工具，通过 MCP Server 协议集成，让 vibe coder 在每次编码完成后自动启用严格的代码审查。

## 快速开始

### 前置条件

- Node.js 16+
- `ANTHROPIC_API_KEY` 环境变量已设置

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### 方式一：Claude Code 集成（推荐）

**第 1 步**：在项目根目录创建 `.claude/settings.json`（如已存在则合并内容）：

```json
{
  "mcpServers": {
    "inquisitor": {
      "command": "npx",
      "args": ["inquisitor-mcp", "--stdio"],
      "description": "Inquisitor 对抗式高强度代码审查引擎"
    }
  }
}
```

**第 2 步**：重启 Claude Code，Inquisitor 的 `review_diff`、`review_files`、`configure` 工具将自动可用。

**第 3 步**：在对话中要求 Claude 审查代码：

```
请用 review_diff 工具审查我刚才的代码变更
```

**可选 - 配置自动触发 Hook**：将 `templates/claude-code-hooks.json` 的 hooks 部分合并到 `.claude/settings.json`，即可在每次 Write/Edit 操作后自动触发审查。

### 方式二：Cursor 集成

**第 1 步**：将 `templates/cursor-mcp.json` 复制到项目根目录的 `.cursor/mcp.json`：

```bash
mkdir -p .cursor
cp templates/cursor-mcp.json .cursor/mcp.json
```

或手动创建 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "inquisitor": {
      "command": "npx",
      "args": ["inquisitor-mcp", "--stdio"],
      "description": "Inquisitor 对抗式高强度代码审查引擎"
    }
  }
}
```

**第 2 步**：将 `templates/cursor-rules.md` 的内容添加到项目的 Cursor Rules 中，指导 AI 在编码后自动调用审查。

**第 3 步**：重启 Cursor，Inquisitor 工具将自动可用。

### 方式三：Windsurf 集成

**第 1 步**：在 Windsurf 的 MCP 配置中添加 Inquisitor（参见 `templates/windsurf-rules.md`）。

**第 2 步**：将 `templates/windsurf-rules.md` 的规则内容添加到项目的 Windsurf Rules 中。

---

## 配置模板

`templates/` 目录提供了各工具的配置模板：

| 文件 | 用途 |
|------|------|
| `claude-code-hooks.json` | Claude Code PostToolUse hook，Write/Edit 后自动触发审查 |
| `claude-code-mcp.json` | Claude Code MCP Server 配置 |
| `cursor-mcp.json` | Cursor MCP Server 配置 |
| `cursor-rules.md` | Cursor Rules，指导 AI 编码后自动调用审查 |
| `windsurf-rules.md` | Windsurf Rules，指导 AI 编码后自动调用审查 |

---

## MCP 工具

Inquisitor MCP Server 暴露三个工具：

### review_diff

审查当前 git diff（暂存和未暂存的变更）。

```
工具名: review_diff
参数: 无（自动获取当前 git diff）
```

### review_files

审查指定文件列表。

```
工具名: review_files
参数: { "files": ["src/app.ts", "src/utils.ts"] }
```

### configure

查看或修改审查配置。

```
工具名: configure
参数: { "action": "get" }
参数: { "action": "set", "key": "severityThreshold", "value": "medium" }
```

---

## 核心特性

### 5 个独立审查维度

- **Logic Agent**: 算法正确性、控制流、数据流分析
- **Security Agent**: 注入攻击、权限提升、数据泄露检测
- **Performance Agent**: 时间/空间复杂度、资源泄露分析
- **Maintainability Agent**: 代码结构、命名规范、耦合度评估
- **EdgeCase Agent**: 空值处理、溢出、并发、异常边界

### 多轮对抗式审查

- AdversaryAgent 以全新视角挑战所有维度审查结果
- 支持迭代式多轮对抗，每轮累积发现直到收敛
- 有效发现遗漏问题并过滤误报

### Meta-Reviewer 终审

- 在所有审查完成后从整体视角评估
- 根因分析：关联多个 issue 到共同根因
- 质量评级：A/B/C/D 四级评分体系
- 最终裁决：支持驳回误判和提升优先级

### 项目上下文感知

- 自动检测 ESLint、EditorConfig、TSConfig 等配置
- 将项目规范注入审查上下文，减少误报

### 并行执行

- 5 个维度 Agent 通过 Promise.all() 并发执行
- 超时控制和错误隔离

---

## 架构

```
输入采集层 (GitDiffCollector / FileCollector / ContextEnricher)
    |
ReviewRequest (标准化格式)
    |
ReviewOrchestrator (编排器)
    |-- 阶段 1: 项目上下文采集
    |-- 阶段 2: 并行维度审查 (5 Agents)
    |-- 阶段 3: 多轮对抗审查 (AdversaryAgent)
    |-- 阶段 4: 校准合并 (去重 + 置信度调整)
    |-- 阶段 5: Meta-Review 终审
    |-- 阶段 6: 报告生成
    |
ReviewReport (JSON + Markdown)
```

---

## 项目级配置

在项目根目录创建 `.inquisitor.json` 自定义审查行为：

```json
{
  "severityThreshold": "low",
  "enableAdversary": true,
  "enableMetaReview": true,
  "maxAdversaryRounds": 3,
  "projectContext": {
    "enabled": true
  }
}
```

---

## 作为 TypeScript 库使用

```typescript
import { ReviewSkill } from './src/skill';

const skill = new ReviewSkill({
  model: 'claude-opus',
  enableAdversary: true,
});

// 审查 git diff
const result = await skill.execute('diff');

// 审查单个文件
const result = await skill.execute('file', './src/app.ts');

// 审查目录
const result = await skill.execute('directory', './src');
```

---

## 开发

```bash
npm install           # 安装依赖
npm run build         # TypeScript 编译
npm run typecheck     # 类型检查
npm test              # 运行全部测试
npm run test:coverage # 覆盖率报告
npm run lint          # ESLint 检查
```

---

## License

MIT
