# Feature #10 Sprint Contract - 执行摘要

**生成日期**: 2026-04-16  
**分析范围**: inferLanguage、AdversaryAgent、AgentRunner 的现有实现

---

## 🎯 核心发现

### 1️⃣ inferLanguage 三处重复实现 + 不一致

**问题等级**: 🔴 **高**

#### 位置

```
src/input/git-diff-collector.ts      (251-283 行)
src/input/file-collector.ts          (253-289 行)
src/input/context-enricher.ts        (201-233 行)
```

#### 关键差异

| 特征 | git-diff | file-collector | context-enricher |
|------|---------|-----------------|-----------------|
| 映射项 | 25 | **30** | 25 |
| 支持 .mjs | ❌ | ✅ | ❌ |
| 支持 .cjs | ❌ | ✅ | ❌ |
| 支持 .sh | ❌ | ✅ | ❌ |
| 支持 .md | ❌ | ✅ | ❌ |

#### 影响

同一个 `.mjs` 文件输出会不一致：
```
git-diff-collector.ts    → "mjs" 或 "text"
file-collector.ts        → "javascript"  ✓
context-enricher.ts      → "mjs" 或 "text"
```

#### 建议

🔧 **提取统一的 Utility**: `src/utils/language-detector.ts`
- 包含完整的映射表（30+ 项）
- 支持选项控制现代JS/Shell/Markdown支持
- 添加专项单元测试

---

### 2️⃣ AdversaryAgent vs AgentRunner JSON 解析差异

**问题等级**: 🔴 **高**

#### 差异维度

| 维度 | AdversaryAgent | AgentRunner | 影响 |
|------|---|---|---|
| **提取目标** | `{ ... }` | `[ ... ]` | 🔴 完全不同 |
| **返回类型** | 对象 | 数组 | 🔴 API差异 |
| **错误处理** | 抛异常 | 返回空数组 | 🟠 行为不一致 |
| **验证方法** | 两个validator | 一个validator | 🟡 复杂度差异 |

#### 具体例子

**输入**: 
```json
{ "newIssues": [...], "issueJudgments": [...] }
```

**AdversaryAgent 解析**:
```typescript
parseAdversaryResponse(rawText) {
  // 提取 { ... } ← 对象
  // JSON.parse() 
  // → { newIssues, issueJudgments } ✓
}
```

**AgentRunner 解析**:
```typescript
parseJsonResponse(rawText) {
  // 提取 [ ... ] ← 数组
  // JSON.parse() 
  // → ReviewIssue[] ✓
}
```

#### 建议

🔧 **创建统一的 JSON Parser Utility**: `src/utils/json-parser.ts`
- 支持对象和数组两种格式
- 统一的错误处理策略
- 可配置的回退处理

---

### 3️⃣ 测试覆盖缺陷

**问题等级**: 🟠 **中**

#### inferLanguage 专项测试缺失

❌ **完全没有专项测试**

虽然有间接覆盖：
```
git-diff-collector.test.ts    1个  (仅 .go)
file-collector.test.ts         6个  (ts/js/py/go/json/css)
context-enricher.test.ts      间接  (依赖文件)
```

**问题**:
- 没有测试所有 30+ 个映射项
- 没有测试 .mjs, .cjs, .sh, .md
- 没有测试边界值
- 没有测试回退值逻辑

#### AgentRunner 基类测试缺失

❌ **可能没有直接测试**

AgentRunner 是抽象类，通常通过子类测试验证，但：
- 不清楚是否测试了 `callClaudeAPI()`
- 不清楚是否测试了 `parseJsonResponse()`
- 不清楚是否测试了 `validateAndFixIssues()`

#### 建议

✅ 添加 comprehensive 测试套件：
```
__tests__/utils/language-detector.test.ts
  ├─ 基础映射 (25 tests)
  ├─ 现代JS支持 (2 tests)
  ├─ Shell & Markdown (2 tests)
  └─ 边界值 (5 tests)
  总计: 34 tests

__tests__/utils/json-parser.test.ts
  ├─ 对象解析 (10 tests)
  ├─ 数组解析 (10 tests)
  └─ 错误处理 (10 tests)
  总计: 30 tests
```

---

### 4️⃣ API 调用参数差异

**问题等级**: 🟡 **低**

#### 温度参数

```typescript
AdversaryAgent:  temperature = 0.7  (鼓励创意思考)
AgentRunner:     temperature = 0.5  (保守输出)
```

**原因**:
- AdversaryAgent 需要寻找新问题 → 更高的创意度
- AgentRunner 需要稳定输出 → 更低的创意度

**建议**:
- 📝 在文档中明确说明这个差异
- 考虑配置化这些参数

---

## 📊 现有实现质量评分

| 组件 | 代码质量 | 测试覆盖 | 文档 | 总体 |
|------|---------|---------|------|------|
| AdversaryAgent | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 🟢 优秀 |
| AgentRunner | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | 🟡 良好 |
| inferLanguage | ⭐⭐⭐ | ⭐ | ⭐ | 🔴 需改进 |
| JSON 解析 | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | 🟡 需改进 |

---

## 📋 Sprint Tasks (优先级)

### P0 🔴 关键 (Sprint 内必须完成)

- [ ] **Task 1.1**: 创建 `LanguageDetector` utility 类
  - 工作量: 2-3 小时
  - 测试: 34 个 tests
  
- [ ] **Task 1.2**: 迁移三个文件使用新 utility
  - 工作量: 1-2 小时
  - 回归: 运行现有所有测试

### P1 🟠 高 (Sprint 内完成最好)

- [ ] **Task 2.1**: 添加 inferLanguage 专项测试
  - 工作量: 1-2 小时
  - 涵盖: 34 个测试用例

- [ ] **Task 2.2**: 标准化 JSON 解析逻辑
  - 工作量: 3-4 小时
  - 创建: `JsonParser` utility
  - 测试: 30 个测试用例

### P2 🟡 中 (后续 Sprint)

- [ ] **Task 3.1**: 添加 AgentRunner 基类测试
  - 工作量: 2-3 小时
  
- [ ] **Task 3.2**: 文档化参数差异
  - 工作量: 1 小时

---

## 🔐 质量检查清单

完成后验证：

- [ ] 所有现有测试通过 (`npm test`)
- [ ] 代码覆盖率 ≥ 85% (`npm run test:coverage`)
- [ ] TypeScript 严格检查通过 (`npm run typecheck`)
- [ ] 类型定义完整 (no `any` in utils)
- [ ] 文档已更新
- [ ] 迁移指南已编写

---

## 📞 风险评估

### 低风险 ✅

✅ inferLanguage 提取为 utility
- 改动仅涉及三个文件
- 改动是向后兼容的（默认行为不变）
- 现有测试可直接复用

✅ 添加新测试
- 不修改现有代码
- 纯增加测试用例

### 中风险 ⚠️

⚠️ JSON 解析标准化
- 需要修改两个关键组件的解析逻辑
- 需要仔细的回归测试
- 建议: 分阶段迁移，先创建新 utility，再逐步切换

### 高风险 ❌

❌ 无

---

## 💡 额外建议

### 1. 创建配置文件

```typescript
// src/config/language-config.ts
export const LANGUAGE_CONFIG = {
  modernJs: {
    extensions: ['.mjs', '.cjs'],
    default: false,
  },
  shell: {
    extensions: ['.sh', '.bash'],
    default: false,
  },
  markdown: {
    extensions: ['.md', '.markdown'],
    default: false,
  },
};
```

### 2. 创建性能基准

```bash
npm run bench:language-detector
npm run bench:json-parser
```

### 3. 更新 CHANGELOG

```markdown
## [0.2.0] - 2026-04-XX

### Added
- New `LanguageDetector` utility for consistent language inference
- New `JsonParser` utility for robust JSON parsing
- Comprehensive test coverage for utilities

### Changed
- Refactored `GitDiffCollector`, `FileCollector`, `ContextEnricher` 
  to use new `LanguageDetector`
- Improved error handling in JSON parsing

### Fixed
- Fixed inconsistent language detection across input modules
```

---

## 📚 相关文档

详细分析请查看:
- [`FEATURE_10_ANALYSIS.md`](./FEATURE_10_ANALYSIS.md) - 完整分析报告
- [`FEATURE_10_DETAILED_COMPARISON.md`](./FEATURE_10_DETAILED_COMPARISON.md) - 详细对比表

---

## ✅ 签核

- **分析完成日期**: 2026-04-16
- **分析范围**: 完整
- **建议可执行性**: 高
- **预估工作量**: 15-20 小时 (P0 + P1 tasks)

---

**下一步**: 与项目负责人评审此文档，确认 Sprint 计划
