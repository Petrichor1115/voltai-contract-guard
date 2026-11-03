# PRD · 合同风险审查系统（contract-risk-audit）

> 课题 2：销售合同的风险审查与条款核对
> 沃泰能源（Voltai Energy Storage）· Day2 Skill 落地实现
> 文档版本 v1.0 · 2026-10-26

| 项 | 内容 |
|---|---|
| 产品名称 | 合同风险审查系统（contract-risk-audit） |
| 文档状态 | 可评审 |
| 关联交付 | `.kimi-code/skills/`（3 个 skill）、`app/`（Web 应用）、`pi-sdk-test/`（SDK 验证）、`docs/design/`（设计理念图） |
| 目标用户 | 海外销售/法务团队、业务签约人、系统开发者 |

---

## 1. 背景（Background）

公司海外储能设备销售业务中，销售/经销合同以英文为主、条款密集。签约前需要法务逐条审查「无限责任、单方解约、账期失控、知识产权让渡」等风险点，但法务人力有限，一份合同的通读与交叉核对往往占用半天以上时间。同时，通用大模型虽能输出「漂亮的意见」，但格式每次不同、结论忽高忽低，无法进入企业流程。

本项目的核心假设：**把合同审查能力封装为可编排、可校验、可追溯的 skill 资产**，让同一套规则在 CLI、Agent SDK、Web 应用三种形态下产出一致结果。

## 2. 用户与场景（Users & Scenarios）

| 用户 | 典型场景 | 诉求 |
|---|---|---|
| 法务专员 | 收到一份 16 条款的海外销售合同，签署前初筛 | 快速拿到带原文依据的风险清单，不漏条款 |
| 销售业务员 | 与经销商谈判前，想知道「该争什么、能让什么」 | 每条 P0 给出可直接写进修订函的替换措辞 |
| 系统/平台方 | 把审查能力接入工单或合同管理系统 | 机器可读的固定 JSON 结构，多端结果一致 |
| 管理者 | 复核审查结论 | 结论可量化、可复核，而不是一句「有风险」 |

## 3. 痛点（Pain Points）

| 编号 | 痛点 | 具体表现 |
|---|---|---|
| P1 | **看不完、看不准** | 一份合同 16 条，致命条款只有三五句；漏掉一条「供应商无限责任、间接损失不设上限」可能损失全年利润 |
| P2 | **标准不统一** | A 法务盯付款账期、B 法务盯知识产权，换人结论就变，无法交叉复核 |
| P3 | **不可追溯** | 只说「这条有风险」，不给条款号和逐字原文，业务不敢改，律师需从头再读 |
| P4 | **通用模型不可流程化** | 提示词一次一个结果：格式漂移、等级忽高忽低、缺少固定 JSON，无法被程序消费 |

## 4. 产品目标与成功指标（Goals & Metrics）

**北极星目标**：一份合同从「提交」到「带原文依据的 P0/P1/P2 风险清单 + 修订措辞 + 机器可读 JSON」，全程 ≤ 3 分钟，且多端结果一致。

| 编号 | 目标 | 成功指标（当前实测） |
|---|---|---|
| G1 | 全量覆盖 | 12 类必查项 100% 逐项扫描；16 条款全部编号入库（已达成） |
| G2 | 可追溯 | 每条风险必须含条款号 + 逐字原文；未约定项标「合同未约定」（已达成） |
| G3 | 可量化 | P0/P1/P2 仅依金额/时限/权利丧失判定，阈值固化在 `scoring-rubric.md`（已达成） |
| G4 | 可流程化 | 末尾输出唯一固定结构 JSON，被 Web 应用直接消费（已达成） |
| G5 | 高性能 | 单次审查耗时约 150s（样本 A 16 条款，deepseek-v4-pro） |

## 5. 方案总览（Solution Overview）

### 5.1 核心架构：一个总 skill + 两个子 skill

```
contract-risk-audit（总入口 · 编排/校验/合并）
   ├─ 01 → contract-clause-parser   解析：切条款、抽要素、建索引，不判风险
   └─ 02 → contract-risk-review     审查：12 类必查、量化定级、Redline
              └─ references/scoring-rubric.md（定级锚点，渐进披露）
```

设计主张（与设计理念图一致）：**法务读不完、判不准、说不清；skill 拆步骤、设闸门，让每条风险可追溯、可定级、可谈判。**

三个目录物理平级（Agent SDK 的 skill 发现规则为「目录内有 SKILL.md 即为 root，不向下递归」），总 skill 用相对路径 `../contract-clause-parser/SKILL.md` 显式引用，实现逻辑封装。

### 5.2 三种运行形态

| 形态 | 入口 | 说明 |
|---|---|---|
| kimi-code CLI | `kimi --skills-dir .kimi-code/skills -p "…"` | 演示与单次审查 |
| Pi Agent SDK | `@earendil-works/pi-coding-agent` 1.4.0 | 被应用后端与测试脚本消费 |
| Web 应用 | `http://localhost:4311`（Node http server + 原生前端） | 面向最终用户的交互界面 |

## 6. 功能需求（Functional Requirements）

### 6.1 模块 A：总 skill 编排（contract-risk-audit）

| 编号 | 需求 | 优先级 |
|---|---|---|
| FR-A1 | 作为唯一入口响应「审查这份合同」类指令，自动按序触发两个子 skill，不依赖用户记忆顺序 | P0 |
| FR-A2 | 定基线：确认审查立场（默认供应商）、合同语言、输出语言；合同为空或读不到时直接报告，不臆造 | P0 |
| FR-A3 | **校验闸门（S3）**：解析产物不合格（条款无编号/原文、14 项要素缺 value/clause/quote）则打回重做，禁止带缺口进入审查 | P0 |
| FR-A4 | 合并输出固定四段：A 结论摘要 / B 风险明细表 / C 修订措辞 / D 末尾**唯一** JSON 代码块 | P0 |
| FR-A5 | 自检：每条风险有条款号与逐字原文；每条 P0 能回答「损失多少/多久失控/丧失什么权利」；缺失条款单列 `missing_clauses` | P0 |
| FR-A6 | 质量红线：不编造条款；不把商业偏好写成法律风险；不重复计数；合同原文保持原语言 | P0 |

**验收标准**：CLI 运行日志可见「先读总 skill → 依序读两个子 skill → 合并输出」；末尾仅一个 JSON 块（`clause_count: 16`、`checked_categories: 12`）。

### 6.2 模块 B：解析子 skill（contract-clause-parser）

| 编号 | 需求 | 优先级 |
|---|---|---|
| FR-B1 | 输出四块结构化中间产物：`contract`（元信息）/ `clauses[]`（逐条编号 + 原文）/ `facts{}`（14 项商务要素）/ `category_index{}`（12 类审查索引） | P0 |
| FR-B2 | 14 项要素逐项给 `value / clause / quote`，未约定项明确标「未约定」，不得留空或臆造 | P0 |
| FR-B3 | 此阶段**不输出任何风险等级或修改建议**（单一职责） | P0 |
| FR-B4 | 子 skill 的 description 标注「由 contract-risk-audit 总 skill 编排调用」，防止被当平级入口重复触发 | P0 |

### 6.3 模块 C：审查子 skill（contract-risk-review）

| 编号 | 需求 | 优先级 |
|---|---|---|
| FR-C1 | 按 12 类必查项逐条扫描，每类区分「已约定 / 缺失 / 不对等」三种状态 | P0 |
| FR-C2 | 依 `references/scoring-rubric.md` 量化定级 P0/P1/P2，仅看金额、时限、权利丧失三类锚点 | P0 |
| FR-C3 | 每条风险输出：编号 / 条款号 / 等级 / 类别 / 风险点 / 逐字原文依据 / 修改建议 / 可让步度 | P0 |
| FR-C4 | P0 条款给出可直接写入修订函的 Redline 措辞（原文 → 替换句 before/after） | P0 |
| FR-C5 | 结论摘要含总体等级、必须先改的 P0 数量、一句话建议（如「改后签」） | P0 |

**验收标准**（样本 A 实测）：16 条款 / 14 要素（3 项未约定）/ 12 类全覆盖；14 条风险（CLI：12 P0 / 1 P1 / 1 P2），总体等级 P0，结论「改后签」。

### 6.4 模块 D：Web 应用前端

| 编号 | 需求 | 优先级 |
|---|---|---|
| FR-D1 | 首页提供两份样本合同（A 高风险 / B 相对平衡）与合同原文输入区，一键「开始审查」 | P0 |
| FR-D2 | 状态机：点击审查后空闲态（等待合同）消失 → 显示「正在审查合同…」四步进度 → 完成后进入结果页 | P0 |
| FR-D3 | 结果页三个标签：风险清单 / 修订措辞 / 审查全文；原始 JSON 标签页移除，改由「下载 JSON」导出 | P0 |
| FR-D4 | 结果面板与左侧输入面板**等高**，超出部分面板内滚动并以「上一页 / 下一页」分页；≤1180px 窄屏退化为上下堆叠不分页 | P1 |
| FR-D5 | 风险清单支持按 P0/P1/P2 等级过滤；风险卡显示原文依据（逐字引用块） | P0 |
| FR-D6 | 支持下载 Markdown 与 JSON 两种导出 | P1 |
| FR-D7 | `?demo=1` 加载缓存结果（`app/data/demo-result.json`）用于快速演示与截图复现 | P1 |
| FR-D8 | 视觉遵循 Legal Services「Trust & Authority」设计系统（见 §8），与设计理念图同色板 | P1 |

### 6.5 模块 E：后端服务（app/server.mjs）

| 编号 | 需求 | 优先级 |
|---|---|---|
| FR-E1 | `GET /api/health`：返回模型与已加载 skill 列表 | P0 |
| FR-E2 | `GET /api/samples`：返回两份模拟合同全文 | P0 |
| FR-E3 | `GET /api/demo-result`：返回真实执行后缓存的审查结果 | P1 |
| FR-E4 | `POST /api/review`：入参 `{contract, filename}`，返回 `{markdown, result, model, sessionId, skills, toolCalls, elapsed_ms}` | P0 |
| FR-E5 | Skill 白名单：仅加载 `contract-risk-audit`、`contract-clause-parser`、`contract-risk-review` 三个，隔离同目录其他来源 skill | P0 |
| FR-E6 | `buildPrompt` 强约束：入口唯一、必须按序触发两个子 skill、不得跳步 | P0 |
| FR-E7 | 会话记录落系统临时目录（`SESSION_DIR` 可覆盖），避免项目目录无写权限导致失败 | P1 |

## 7. 非功能需求（Non-functional Requirements）

| 类别 | 要求 |
|---|---|
| 性能 | 样本 A（16 条款）单次端到端审查约 152.7s；结果面板渲染即时 |
| 一致性 | 同一合同在 CLI / SDK / Web 三端跑同一套 skill，结论与 JSON 结构一致 |
| 可靠性 | 合同读不到、解析不合格均有明确失败路径，不臆造输出 |
| 安全 | 仓库不含任何模型凭证；`auth.json` 仅在 Pi 用户目录/临时目录；skill 白名单防污染 |
| 可维护性 | 阈值与规则集中在 SKILL.md + scoring-rubric.md，改规则无需改代码；skill 文件修改后重启服务生效 |
| 合规边界 | 输出为商务风险初筛，不构成法律意见；P0 条款签署前须执业律师复核 |

## 8. 设计规范（Design System）

取 `ui-ux-pro-max` Legal Services「Trust & Authority」体系，设计理念图与 Web 前端共用同一色板：

| 角色 | 色值 | 用法 |
|---|---|---|
| Primary | `#1E3A8A` | 品牌块、主按钮、标题强调、结论卡底色 |
| Secondary | `#1E40AF` | 渐变、链接态、修复建议文字 |
| Background / Card | `#F8FAFC` / `#FFFFFF` | 页面底色 / 内容卡片 |
| Foreground | `#0F172A` | 正文与标题 |
| Muted / Border | `#64748B` / `#CBD5E1` | 次级信息 / 分隔线 |
| Destructive | `#DC2626` | P0 |
| Warning | `#B45309` | P1、缺失条款、S3 校验闸门 |
| P2 | `#1E40AF`（蓝） | 与 P0/P1 构成「红→琥珀→蓝」单一语义阶梯 |

字体：Plus Jakarta Sans（拉丁）+ PingFang SC / Microsoft YaHei（中文）；标题无衬线、字重 700–800；禁止 emoji 图标；正文对比度 ≥ 4.5:1。

## 9. 数据与验收基准（Acceptance Baseline）

真实执行数据（入口 `contract-risk-audit`，模型 `deepseek/deepseek-v4-pro`，会话 `01a17271-…`）：

| 指标 | Web 应用运行 | CLI 运行 |
|---|---|---|
| 条款数 | 16 | 16 |
| 商务要素 | 14 项（3 项未约定） | 14 项（3 项未约定） |
| 必查类别 | 12/12 | 12/12 |
| 风险总数 | 14（11 P0 / 3 P1 / 0 P2） | 14（12 P0 / 1 P1 / 1 P2） |
| 总体结论 | P0 ·「改后签」 | P0 ·「改后签」 |
| 耗时 | 152.7s | — |
| Redline | C1/C2 | C1/C2 |

> 两端 P0/P1 计数因模型采样存在小幅波动，属于可接受范围；总数与结构一致即视为通过。缓存文件：`app/data/demo-result.json`。

## 10. 边界与非目标（Out of Scope）

- 不生成正式法律意见书，不替代执业律师（P0 须人工复核）。
- 不做合同起草/全文改写，只输出风险与替换措辞。
- 不做 PDF 原生解析之外的 OCR；输入以 Markdown / 纯文本 / 已提取文本为主。
- 不做多合同批量与并发队列（当前单会话串行）。
- 不接入真实合同管理系统（JSON 契约为未来对接预留）。
- 演示所用合同、主体、金额均为模拟数据。

## 11. 风险与开放问题（Risks & Open Questions）

| 编号 | 风险/问题 | 缓解 |
|---|---|---|
| R1 | 模型采样导致两端 P0/P1 计数小幅波动 | 阈值固化在 rubric；验收以「总数+结构一致」为准 |
| R2 | skill 目录混入其他来源 skill | 后端白名单 + skillsOverride 双重隔离 |
| R3 | 长合同（>50 条款）耗时超 3 分钟 | 后续考虑按 category_index 分批审查（Open） |
| R4 | 会话文件落临时目录可能被系统清理 | 提供 `SESSION_DIR` 覆盖；前端提供下载导出 |
| O1 | 子 skill 是否支持脱离总 skill 单独入口 | 当前明确标注「仅编排调用」，保持单一入口 |

## 12. 发布里程碑（Milestones）

| 阶段 | 内容 | 状态 |
|---|---|---|
| M1 | 3 个 skill 定稿（总编排 + 解析 + 审查 + rubric） | ✅ 已完成 |
| M2 | kimi CLI 端验证 + 设计理念图（archify workflow，四道闸门通过） | ✅ 已完成 |
| M3 | Pi Agent SDK 验证（llm-wiki 入库链路） | ✅ 已完成 |
| M4 | Web 应用（后端 API + 前端结果页 + 等高分页 + 设计系统重构） | ✅ 已完成 |
| M5 | 多合同批量 / 真实系统集成 | 待规划 |

## 13. 附录（Appendix）

**复现路径**

```powershell
cd D:\Github\20261024-wt\skill-demo_02
npm install                       # 首次
kimi --skills-dir .kimi-code/skills -p "<审查提示词>"   # CLI
node pi-sdk-test/test.mjs          # SDK 入库验证
npm start                          # Web 应用 → http://localhost:4311
# 快速复现：?demo=1；截图：?demo=1&tab=redline 等
```

**关键文件索引**

| 文件 | 说明 |
|---|---|
| `.kimi-code/skills/contract-risk-audit/SKILL.md` | 总编排 skill |
| `.kimi-code/skills/contract-clause-parser/SKILL.md` | 解析子 skill |
| `.kimi-code/skills/contract-risk-review/SKILL.md` + `references/scoring-rubric.md` | 审查子 skill + 定级锚点 |
| `app/server.mjs` | Node http 后端（API + skill 白名单） |
| `app/public/` | 原生 HTML/CSS/JS 前端 |
| `app/data/demo-result.json` | 真实执行缓存结果 |
| `docs/design/skill-design-concept.{html,png}` | 设计理念图（archify workflow 生成） |
| `docs/contracts/` | 样本 A（高风险）/ 样本 B（相对平衡） |
| `docs/screenshots/` | CLI、SDK、应用截图与原始运行日志 |
