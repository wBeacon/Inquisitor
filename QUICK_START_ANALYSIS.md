# Inquisitor 项目分析 - 快速参考

## 📚 文档位置

已生成 3 份关键文档：

1. **ANALYSIS_SUMMARY.md** ⭐ 开始这里
   - 执行总结，快速理解项目全貌
   - 关键发现和技术风险
   - Sprint 规划建议

2. **PROJECT_ANALYSIS.md** 📊 详细参考
   - 完整的项目结构分析
   - 各模块详解
   - 编排流程图解

3. **SPRINT_CONTRACT.md** 🎯 任务制定
   - 完整的 Sprint 合同模板
   - 具体任务描述和验收标准
   - 测试策略和交付物清单

## 🎯 核心发现（5 分钟快速读）

### 问题 1️⃣ : 死代码
```
文件: src/orchestrator/review-orchestrator.ts (354 行)
状态: 完全未使用，在 export 中不存在
行动: 删除
难度: ⭐ 简单
```

### 问题 2️⃣ : severityThreshold 未实现
```
文件: src/skill/config-loader.ts
状态: 定义和解析，但从不使用
行动: 需要决策（实现或删除）
难度: ⭐⭐ 中等（需设计）
```

### 问题 3️⃣ : 配置类型不规范
```
文件: src/skill/config-loader.ts
问题: dimensions/formats 类型定义为 string[]，但期望特定类型
行动: 创建 ConfigValidator 进行强类型化
难度: ⭐⭐ 中等
```

## 🏗️ 项目架构一览

```
User Input
    ↓
ReviewSkill (用户接口)
    ↓
ReviewOrchestrator (编排器)
    ├─ ParallelScheduler (并行调度)
    ├─ 6 Agents (维度 + 对抗)
    └─ ResultMerger (去重合并)
    ↓
ReportGenerator (报告生成)
    ↓
JSON / Markdown Output
```

## 📈 关键指标

| 指标 | 数值 |
|------|------|
| 代码行数 | 5,050 |
| 主模块 | 8 个 |
| 审查维度 | 5 个 |
| 严重等级 | 4 级 |
| 测试文件 | 17 个 |

## ✅ 技术债清单

| 项 | 优先级 | 工作量 | 位置 |
|----|--------|--------|------|
| 删除 review-orchestrator | 🔴 高 | 2-3h | src/orchestrator/ |
| 实现 severityThreshold | 🟡 中 | 4-6h | src/skill/ |
| 配置类型规范化 | 🟡 中 | 6-8h | src/skill/ |
| 编排器健壮性 | 🟢 低 | 8-10h | src/orchestrator/ |

## 🎬 快速开始（建议流程）

### 1️⃣ 理解项目（30 分钟）
```bash
# 阅读文档
cat ANALYSIS_SUMMARY.md

# 查看源代码结构
ls -R src/

# 查看测试结构
ls -R __tests__/
```

### 2️⃣ 理解核心流程（1 小时）
```bash
# 阅读详细分析
cat PROJECT_ANALYSIS.md

# 查看关键文件
cat src/types/review.ts       # 类型定义
cat src/orchestrator/orchestrator.ts  # 主编排器
cat src/skill/review-skill.ts # Skill 接口
```

### 3️⃣ 制定 Sprint（1 小时）
```bash
# 参考 Sprint 合同
cat SPRINT_CONTRACT.md

# 根据建议制定任务
# 任务 1: 删除 review-orchestrator
# 任务 2: 实现 severityThreshold
# ...
```

### 4️⃣ 开发执行（根据任务）
```bash
# 运行测试
npm run test
npm run test:coverage

# 构建
npm run build

# 类型检查
npm run typecheck
```

## 🔍 关键文件位置

### 必读文件
- ✅ `src/types/review.ts` - 核心类型
- ✅ `src/orchestrator/orchestrator.ts` - 主编排器
- ✅ `src/orchestrator/config.ts` - 配置管理

### 死代码（要删除）
- ❌ `src/orchestrator/review-orchestrator.ts` - 旧编排器

### 需要改进的文件
- ⚠️ `src/skill/config-loader.ts` - 配置加载（需类型规范化）
- ⚠️ `src/output/report-generator.ts` - 报告生成（需 severityThreshold 过滤）

### 测试文件
- ✅ `__tests__/orchestrator/config.test.ts`
- ✅ `__tests__/orchestrator/review-orchestrator.test.ts`
- ✅ `__tests__/skill/config-loader.test.ts`

## 📋 技术问卷

**在制定 Sprint 前，需要澄清 3 个关键决策**：

### Q1: severityThreshold 该怎么办？
- [ ] A) 删除（不需要此功能）
- [ ] B) 在报告生成前过滤
- [ ] C) 在校准阶段调整
- [ ] D) 软标记，保留但标记

### Q2: 如何处理类型不规范问题？
- [ ] A) 立即改为强类型（破坏性变更）
- [ ] B) 添加兼容层逐步过渡
- [ ] C) 创建迁移脚本

### Q3: Token 成本控制如何处理？
- [ ] A) 仅记录，不阻止
- [ ] B) 添加软告警（日志）
- [ ] C) 添加硬限制（抛异常）

## 🚀 立即可做的任务（无需决策）

### Task 1: 删除死代码 ✅
```bash
# 1. 验证没有使用者
grep -r "review-orchestrator" src/ __tests__/

# 2. 删除文件
rm src/orchestrator/review-orchestrator.ts

# 3. 运行测试确保没有破损
npm run test

# 4. 编译检查
npm run typecheck
```

**预计时间**: 30 分钟
**风险**: 低（孤立代码）
**验收**: 所有测试通过，无编译错误

## 📞 需要帮助？

参考以下文档：
- **快速理解**: ANALYSIS_SUMMARY.md
- **深入学习**: PROJECT_ANALYSIS.md
- **制定任务**: SPRINT_CONTRACT.md
- **查看源代码**: src/ 目录

## ✨ 后续步骤

1. ✅ 阅读本文档（已完成）
2. ➡️ 阅读 ANALYSIS_SUMMARY.md （5-10 分钟）
3. ➡️ 查看 src/ 结构 （10-15 分钟）
4. ➡️ 提问技术问卷（3 个决策）
5. ➡️ 开始 Task 1（删除死代码）

---

**最后更新**: 2026-04-16
**分析工具**: Claude Code
**状态**: ✅ 完整分析完成

