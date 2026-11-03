---
name: contract-clause-parser
description: 【子 skill · 由 contract-risk-audit 总 skill 编排调用】把海外销售/经销合同拆成带条款号和原文依据的结构化条款库与商务要素表，供风险审查、条款核对与前端展示复用。触发词：合同解析、条款抽取、合同结构化、条款编号、关键商务条款、clause extraction、parse contract、contract facts。
license: MIT
---

# 合同条款解析与要素抽取

把一份合同变成机器可读的「条款库 + 商务要素表」。**只做抽取和定位，不判断风险等级**（风险判断交给 `contract-risk-review`）。

## 适用场景

- 海外销售合同、经销/框架协议、订单条款、补充协议。
- 需要先把合同结构、关键商务条件、条款原文位置固定下来，再做审查或对比。

不适用：法律意见、诉讼策略、税务筹划。

## 输入

一份合同全文（Markdown / 纯文本 / PDF 提取文本均可）和文件名。缺少文件名时用合同标题或 `contract.md`。

## 解析流程

1. **识别元信息**：合同类型、合同编号、供应商、经销商/客户、生效日、适用法律、争议解决地、币种。
2. **切分条款**：优先使用原文的章节编号（如 `5`、`5.2`）。原文无编号时按标题切分并自拟 `C01`、`C02`，同时在 `heading` 保留原标题。
3. **抽取 14 个商务要素**：币种、账期与起算点、价格调整/汇率、交付方式（Incoterms）、风险转移点、验收期限、质保期与起算点、质保响应、违约金、责任上限、终止权与通知期、知识产权归属、保密期限、合规与制裁。每项都必须给出 `clause` 和 `quote`。
4. **建立审查索引**：把每个条款映射到 12 类审查项（付款与账期、价格与汇率、交付与验收、质保、违约责任、责任上限、终止与退出、知识产权、保密与数据、不可抗力、争议解决与适用法律、合规），供 `contract-risk-review` 直接消费。
5. **标注缺失**：合同没有约定时，`value` 写 `"未约定"`，`clause` 和 `quote` 写 `"-"`。禁止用常识或行业惯例补写条款。

## 输出格式

先给一张 6 行以内的要素速览表，再给一个 ```json 代码块。JSON 结构固定：

```json
{
  "contract": {
    "file": "contract-a-high-risk-en.md",
    "type": "DISTRIBUTION AGREEMENT",
    "number": "WT-DIST-2026-014",
    "supplier": "Voltai Energy Storage GmbH",
    "counterparty": "Nordwind Energy Solutions B.V.",
    "effective_date": "1 November 2026",
    "governing_law": "Netherlands",
    "language": "en"
  },
  "clauses": [
    {
      "id": "5",
      "heading": "Payment",
      "text": "Distributor shall pay each invoice within one hundred twenty (120) days after the invoice date."
    }
  ],
  "facts": {
    "currency": { "value": "USD", "clause": "4", "quote": "Prices are stated in USD" },
    "payment_days": { "value": "120 天，自发票日起", "clause": "5", "quote": "within one hundred twenty (120) days after the invoice date" },
    "liability_cap": { "value": "未约定", "clause": "-", "quote": "-" }
  },
  "category_index": {
    "付款与账期": ["5"],
    "责任上限": ["8"],
    "质保": ["7"]
  }
}
```

字段约束：

- `facts` 至少包含上面 14 个要素的键；没有就写 `"未约定"`。
- `clauses[].text` 保留原文，单条超过 600 字符时截断并在末尾加 `…`。
- 合同原文是英文时，`quote` 保留英文，不翻译后当作依据；`value` 可用中文概括。
- `category_index` 只放实际出现过或应检查但缺失的类别，缺失类别对应空数组。

## 质量红线

- 不编造条款号、条款原文和合同主体。
- 不把推断当成合同约定；推断只能写在 `value` 的概括里，不能写进 `quote`。
- 同一段原文被多个要素引用时，分别标注，不做重复条款编号。
- 输出语言跟随用户；合同原文保持原语言。
