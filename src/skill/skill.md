---
name: review
description: 高强度代码审查工具 - 从多个维度系统性地审查代码，通过对抗式审查发现深层问题
trigger: /review
---

# Inquisitor Code Review Skill

对代码进行高强度多维度审查，通过5个独立维度Agent并行分析，配合对抗式Adversary Agent交叉验证，系统性地发现代码中的逻辑错误、安全漏洞、性能问题、可维护性缺陷和边界情况遗漏。

## 使用方式

```
/review                              # 审查 git diff（默认模式）
/review src/foo.ts                   # 审查指定文件
/review --full src/                  # 审查整个目录
/review --fast                       # 快速模式，跳过对抗审查阶段
/review --fast --formats json,markdown src/foo.ts  # 组合使用多个选项
```

## 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| (无参数) | 默认审查 git diff | - |
| `<path>` | 审查指定文件路径 | - |
| `--full <dir>` | 审查整个目录 | - |
| `--fast` | 跳过对抗审查阶段，加快审查速度 | false |
| `--formats <fmts>` | 输出格式，逗号分隔 (json, markdown) | markdown |
| `--dimensions <dims>` | 指定审查维度，逗号分隔 | 全部5个维度 |

## 审查维度

- **Logic** - 逻辑正确性：控制流错误、条件判断遗漏、状态管理问题
- **Security** - 安全性：注入攻击、权限校验、敏感数据泄露
- **Performance** - 性能：算法复杂度、内存泄漏、不必要的计算
- **Maintainability** - 可维护性：代码重复、命名不清、耦合过高
- **EdgeCases** - 边界情况：空值处理、溢出、并发竞态

## 配置文件

在项目根目录创建 `.inquisitor.json` 自定义审查规则：

```json
{
  "ignore": ["**/*.test.ts", "node_modules/**"],
  "rules": {
    "maxFileSize": 100000,
    "minConfidence": 0.5
  },
  "severityThreshold": "low",
  "dimensions": ["logic", "security", "performance"]
}
```

## 输出

审查完成后会输出：
1. 按严重程度分组的问题列表（critical / high / medium / low）
2. 每个问题的文件位置、描述、修复建议和置信度评分
3. 统计摘要（按维度和严重程度分布）
