---
name: contract-risk-audit
description: 海外销售/经销合同审查的总入口：编排「条款解析 → 风险审查」两个子 skill，先结构化再按 12 类必查项量化定级，最终输出带原文依据的 P0/P1/P2 风险表、可替换条款措辞与机器可读 JSON。触发词：合同审查、合同风险、条款核对、销售合同、经销协议、contract review、risk review、clause check、audit contract。
license: MIT
---

# 合同风险审查（总编排 skill）

本 skill 是合同审查的**唯一入口**。它不重复定义解析与审查规则，只负责按顺序触发两个子 skill、校验中间产物、合并为一份最终答复。

## 子 skill 与调用顺序

| 顺序 | 子 skill | 位置（相对本文件目录） | 职责 |
|---|---|---|---|
| 1 | `contract-clause-parser` | `../contract-clause-parser/SKILL.md` | 条款编号、14 项商务要素、12 类审查索引，只抽取不判风险 |
| 2 | `contract-risk-review` | `../contract-risk-review/SKILL.md`，并读 `../contract-risk-review/references/scoring-rubric.md` | 12 类必查、量化定级 P0/P1/P2、Redline 与末尾 JSON |

路径相对本 SKILL.md 所在目录解析，即 `skills/contract-risk-audit/` 的上一级。

## 执行流程（不可跳步、不可只做一步）

1. **定基线**：确认审查立场（默认供应商）、合同语言、输出语言；合同为空或读不到时直接报告，不臆造。
2. **触发子 skill 1（解析）**：读取 `../contract-clause-parser/SKILL.md`，严格按其流程和 JSON 结构产出条款库、14 项商务要素、12 类审查索引。此阶段**不输出风险等级**。
3. **校验中间产物**：条款是否都带编号与原文；14 项要素是否每项都有 `value / clause / quote`；缺失项是否标为「未约定」。不合格则重做第 2 步，不带着缺口进入审查。
4. **触发子 skill 2（审查）**：读取 `../contract-risk-review/SKILL.md` 与 `references/scoring-rubric.md`，以第 2 步结果为输入执行 12 类逐项扫描与量化定级；子 skill 规则优先于本文件的任何概述。
5. **合并输出**：只输出一份最终答复，顺序固定：
   - A. 结论摘要（总体等级 / 必须先改的 P0 数 / 一句话建议）
   - B. 风险明细表（编号 / 条款 / 等级 / 类别 / 风险点 / 原文依据 / 修改建议 / 可让步度）
   - C. 修订措辞（Redline，P0 优先）
   - D. 末尾**唯一**一个 ```json 代码块，使用 `contract-risk-review` 的固定结构
6. **自检**：每条风险有条款号与逐字原文；每条 P0 能回答「损失多少 / 多久失控 / 丧失什么权利」；缺失条款单独列出。

## 编排约束

- 解析结果中的 `category_index` 只用于审查定位，不重复打印给用户。
- 两个子 skill 各自会产出一份 JSON：解析那份只作为内部中间产物，最终只保留审查那份。
- 不得把两个子 skill 的规则改写成另一套阈值；不得绕过解析直接凭印象审查。
- 子 skill 未覆盖的问题，按「未约定」记录并放入 `missing_clauses`，不自行发明条款。

## 质量红线

- 不编造条款号、条款原文和合同主体。
- 不把商业偏好写成法律风险，必须落到金额、时限或权利。
- 不对同一风险重复计数，不拆条凑数量。
- 输出语言跟随用户；合同原文保持原语言，不翻译后当作依据。

## 免责声明

本 skill 输出为商务风险初筛，不构成法律意见；P0 条款签署前应由执业律师复核。
