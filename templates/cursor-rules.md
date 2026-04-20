# Inquisitor 自动审查规则 - Cursor

本规则指导 Cursor AI 在每次编码完成后自动调用 Inquisitor MCP 工具进行严格的代码审查。

## 规则

### 编码后自动审查

每次完成编码任务（包括新增功能、修复 Bug、重构代码）后，**必须**调用 Inquisitor 进行代码审查：

1. **After code changes**：当你完成了对代码文件的修改后，立即调用 `review_diff` 工具审查本次变更的 git diff。
2. **审查新文件**：如果新增了文件且尚无 git diff（未提交），使用 `review_files` 工具，传入新增文件的路径列表。
3. **处理审查结果**：
   - 对于 severity 为 `critical` 或 `high` 的问题，**必须**立即修复。
   - 对于 severity 为 `medium` 的问题，向用户说明并建议修复。
   - 对于 severity 为 `low` 的问题，记录但不强制修复。
4. **修复后复审**：修复了审查问题后，再次调用 `review_diff` 确认问题已解决。

### 可用的 Inquisitor MCP 工具

- `review_diff` - 审查当前 git diff（暂存和未暂存的变更）
- `review_files` - 审查指定文件列表，参数: `{ "files": ["path/to/file.ts"] }`
- `configure` - 查看或修改审查配置，参数: `{ "action": "get" }` 或 `{ "action": "set", "key": "severityThreshold", "value": "medium" }`

### 配置建议

在项目根目录创建 `.inquisitor.json` 可自定义审查行为：

```json
{
  "severityThreshold": "low",
  "enableAdversary": true,
  "enableMetaReview": true,
  "maxAdversaryRounds": 3
}
```

### 注意事项

- 审查可能需要 1-3 分钟，请耐心等待完成。
- 确保已设置 `ANTHROPIC_API_KEY` 环境变量。
- Inquisitor 会并行运行 5 个维度的审查 Agent，不需要担心 token 成本。
