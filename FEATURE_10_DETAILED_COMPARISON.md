# Feature #10 详细对比分析

## 📊 inferLanguage 映射表完整对比

### 基础映射（所有三个实现都有）
```
JavaScript系列:
  ✅ ts/tsx ↔ typescript
  ✅ js/jsx ↔ javascript

Python:
  ✅ py ↔ python

C-family:
  ✅ java ↔ java
  ✅ go ↔ go
  ✅ rb ↔ ruby
  ✅ rs ↔ rust
  ✅ cpp ↔ cpp
  ✅ c ↔ c
  ✅ h ↔ c
  ✅ cs ↔ csharp
  ✅ php ↔ php
  ✅ swift ↔ swift
  ✅ kt ↔ kotlin

Markup & Data:
  ✅ sql ↔ sql
  ✅ json ↔ json
  ✅ yaml/yml ↔ yaml
  ✅ xml ↔ xml
  ✅ html ↔ html

Styling:
  ✅ css ↔ css
  ✅ scss ↔ scss
  ✅ less ↔ less
```

### file-collector.ts 独有映射

```typescript
// JavaScript 现代格式
'.mjs': 'javascript',  // ECMAScript modules
'.cjs': 'javascript',  // CommonJS format

// Shell & Markdown
'.sh': 'bash',         // Shell scripts
'.md': 'markdown',     // Markdown documentation
```

**问题**: git-diff-collector 和 context-enricher 不支持这些格式！
- `.mjs` 文件会被映射到 'mjs' 或 'text'
- `.cjs` 文件会被映射到 'cjs' 或 'text'
- `.sh` 文件会被映射到 'sh' 或 'text'
- `.md` 文件会被映射到 'md' 或 'text'

---

## 🔍 扩展名提取方式对比

### 方式1: git-diff-collector & context-enricher
```typescript
private inferLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  
  const languageMap: Record<string, string> = { /* 25 items */ };
  return languageMap[ext] || ext || 'text';
}
```

**特点**:
- 使用 `split('.')` 手工提取
- 扩展名**不带点号**
- 回退: 如果 `ext` 为空，使用 `'text'`

**问题**:
- ❌ 对于 `file.tar.gz` 会只取 `'gz'`
- ❌ 对于 `file` (无扩展名) 会取 `''`，然后返回 `'text'`

---

### 方式2: file-collector
```typescript
import { extname } from 'path';

private inferLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  
  const languageMap: Record<string, string> = { /* 30 items, with dots */ };
  return languageMap[ext] || ext.slice(1) || 'text';
}
```

**特点**:
- 使用 Node.js 标准库 `extname()`
- 扩展名**带点号**
- 回退: `ext.slice(1)` 移除点号，保留原始后缀

**问题**:
- ❌ 对于 `file` (无扩展名) 会返回 `''`，然后返回 `'text'`
- ❌ `ext.slice(1)` 额外的字符串操作（性能微弱影响）

---

## 🧪 实际行为对比示例

| 文件名 | git-diff | file-collector | context-enricher | 预期 |
|--------|---------|-----------------|-----------------|------|
| `app.ts` | typescript | typescript | typescript | ✅ 一致 |
| `index.mjs` | mjs | javascript | mjs | ❌ 不一致 |
| `build.cjs` | cjs | javascript | cjs | ❌ 不一致 |
| `deploy.sh` | sh | bash | sh | ❌ 不一致 |
| `README.md` | md | markdown | md | ❌ 不一致 |
| `Makefile` | Makefile | Makefile | Makefile | ⚠️ 都不支持 |
| `file` (无扩) | text | text | text | ✅ 一致 |
| `config.yaml` | yaml | yaml | yaml | ✅ 一致 |

---

## 🔄 callClaudeAPI 差异分析

### 相同点
```
✅ 都使用 Anthropic SDK
✅ 都创建新的client实例（隔离无状态）
✅ 都调用 client.messages.create()
✅ 都追踪 token 使用量
✅ 都返回字符串响应
```

### 不同点

#### 温度参数 (temperature)
| 参数 | AdversaryAgent | AgentRunner | 用途 |
|------|---------------|------------|------|
| temperature | 0.7 (默认) | 0.5 (默认) | 控制创意程度 |

**含义**:
- **0.5**: 更保守、一致的输出（适合稳定的代码审查）
- **0.7**: 更创意、多样的输出（适合寻找新问题）

**问题**: 🟡 文档中没有说明为什么选择这些值

---

## 📝 JSON 解析对比表

### 完整流程对比

```
AdversaryAgent                          AgentRunner
├─ parseAdversaryResponse()            ├─ parseJsonResponse()
│  ├─ 移除 code fence                 │  ├─ 移除 code fence
│  ├─ 提取 { ... }                    │  ├─ 提取 [ ... ]
│  ├─ 移除 trailing commas             │  ├─ 移除 trailing commas
│  ├─ JSON.parse()                     │  ├─ JSON.parse()
│  │  ├─ 成功 ✓                       │  │  ├─ 成功 ✓
│  │  │   └─ validateNewIssues()      │  │  │   └─ validateAndFixIssues()
│  │  │   └─ validateJudgments()      │  │  │
│  │  └─ 失败 ✗                       │  │  └─ 失败 ✗
│  │      └─ 降级处理（单引号）       │  │      └─ 降级处理（单引号）
│  │          └─ JSON.parse()         │  │          └─ JSON.parse()
│  │              ├─ 成功 ✓           │  │              ├─ 成功 ✓
│  │              │   └─ validate()   │  │              │   └─ validate()
│  │              └─ 失败 ✗           │  │              └─ 失败 ✗
│  │                  └─ 抛异常        │  │                  └─ 返回[]
│  └─ 返回对象                       │  └─ 返回数组
│     { newIssues, issueJudgments }  │     ReviewIssue[]
```

### 错误处理差异

**AdversaryAgent**:
```typescript
// 最终失败时抛异常
throw new Error(`Failed to parse adversary response: ...`);

// 在 challenge() 中被捕获，触发 graceful degradation
// 返回 success: false
```

**AgentRunner**:
```typescript
// 最终失败时返回空数组
return [];

// 在 review() 中继续正常流程
// 返回 success: true（虽然没有issue）
```

---

## 🧩 验证逻辑对比

### AdversaryAgent 验证
```typescript
// 验证新问题
validateNewIssues(rawIssues): ReviewIssue[] {
  // 检查: file(string) ✓, line(number>0) ✓, description ✓, suggestion ✓
  // 强制: dimension = 'adversary-found'
  // 验证: severity, confidence 范围
  // 可选: endLine, codeSnippet
}

// 验证判断
validateJudgments(rawJudgments, existingCount): IssueJudgment[] {
  // 检查: existingIssueIndex 在范围内 ✓
  // 检查: judgment 为 confirmed/disputed/false_positive ✓
  // 检查: reason 非空 ✓
  // 可选: suggestedConfidenceAdjustment, suggestedSeverityAdjustment
}
```

### AgentRunner 验证
```typescript
// 验证所有issue
validateAndFixIssues(rawIssues): ReviewIssue[] {
  // 检查: file(string) ✓, line(number>0) ✓, description ✓, suggestion ✓
  // 强制: dimension = config.dimension
  // 验证: severity, confidence 范围
  // 可选: endLine, codeSnippet, foundBy
}
```

**关键差异**:
- ❌ AdversaryAgent 还需要验证 issueJudgments（包含额外的复杂逻辑）
- ❌ AdversaryAgent 强制 dimension = 'adversary-found'
- ✅ AgentRunner 简单一些，只验证 issues 数组

---

## 🔐 测试覆盖差异

### AdversaryAgent 测试覆盖
✅ 配置验证 (6 tests)
✅ 隔离上下文 (1 test)
✅ 判断类型 (1 test)
✅ adversary-found标记 (1 test)
✅ API调用 (2 tests)
✅ 错误处理 (8 tests)
✅ 特殊格式处理 (3 tests)

**总计**: 22 tests，覆盖率 ⭐⭐⭐⭐⭐

---

### inferLanguage 测试覆盖

❌ **完全缺失专项测试**

虽然在以下测试中有间接覆盖：
- git-diff-collector.test.ts: 1个间接测试（仅go）
- file-collector.test.ts: 6个间接测试（ts/js/py/go/json/css）
- context-enricher.test.ts: 间接覆盖

**问题**: 
- ❌ 没有测试 .mjs/.cjs/.sh/.md
- ❌ 没有测试所有25个映射项
- ❌ 没有测试边界值（无扩展名、多点文件等）
- ❌ 没有测试回退值逻辑

---

### AgentRunner 测试覆盖

❌ **缺失直接测试**

- AgentRunner 是抽象类，理论上通过子类测试验证
- 需要查看 dimension-agents.test.ts

**推测问题**:
- ❌ 可能没有测试基类的 callClaudeAPI()
- ❌ 可能没有测试 parseJsonResponse()
- ❌ 可能没有测试 validateAndFixIssues()

---

## 📋 迁移建议

### 第1阶段: 创建 Utility 模块
```typescript
// src/utils/language-detector.ts
export interface LanguageDetectorOptions {
  includeModernJs?: boolean;  // 是否支持 .mjs, .cjs
  includeShell?: boolean;     // 是否支持 .sh
  includeMarkdown?: boolean;  // 是否支持 .md
}

export class LanguageDetector {
  static detect(filePath: string, options?: LanguageDetectorOptions): string {
    // 统一实现
  }
  
  static getLanguageMap(options?: LanguageDetectorOptions): Record<string, string> {
    // 返回完整的映射表
  }
}
```

### 第2阶段: 迁移现有代码
```typescript
// git-diff-collector.ts
import { LanguageDetector } from '../utils/language-detector';

private inferLanguage(filePath: string): string {
  return LanguageDetector.detect(filePath, {
    includeModernJs: false,  // 保持向后兼容
  });
}

// file-collector.ts
private inferLanguage(filePath: string): string {
  return LanguageDetector.detect(filePath, {
    includeModernJs: true,
    includeShell: true,
    includeMarkdown: true,
  });
}

// context-enricher.ts
private inferLanguage(filePath: string): string {
  return LanguageDetector.detect(filePath, {
    includeModernJs: false,
  });
}
```

### 第3阶段: 添加测试
```typescript
// __tests__/utils/language-detector.test.ts
describe('LanguageDetector', () => {
  describe('基础映射', () => {
    // 测试所有25个基础映射
  });
  
  describe('现代JS支持', () => {
    // 测试 .mjs, .cjs
  });
  
  describe('Shell & Markdown', () => {
    // 测试 .sh, .md
  });
  
  describe('边界值', () => {
    // 无扩展名、多点、未知扩展名
  });
});
```

---

## 🎯 优先级排序

| 优先级 | 任务 | 影响 | 工作量 |
|--------|------|------|--------|
| P0 🔴 | 修复 inferLanguage 不一致 | 高 | 中 |
| P1 🟠 | 添加 inferLanguage 测试 | 高 | 小 |
| P2 🟠 | 标准化 JSON 解析 | 中 | 大 |
| P3 🟡 | 添加 AgentRunner 测试 | 中 | 中 |
| P4 🟡 | 文档化参数差异 | 低 | 小 |

---

## 📚 参考资源

- TypeScript strict mode: 编译时检查不严格类型
- Node.js path.extname(): 标准库方法
- Jest coverage: 测试覆盖率报告
- Anthropic SDK temperature: 0.0-1.0, 默认0.5

