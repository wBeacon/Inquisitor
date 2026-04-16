# Feature #10 - Sprint Contract 系统分析报告

生成日期: 2026-04-16

## 1. inferLanguage 重复实现分析

### 1.1 三处实现位置

| 位置 | 文件路径 | 行号 | 方法签名 |
|------|--------|------|--------|
| 位置1 | `src/input/git-diff-collector.ts` | 251-283 | 私有方法，无参数 |
| 位置2 | `src/input/file-collector.ts` | 253-289 | 私有方法，无参数 |
| 位置3 | `src/input/context-enricher.ts` | 201-233 | 私有方法，无参数 |

### 1.2 语言映射表内容对比

#### git-diff-collector.ts (251-283)
```typescript
const languageMap: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  java: 'java',
  go: 'go',
  rb: 'ruby',
  rs: 'rust',
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  sql: 'sql',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
};
```
**特点**: 扩展名不带点号；共 25 项映射

---

#### file-collector.ts (253-289)
```typescript
const languageMap: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.cpp': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.cs': 'csharp',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.sql': 'sql',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.sh': 'bash',
  '.md': 'markdown',
};
```
**特点**: 扩展名带点号；共 30 项映射；**新增映射**: `.mjs`, `.cjs`, `.sh`, `.md`

---

#### context-enricher.ts (201-233)
```typescript
const languageMap: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  java: 'java',
  go: 'go',
  rb: 'ruby',
  rs: 'rust',
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  sql: 'sql',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
};
```
**特点**: 扩展名不带点号；共 25 项映射；与git-diff-collector完全相同

---

### 1.3 差异总结

| 差异维度 | git-diff-collector | file-collector | context-enricher |
|---------|------------------|-----------------|-----------------|
| **扩展名格式** | 无点号 | 带点号 | 无点号 |
| **映射项数** | 25 | 30 | 25 |
| **特有映射** | 无 | `.mjs`, `.cjs`, `.sh`, `.md` | 无 |
| **提取方式** | `filePath.split('.').pop()?.toLowerCase()` | `extname(filePath).toLowerCase()` | `filePath.split('.').pop()?.toLowerCase()` |
| **回退值** | `ext \|\| 'text'` | `ext.slice(1) \|\| 'text'` | `ext \|\| 'text'` |

### 1.4 问题清单

❌ **不一致性1**: 映射表有3-5项差异（`.mjs`, `.cjs`, `.sh`, `.md`）
- file-collector 支持更多现代JS格式，但其他两个不支持
- 这会导致同一个`.mjs`文件在不同输入模块中得到不同的语言标记

❌ **不一致性2**: 扩展名格式差异导致逻辑差异
- git-diff-collector/context-enricher: 使用 `split('.')` 获取无点号的后缀
- file-collector: 使用 Node.js 标准 `extname()` 获取带点号的后缀
- 两种方式会导致回退值逻辑不同

❌ **不一致性3**: 回退值处理差异
- git-diff-collector/context-enricher: 如果ext为空或取到'',则返回'text'
- file-collector: `ext.slice(1)` 可能导致额外的字符串操作

---

## 2. AdversaryAgent vs AgentRunner API 调用和 JSON 解析对比

### 2.1 API 调用方式

#### AdversaryAgent (130-157行)
```typescript
private async callClaudeAPI(userMessage: string): Promise<string> {
  const client = new Anthropic();
  
  const response = await client.messages.create({
    model: this.config.model || 'claude-sonnet-4-20250514',
    max_tokens: this.config.maxTokens || 4000,
    temperature: this.config.temperature || 0.7,
    system: this.config.systemPrompt,
    messages: [{
      role: 'user',
      content: userMessage,
    }],
  });

  this._lastTokenUsage = {
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
    total: response.usage.input_tokens + response.usage.output_tokens,
  };

  const textContent = response.content.find((block) => block.type === 'text');
  return textContent ? textContent.text : '';
}
```

**特点**:
- 每次调用创建新客户端实例 ✓
- 温度参数默认 **0.7** (略高，鼓励创意)
- 返回纯字符串响应

---

#### AgentRunner (82-109行)
```typescript
protected async callClaudeAPI(userMessage: string): Promise<string> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: this.config.model || 'claude-sonnet-4-20250514',
    max_tokens: this.config.maxTokens || 4000,
    temperature: this.config.temperature || 0.5,
    system: this.config.systemPrompt,
    messages: [{
      role: 'user',
      content: userMessage,
    }],
  });

  this._lastTokenUsage = {
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
    total: response.usage.input_tokens + response.usage.output_tokens,
  };

  const textContent = response.content.find((block) => block.type === 'text');
  return textContent ? textContent.text : '';
}
```

**特点**:
- 每次调用创建新客户端实例 ✓
- 温度参数默认 **0.5** (标准值)
- 返回纯字符串响应

---

### 2.2 JSON 解析逻辑对比

#### AdversaryAgent (230-274行)
**独立实现**: `parseAdversaryResponse(rawText, existingIssues)`

解析步骤:
1. 移除markdown code fence (`​```json...````)
2. 尝试提取JSON对象 (`{...}`)
3. 移除trailing commas
4. 尝试直接 JSON.parse()
5. 降级: 单引号转双引号 + 添加引号到属性名
6. 返回 `{ newIssues, issueJudgments }` 对象

**问题处理**: 返回空数组或默认值

```typescript
private parseAdversaryResponse(
  rawText: string,
  existingIssues: ReviewIssue[]
): AdversaryReviewResponse {
  let text = rawText.trim();

  // 移除 markdown code fence
  const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeFenceMatch) {
    text = codeFenceMatch[1].trim();
  }

  // 尝试提取 JSON 对象
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    text = objectMatch[0];
  }

  // 移除 trailing commas
  text = text.replace(/,\s*([\]}])/g, '$1');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    // 尝试单引号替换
    try {
      const doubleQuoted = text
        .replace(/'/g, '"')
        .replace(/(\{|,)\s*(\w+)\s*:/g, '$1"$2":');
      parsed = JSON.parse(doubleQuoted);
    } catch {
      throw new Error(`Failed to parse adversary response: ${rawText.substring(0, 200)}`);
    }
  }

  const newIssues = this.validateNewIssues(parsed.newIssues);
  const issueJudgments = this.validateJudgments(parsed.issueJudgments, existingIssues.length);

  return { newIssues, issueJudgments };
}
```

---

#### AgentRunner (154-195行)
**基类实现**: `parseJsonResponse(rawText)`

解析步骤:
1. 移除markdown code fence
2. 尝试提取JSON数组 (`[...]`)
3. 移除trailing commas
4. 尝试直接 JSON.parse()
5. 降级: 单引号转双引号 + 添加引号到属性名
6. 验证并修复issue

**问题处理**: 返回空数组，不抛出异常

```typescript
protected parseJsonResponse(rawText: string): ReviewIssue[] {
  let text = rawText.trim();

  // 移除 markdown code fence
  const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeFenceMatch) {
    text = codeFenceMatch[1].trim();
  }

  // 尝试提取 JSON 数组（处理前后有多余文本的情况）
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    text = arrayMatch[0];
  }

  // 移除 trailing commas
  text = text.replace(/,\s*([\]}])/g, '$1');

  // 尝试直接解析
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return this.validateAndFixIssues(parsed);
    }
    return [];
  } catch {
    // 尝试将单引号替换为双引号
    try {
      const doubleQuoted = text
        .replace(/'/g, '"')
        .replace(/(\{|,)\s*(\w+)\s*:/g, '$1"$2":');
      const parsed = JSON.parse(doubleQuoted);
      if (Array.isArray(parsed)) {
        return this.validateAndFixIssues(parsed);
      }
    } catch {
      // 解析失败
    }
    return [];
  }
}
```

---

### 2.3 JSON 解析差异总结

| 维度 | AdversaryAgent | AgentRunner |
|------|---------------|------------|
| **提取目标** | JSON对象 `{}` | JSON数组 `[]` |
| **返回类型** | `AdversaryReviewResponse` | `ReviewIssue[]` |
| **错误处理** | 抛出异常→graceful degradation | 返回空数组 |
| **验证方法** | `validateNewIssues()` + `validateJudgments()` | `validateAndFixIssues()` |
| **维度处理** | 新问题强制设为 'adversary-found' | 强制设为config.dimension |

**关键差异**:
- ❌ **提取目标不同**: 一个提取对象，一个提取数组
- ❌ **错误处理策略不同**: 一个抛异常，一个吞掉异常返回空数组
- ❌ **验证逻辑差异**: 验证方法和参数检查不同

---

## 3. 现有测试覆盖情况

### 3.1 AdversaryAgent 测试 (__tests__/agents/adversary-agent.test.ts)

✅ **配置测试** (56-86行)
- 默认配置验证
- 自定义配置支持
- 系统提示内容验证
- 温度参数验证

✅ **隔离上下文测试** (89-107行)
- 验证不包含维度Agent prompt

✅ **判断类型测试** (110-167行)
- confirmed/disputed/false_positive 三种判断类型
- 非空reason验证
- confidenceAdjustment验证

✅ **adversary-found标记测试** (170-199行)
- 新问题使用'adversary-found'维度
- foundBy字段为'adversary-agent'

✅ **API调用测试** (202-246行)
- 正确参数验证
- Token使用追踪
- 模拟Claude API

✅ **错误处理与回退** (249-469行)
- API超时处理
- 格式错误的JSON响应
- Code fence包裹处理
- 不完整的entry处理
- 无效judgment处理
- 缺失issueJudgments数组处理
- 包含endLine和codeSnippet处理

**覆盖率**: 非常全面 ✓

---

### 3.2 GitDiffCollector 测试 (__tests__/input/git-diff-collector.test.ts)

✅ **Diff解析测试** (17-227行)
- 纯新增/删除/混合changes
- 多文件diff
- 多hunk同文件
- 空diff处理

✅ **语言推断测试** (212-227行)
- 各种扩展名的语言推断

✅ **ref安全验证** (243-287行)
- 命令注入防护 (`;`, `|`, `$()`, 反引号等)
- 合法ref通过 (HEAD, branch, tag, SHA等)

**问题**: 没有直接测试 `inferLanguage()` 的测试！
- ❌ 无专项测试验证inferLanguage的完整映射表
- ❌ 无测试验证所有25+个扩展名的正确映射

---

### 3.3 FileCollector 测试 (__tests__/input/file-collector.test.ts)

✅ **单文件收集** (22-55行)
- 单文件内容和语言推断
- 多种扩展名的语言验证

✅ **目录递归收集** (57-100行)
- 目录递归扫描
- node_modules/.git/dist排除
- 二进制文件排除

✅ **Glob模式** (102-128行)
- Glob模式匹配

✅ **错误处理** (130-136行)

**问题**: 同样缺少inferLanguage专项测试！
- ❌ 虽然有部分覆盖，但未全面测试所有30个映射项
- ❌ 无边界值测试 (无扩展名文件、多点文件等)

---

### 3.4 ContextEnricher 测试 (__tests__/input/context-enricher.test.ts)

✅ **依赖发现** (21-89行+更多)
- 空文件列表处理
- 无依赖文件处理
- ES6 import发现
- require()发现
- 深度限制
- 大小限制

**问题**: 缺失inferLanguage的直接测试！
- ❌ 虽然间接测试，但无专项验证映射表

---

### 3.5 AgentRunner 基类测试

❌ **缺失**: 没有找到 AgentRunner 的专项测试
- AgentRunner 是抽象基类，通常需要通过子类测试验证
- 需要查找dimension-agents相关测试

---

### 3.6 测试覆盖总结表

| 组件 | 测试文件 | 覆盖率 | 缺陷 |
|------|---------|--------|------|
| AdversaryAgent | adversary-agent.test.ts | ⭐⭐⭐⭐⭐ | 无重大缺陷 |
| GitDiffCollector | git-diff-collector.test.ts | ⭐⭐⭐⭐ | inferLanguage无专项测试 |
| FileCollector | file-collector.test.ts | ⭐⭐⭐⭐ | inferLanguage无全面测试 |
| ContextEnricher | context-enricher.test.ts | ⭐⭐⭐⭐ | inferLanguage无专项测试 |
| AgentRunner | ❌ 无直接测试 | ⭐⭐ | 无专项测试|
| inferLanguage | ❌ 无专项测试 | ⭐ | **关键缺陷** |

---

## 4. 项目配置信息

### 4.1 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022", "DOM"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**关键点**:
- ✓ strict mode 启用
- ✓ 生成declaration文件便于提取interfaces
- ✓ ES2022目标

### 4.2 package.json

```json
{
  "name": "inquisitor",
  "version": "0.1.0",
  "description": "高强度代码审查工具",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "@types/jest": "^29.5.11",
    "@types/node": "^20.11.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "typescript": "^5.4.0"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.89.0",
    "glob": "^13.0.6",
    "minimatch": "^10.2.5"
  }
}
```

**关键依赖**:
- Anthropic SDK v0.89.0
- Jest + ts-jest for TypeScript testing
- glob for pattern matching
- minimatch for glob pattern filtering

---

## 5. 问题汇总与建议

### 5.1 关键问题

| ID | 严重性 | 问题 | 影响范围 | 建议 |
|----|--------|------|--------|--------|
| P1 | 🔴 高 | inferLanguage三处重复 + 不一致 | 所有文件输入模块 | 提取到shared utility |
| P2 | 🔴 高 | JSON解析策略完全不同 | AdversaryAgent, AgentRunner | 统一解析逻辑或分离关注 |
| P3 | 🟠 中 | 缺少inferLanguage专项测试 | 测试覆盖 | 添加comprehensive测试 |
| P4 | 🟠 中 | AgentRunner无直接测试 | 基类验证 | 创建concrete实现的测试 |
| P5 | 🟡 低 | 温度参数差异 (0.5 vs 0.7) | AdversaryAgent配置 | 文档说明或统一 |

---

## 6. Feature #10 Sprint Contract 需求

基于以上分析，Sprint Contract应包含:

### ✅ 已完成的稳定部分
1. AdversaryAgent 独立隔离上下文实现 ✓
2. issue判断逻辑 (confirmed/disputed/false_positive) ✓
3. IssueCalibrator 与AdversaryAgent集成 ✓
4. graceful degradation处理 ✓

### 🔧 需要重构的部分
1. **inferLanguage 统一** - 提取到 `src/utils/language-detector.ts`
   - 统一映射表 (包含所有30+项)
   - 统一处理逻辑
   - 添加comprehensive测试

2. **JSON解析标准化** - 创建 `src/utils/json-parser.ts`
   - 统一错误处理策略
   - 支持对象和数组两种格式
   - 可配置的回退策略

3. **测试增强**
   - inferLanguage专项测试 (100%覆盖)
   - AgentRunner基类测试
   - callClaudeAPI集成测试

### 📋 Sprint任务建议
1. Task 1: 创建语言检测utility并迁移
2. Task 2: 创建JSON解析utility并重构
3. Task 3: 添加comprehensive测试套件
4. Task 4: 更新文档和migration guide
5. Task 5: 性能基准测试和优化

