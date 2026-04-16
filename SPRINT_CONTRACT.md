# Inquisitor Sprint Contract - 版本 1.0

## 项目基线

| 指标 | 数值 |
|------|------|
| 代码行数 | ~5,050 行 |
| 模块数 | 8 个主模块 |
| 测试数 | 17 个测试文件 |
| TypeScript 版本 | 5.4+ |
| 目标 API | Claude API (Opus/Sonnet) |

## 关键架构依赖

### 核心数据流
```
User Input
    ↓
ReviewSkill (Skill 接口层)
    ↓
ReviewOrchestrator (编排器)
    ├─ ParallelScheduler (任务调度)
    ├─ ReviewAgents (6+1个Agent)
    ├─ ResultMerger (去重合并)
    └─ IssueCalibrator (结果校准)
    ↓
ReportGenerator (报告生成)
    ↓
Output (JSON/Markdown)
```

### 重要约束

1. **ReviewOrchestrator 是唯一的编排入口**
   - 不允许直接调用 Agent
   - 必须使用 ParallelScheduler
   - 必须记录阶段级别的耗时

2. **类型系统必须保持一致**
   - ReviewDimension: 固定 5 个维度
   - Severity: 固定 4 级
   - ReviewIssue 结构不能破坏性变更

3. **配置加载流程**
   - 项目级配置: `.inquisitor.json` (可选)
   - 编排器配置: OrchestratorConfig
   - 报告生成配置: GeneratorConfig
   - 三层配置必须独立

## Sprint 任务制定指南

### 高风险区域

#### 1. 死代码清理（高优先级）
```
路径: src/orchestrator/review-orchestrator.ts (354 行)

当前状态:
- 完整的第二个 ReviewOrchestrator 实现
- 不在 export 中
- 无直接使用者

执行步骤:
1. ✅ 验证没有直接导入
2. ✅ 移除代码
3. ✅ 更新相关文档
4. ✅ 确保所有测试通过

验收标准:
- [ ] grep 查询不到该文件引用
- [ ] npm run test 全部通过
- [ ] 无 ts 编译错误
```

#### 2. severityThreshold 实现（中优先级）
```
当前状态:
- 在 config-loader.ts 中定义
- 在 config-loader.test.ts 中有测试
- 实际代码中未使用

设计决策需要澄清:
- 应在哪个阶段应用阈值?
  - A) 生成报告前过滤
  - B) 校准阶段调整
  - C) Agent 结果后处理
  
- 是否需要绕过阈值机制?
  - A) 硬过滤（低于阈值直接删除）
  - B) 软标记（标记但保留）
  - C) 配置白名单

执行步骤:
1. [ ] 决策应用位置和过滤策略
2. [ ] 实现 severityThreshold 过滤逻辑
3. [ ] 添加单元测试
4. [ ] 添加集成测试
5. [ ] 更新文档示例

验收标准:
- [ ] config-loader 正确解析 severityThreshold
- [ ] 过滤逻辑正确应用
- [ ] 测试覆盖率 >= 80%
- [ ] 文档包含使用示例
```

#### 3. 配置规范化（中优先级）
```
发现的问题:
- InquisitorConfig.dimensions 定义为 string[]，但实际需要 ReviewDimension[]
- InquisitorConfig.formats 定义为 string[]，但实际需要 ('json'|'markdown')[]
- 没有配置验证层

规范化计划:
1. [ ] 创建 ConfigValidator 类
2. [ ] 强类型 InquisitorConfig
3. [ ] 添加配置验证测试
4. [ ] 更新文档说明配置格式

验收标准:
- [ ] 配置验证率 100%
- [ ] 无类型转换 as 关键字
- [ ] 所有配置参数都有 IDE 提示
```

### 中等风险区域

#### 4. 编排器健壮性提升
```
增强项:
- [ ] 添加 totalTimeout 的实际超时控制
- [ ] 完善 incompleteDimensions 的处理
- [ ] 添加更详细的日志/调试信息
- [ ] 处理边界情况：0 个 Agent、全部 Agent 失败等

验收标准:
- [ ] 无法预期的异常被正确捕获
- [ ] 所有代码路径都有测试
- [ ] 覆盖率达到 90%+
```

#### 5. Token 统计准确性
```
当前问题:
- agentTokenUsage 记录可能有遗漏
- 没有 token 预算检查
- 没有成本估算

改进项:
- [ ] 验证所有 Agent token 都被记录
- [ ] 添加 token 预算检查
- [ ] 添加成本警告日志

验收标准:
- [ ] 实际 token + 模型明细 = 总 token
- [ ] 未统计的 token < 0.1%
```

### 低风险区域

#### 6. 报告生成优化
```
建议改进:
- [ ] 支持自定义报告模板
- [ ] 添加 CSV 格式导出
- [ ] 支持筛选特定维度的问题
- [ ] 性能优化：大报告的流式生成

验收标准:
- [ ] 新功能通过测试
- [ ] 不影响现有功能
- [ ] 文档完整
```

## 测试策略

### 现有测试覆盖

```
模块               测试文件                    状态
─────────────────────────────────────────────────
orchestrator       config.test.ts              ✅ 完整
                   parallel-scheduler.test.ts ✅ 完整
                   result-merger.test.ts      ✅ 完整
                   review-orchestrator.test.ts ✅ 完整

agents             dimension-agents.test.ts   ✅ 完整
                   adversary-agent.test.ts    ✅ 完整
                   issue-calibrator.test.ts   ⚠️ 需补充

output             report-generator.test.ts   ✅ 完整
                   feature6-reporters.test.ts ✅ 扩展

skill              config-loader.test.ts      ✅ 完整
                   review-skill.test.ts       ✅ 完整

input              (integration.test.ts)      ✅ 集成测试
```

### 新增测试需求

每个 Sprint 任务的测试计划：

| 任务 | 单元测试 | 集成测试 | 边界情况 |
|------|---------|--------|---------|
| 删除 review-orchestrator | 无需 | ✅ 必需 | ✅ 必需 |
| severityThreshold 实现 | ✅ 必需 | ✅ 必需 | ✅ 必需 |
| 配置规范化 | ✅ 必需 | ✅ 必需 | ✅ 必需 |
| 编排器健壮性 | ✅ 必需 | ✅ 必需 | ✅ 必需 |

### 测试执行命令

```bash
# 全面测试
npm run test:coverage

# 目标覆盖率: >= 85%
# 关键路径: >= 95%
```

## 技术风险评估

### 高风险（需要特别关注）

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| 删除 review-orchestrator 时误伤其他代码 | 中 | 1. 静态分析验证 2. 完整测试套件 |
| severityThreshold 过滤导致某些问题丢失 | 高 | 1. 详细设计评审 2. 日志完整性检查 |
| Token 统计不准确导致成本超支 | 中 | 1. 逐 Agent 验证 2. 成本告警机制 |

### 中风险（需要定期检查）

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| 配置格式变更破坏向后兼容性 | 中 | 1. 版本号管理 2. 迁移脚本 |
| Agent 超时导致结果不完整 | 中 | 1. 降级处理 2. 默认值提供 |

## 验收标准通用模板

每个 Sprint 任务必须满足以下标准：

### 功能验收

- [ ] 需求文档完整性 ≥ 95%
- [ ] 代码审查通过 ✅
- [ ] 无 TypeScript 编译错误
- [ ] 无 ESLint 警告/错误

### 测试验收

- [ ] 单元测试覆盖率 ≥ 85%
- [ ] 集成测试通过率 = 100%
- [ ] 所有边界情况测试通过
- [ ] 无内存泄漏（如适用）

### 文档验收

- [ ] API 文档更新完整
- [ ] 注释清晰准确
- [ ] README 反映最新状态
- [ ] 示例代码可运行

### 性能验收

- [ ] 无性能回退（与基线相比）
- [ ] token 使用在预期内
- [ ] 响应时间在 SLA 内

## 环境和依赖

### 必需环境

```
- Node.js: 18.x 或更新
- npm: 9.x 或更新
- TypeScript: 5.4+
```

### 核心依赖版本约束

```json
{
  "@anthropic-ai/sdk": "^0.89.0",
  "jest": "^29.7.0",
  "ts-jest": "^29.1.1",
  "typescript": "^5.4.0"
}
```

### 开发工具

```
- 代码格式: Prettier (可选)
- 代码检查: ESLint
- 类型检查: tsc --noEmit
- 测试框架: Jest
```

## 交付物清单

每个 Sprint 任务完成时应交付：

- [ ] 更新的源代码
- [ ] 新增单元测试
- [ ] 集成测试结果
- [ ] 代码审查备注
- [ ] 性能基准测试
- [ ] 更新的文档
- [ ] 已解决问题列表
- [ ] 技术决策记录 (ADR)

## 开发流程

### 分支策略

```
main (生产)
  └── develop (开发主分支)
      ├── feature/task-1-name
      ├── feature/task-2-name
      └── hotfix/urgent-fix
```

### 提交信息格式

```
<type>(<scope>): <subject>

<body>

Resolves #<issue-number>
```

### Review 清单

- [ ] 代码遵循现有风格
- [ ] 没有引入新的第三方依赖（除非已审批）
- [ ] 测试完整性
- [ ] 文档准确性
- [ ] 性能影响分析

## Sprint 会议议程

### 计划会议

- 任务分解和分配
- 技术风险识别
- 验收标准确认
- 依赖项识别

### 日常站会

- 进度更新
- 阻塞项解除
- 测试/集成状态

### 评审会议

- 演示功能
- 代码评审
- 测试报告
- 文档评审

### 回顾会议

- 完成情况分析
- 过程改进
- 风险回顾
- 下一 Sprint 准备

## 附录：关键文件速查表

| 文件 | 职责 | 修改频率 |
|------|------|---------|
| src/orchestrator/orchestrator.ts | 主编排逻辑 | 低 |
| src/orchestrator/config.ts | 配置管理 | 中 |
| src/skill/config-loader.ts | 项目配置加载 | 中 |
| src/output/report-generator.ts | 报告生成 | 低 |
| src/types/review.ts | 核心类型定义 | 低 |
| __tests__/orchestrator/*.test.ts | 编排器测试 | 中 |

