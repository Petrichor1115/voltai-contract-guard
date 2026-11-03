# 合同审查 Skill 套件

一个**总入口 + 两个子 skill**，把合同审查拆成可校验的两步：先结构化，再判风险。适用于任何支持 Agent Skills 约定的运行环境（Pi Agent SDK、kimi-code CLI 等）。

## 包含的 skill

| Skill | 角色 | 职责 | 关键产物 |
|---|---|---|---|
| [`contract-risk-audit`](contract-risk-audit/SKILL.md) | 总入口 | 定基线 → 触发解析 → 校验中间产物 → 触发审查 → 合并输出与自检 | 一份最终答复：A 结论 / B 风险表 / C Redline / D 末尾 JSON |
| [`contract-clause-parser`](contract-clause-parser/SKILL.md) | 子 skill 1 | 识别元信息、条款切分与编号、14 项商务要素、12 类审查索引 | `contract` / `clauses[]` / `facts{}` / `category_index{}`（内部中间产物） |
| [`contract-risk-review`](contract-risk-review/SKILL.md) | 子 skill 2 | 12 类必查（已约定 / 缺失 / 不对等）、量化定级、给出可替换措辞 | 结论摘要 / 风险明细表 / Redline / 末尾 JSON |

三个目录必须**平级**：Pi SDK 与 kimi-code 的 skill 发现规则是「目录内有 `SKILL.md` 即为 skill root，不再向下递归」。物理嵌套会让两个子 skill 不被独立加载，因此总 skill 用 `../contract-clause-parser/SKILL.md` 这样的相对路径显式引用。

## 设计要点

- **解析不判风险，审查不改原文**：避免模型「一边读一边猜」；两个子 skill 也可单独复用。
- **原文可追溯**：每条风险必须带条款号 + 逐字原文；合同没约定的写「合同未约定」，不自行发明条款。
- **量化定级**：P0/P1/P2 只看金额、时限、权利丧失，阈值固化在 [`contract-risk-review/references/scoring-rubric.md`](contract-risk-review/references/scoring-rubric.md)，按需加载（渐进披露）。
- **契约化输出**：正文给人看，末尾唯一一个 ```json 代码块给程序看。

## 使用方式

### kimi-code CLI

```bash
kimi --skills-dir skills -p "请使用 contract-risk-audit 审查 docs/contracts/contract-a-high-risk-en.md"
```

### Pi Agent SDK

```js
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  cwd: projectRoot,
  additionalSkillPaths: [resolve(projectRoot, "skills")],
});
await loader.reload();
```

完整可运行示例见 [`../app/server.mjs`](../app/server.mjs)（白名单只加载这 3 个 skill）与 [`../examples/pi-sdk-ingest/test.mjs`](../examples/pi-sdk-ingest/test.mjs)。

## 依赖环境

- 无额外依赖：skill 本体只是 Markdown 规则文件，随宿主 Agent 运行。
- 需要宿主提供模型与凭证（例如 Pi Agent 的 `~/.pi/agent/auth.json`，不随仓库提交）。

## 输出结构（末尾 JSON）

审查结果固定包含结论、风险数组（编号 / 条款 / 等级 / 类别 / 风险点 / 原文依据 / 修改建议 / 可让步度）与缺失条款列表；字段定义见 [`contract-risk-review/SKILL.md`](contract-risk-review/SKILL.md)。

## 边界

输出为商务风险初筛，不构成法律意见；P0 条款签署前应由执业律师复核。
