# Inquisitor 快速参考指南

## 🚀 快速开始

### 安装和构建
```bash
npm install           # 安装依赖
npm run typecheck     # 类型检查
npm run build         # 编译为JavaScript
npm test              # 运行所有测试
npm test -- --watch   # 监听模式
```

---

## 📋 五大审查维度速览

| 维度 | Agent类 | 检查内容 | 关键问题 |
|-----|--------|--------|---------|
| 逻辑正确性 | LogicAgent | 控制流、数据流、循环 | null检查、类型匹配、异常处理 |
| 安全性 | SecurityAgent | 注入、认证、加密 | SQL注入、XSS、敏感数据泄露 |
| 性能 | PerformanceAgent | 复杂度、内存泄露 | O(n²)、资源泄露、N+1查询 |
| 可维护性 | MaintainabilityAgent | 命名、耦合、复杂度 | 魔法数字、重复代码、长函数 |
| 边界情况 | EdgeCaseAgent | 空值、溢出、并发 | 数组边界、竞态条件、超时 |

---

## 🔑 核心类型速查表

### ReviewIssue（审查问题）
```typescript
{
  file: string;              // 文件路径
  line: number;              // 行号
  severity: 'critical' | 'high' | 'medium' | 'low';
  dimension: ReviewDimension;  // 所属维度
  description: string;       // 问题描述
  suggestion: string;        // 修复建议
  confidence: number;        // 置信度 (0-1)
  foundBy?: string;          // 发现Agent的ID
  codeSnippet?: string;      // 代码片段
}
```

### ReviewRequest（审查请求）
```typescript
{
  files: FileToReview[];     // 待审查文件
  diff?: string;             // git diff内容
  context: ContextConfig;    // 上下文配置
  dimensions?: ReviewDimension[];  // 指定维度
  mode: 'review' | 'review-fix';   // 审查模式
  maxIterations?: number;    // review-fix迭代次数
}
```

### ReviewReport（审查报告）
```typescript
{
  issues: ReviewIssue[];     // 所有问题
  summary: ReviewSummary;    // 统计摘要
  metadata: ReviewMetadata;  // 元数据
}
```

---

## 🎯 Skill 三大执行模式

### 模式1: diff - 审查git变更
```typescript
await skill.execute({
  mode: 'diff',
  dimensions: 'logic,security',
  formats: 'json,markdown'
});
```

### 模式2: file - 审查单个文件
```typescript
await skill.execute({
  mode: 'file',
  path: 'src/app.ts',
  dimensions: 'logic,performance'
});
```

### 模式3: directory - 审查整个目录
```typescript
await skill.execute({
  mode: 'directory',
  path: 'src/',
  enableAdversary: true,
  outputDir: './reports'
});
```

---

## 🔧 输入采集器速查

### GitDiffCollector - Git变更解析
```typescript
const collector = new GitDiffCollector(contextLines = 50);
const files = await collector.collect('HEAD');  // 获取HEAD的变更
```

### FileCollector - 文件收集
```typescript
const collector = new FileCollector();
await collector.collect('src/app.ts');       // 单个文件
await collector.collect('src/');             // 目录
await collector.collect('src/**/*.ts');      // Glob模式
```

### ContextEnricher - 上下文增强
```typescript
const enricher = new ContextEnricher({
  maxDepth: 2,              // 递归深度
  maxTotalSize: 500 * 1024, // 总大小限制
  projectRoot: process.cwd()
});
const enriched = await enricher.enrich(files);
```

---

## 🧠 Agent执行流程

```
1. 准备上下文
   ↓
2. 并行执行 5 个维度Agent (Promise.all)
   ├─ LogicAgent
   ├─ SecurityAgent
   ├─ PerformanceAgent
   ├─ MaintainabilityAgent
   └─ EdgeCaseAgent
   ↓
3. 执行对抗审查 (AdversaryAgent) - 串行
   ↓
4. 结果校准 (IssueCalibrtor)
   ├─ 应用置信度调整
   ├─ 过滤误报
   └─ 合并重复问题
   ↓
5. 生成报告 (ReportGenerator)
   ├─ JSON格式
   └─ Markdown格式
```

---

## 📊 报告生成

### JSON格式
```typescript
const generator = new ReportGenerator();
const json = generator.toJSON(report);
```

### Markdown格式
```typescript
const md = generator.toMarkdown(report);
```

### 文件输出
```typescript
await generator.toFile(report, './reports', 'my-report');
// 生成: ./reports/my-report-<timestamp>.json
//       ./reports/my-report-<timestamp>.md
```

---

## 📁 项目结构导览

```
src/
├── types/
│   ├── review.ts          ← 审查类型定义
│   ├── agent.ts           ← Agent接口
│   └── index.ts
├── input/
│   ├── git-diff-collector.ts
│   ├── file-collector.ts
│   ├── context-enricher.ts
│   └── index.ts
├── agents/
│   ├── agent-runner.ts    ← Agent基类
│   ├── logic-agent.ts
│   ├── security-agent.ts
│   ├── performance-agent.ts
│   ├── maintainability-agent.ts
│   ├── edge-case-agent.ts
│   ├── adversary-agent.ts
│   ├── issue-calibrator.ts
│   ├── prompts/index.ts   ← 所有system prompts
│   └── index.ts
├── orchestrator/
│   ├── review-orchestrator.ts  ← 编排器
│   └── index.ts
├── output/
│   ├── report-generator.ts     ← 报告生成
│   └── index.ts
└── skill/
    ├── review-skill.ts        ← 主入口
    └── index.ts

__tests__/
├── input/                 ← 输入采集测试
├── agents/                ← Agent测试
├── orchestrator/          ← 编排器测试
├── output/                ← 输出生成测试
└── skill/                 ← Skill测试
```

---

## 🧪 测试相关

### 运行测试
```bash
npm test                        # 运行所有测试
npm test -- --watch            # 监听模式
npm test -- --coverage         # 覆盖率报告
npm test -- --verbose          # 详细输出
npm test -- __tests__/input    # 指定目录
npm test -- git-diff           # 模糊匹配
```

### 测试统计
- **总计**: 114 个测试 ✅
- **输入采集**: 24 个测试
- **Agent系统**: 39 个测试
- **编排器**: 17 个测试
- **输出生成**: 29 个测试
- **Skill集成**: 18 个测试

---

## ⚙️ 配置参数

### OrchestratorConfig
```typescript
{
  model?: string;              // 使用的AI模型
  maxParallel?: number;        // 默认5
  agentTimeout?: number;       // 单个超时 (默认120000ms)
  totalTimeout?: number;       // 总体超时 (默认600000ms)
  enableAdversary?: boolean;   // 默认true
  enableCache?: boolean;       // 默认false
}
```

### GeneratorConfig
```typescript
{
  formats?: ('json' | 'markdown')[];
  theme?: 'dark' | 'light';
  templates?: {
    jsonIndent?: number;       // 默认2
    markdownTitle?: string;    // 默认'代码审查报告'
  };
  includeCodeSnippets?: boolean;  // 默认true
}
```

### ContextEnricherOptions
```typescript
{
  maxDepth?: number;           // 默认2
  maxTotalSize?: number;       // 默认500KB
  projectRoot?: string;        // 默认process.cwd()
}
```

---

## 💡 常见用例

### 用例1: 审查单个PR变更
```typescript
const skill = new ReviewSkill({ enableAdversary: true });
const result = await skill.execute({
  mode: 'diff',
  formats: 'markdown'
});
console.log(result.markdown);
```

### 用例2: 深度审查新模块
```typescript
const result = await skill.execute({
  mode: 'directory',
  path: 'src/new-module',
  dimensions: 'logic,security,performance',
  enableAdversary: true,
  outputDir: './reviews'
});
```

### 用例3: 性能审查
```typescript
const result = await skill.execute({
  mode: 'file',
  path: 'src/utils/heavy-computation.ts',
  dimensions: 'performance',
  formats: 'json,markdown'
});
```

### 用例4: 安全审查
```typescript
const result = await skill.execute({
  mode: 'directory',
  path: 'src/auth',
  dimensions: 'security',
  enableAdversary: true
});
```

---

## 📈 性能优化建议

1. **限制上下文大小**: 设置 `maxTotalSize` 限制
2. **控制递归深度**: 设置 `maxDepth` 为2或3
3. **启用缓存**: 如果重复审查相同代码
4. **超时控制**: 调整 `agentTimeout` 避免超时
5. **并行度**: 调整 `maxParallel` 适应系统能力

---

## 🐛 调试技巧

### 启用详细日志
```typescript
// 检查 Agent 执行时间
console.log(result.report?.metadata?.durationMs);

// 查看所有参与的 Agent
console.log(result.report?.metadata?.agents);

// 检查问题分布
console.log(result.report?.summary?.bySeverity);
console.log(result.report?.summary?.byDimension);
```

### 验证问题有效性
```typescript
// 检查置信度
const highConfidence = issues.filter(i => i.confidence > 0.8);

// 按严重程度分组
const critical = issues.filter(i => i.severity === 'critical');

// 追踪发现Agent
const logicIssues = issues.filter(i => i.foundBy?.includes('logic'));
```

---

## 📚 文件导航快速查询

| 需求 | 文件 |
|-----|------|
| 看类型定义 | `src/types/review.ts` |
| 解析git diff | `src/input/git-diff-collector.ts` |
| 自定义Agent | 参考 `src/agents/logic-agent.ts` |
| 修改报告格式 | `src/output/report-generator.ts` |
| 理解编排流程 | `src/orchestrator/review-orchestrator.ts` |
| 学习Skill用法 | `src/skill/review-skill.ts` |
| 看完整示例 | `__tests__/skill/review-skill.test.ts` |

---

## 🔗 相关资源

- **完整文档**: 见 `INQUISITOR_EXPLORATION.md`
- **进度日志**: 见 `claude-progress.txt`
- **项目说明**: 见 `README.md`
- **主文档**: 见 `CLAUDE.md`

---

## ✨ 快速命令参考

```bash
# 构建相关
npm run build              # 编译TypeScript
npm run typecheck          # 类型检查（不生成文件）
npm run clean              # 删除编译产物

# 测试相关
npm test                   # 运行所有测试
npm test -- --watch       # 监听模式
npm test -- --coverage    # 生成覆盖率报告

# 代码质量
npm run lint              # 运行eslint

# 清理
rm -rf dist/              # 删除编译产物
rm -rf node_modules/      # 删除依赖（需要npm install恢复）
```

---

**最后更新**: 2026-04-15  
**项目状态**: ✅ 全部特性完成，114个测试通过

