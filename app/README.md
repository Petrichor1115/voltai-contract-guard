# Voltai Contract Guard · Web 应用

以 Pi Agent 为底座的合同风险审查台：左侧选样本合同与查看原文，右侧渲染审查结论、风险卡、Redline 与全文，可导出结构化 JSON。

## 功能

- **样本合同**：样本 A（高风险经销协议）/ 样本 B（相对平衡），也可粘贴自己的合同文本。
- **真实执行**：点击「开始审查」即调用 Pi Agent，按 `contract-risk-audit → contract-clause-parser → contract-risk-review` 顺序执行，不是预设动画。
- **结果展示**：P0/P1/P2 计数与等级过滤、风险卡（含逐字原文依据）、Redline 前后对照、完整 Markdown 全文。
- **导出**：右上角下载 JSON，字段与 skill 末尾 JSON 一致，便于接入其他系统。
- **演示模式**：`?demo=1` 直接载入仓库内缓存的真实结果，无模型凭证也能看界面。

## 环境要求

- Node.js ≥ 18
- 模型凭证：先在 `pi` 内执行 `/login`（凭证位于 `~/.pi/agent/auth.json`，不随仓库提交）
- 依赖：`@earendil-works/pi-coding-agent`

## 快速启动

在**仓库根目录**执行：

```bash
npm install
npm start
# 打开 http://localhost:4311
```

演示模式（不需要凭证）：

```
http://localhost:4311/?demo=1
http://localhost:4311/?demo=1&tab=redline
```

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `4311` | 服务端口 |
| `SESSION_DIR` | 系统临时目录下的 `voltai-contract-guard-sessions` | Agent 会话文件落盘位置 |

## 接口

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/health` | 健康检查，返回当前模型与已加载 skill |
| GET | `/api/skills` | 返回已加载的 skill 元信息 |
| GET | `/api/samples` | 返回两份样本合同全文 |
| GET | `/api/demo-result` | 返回 `data/demo-result.json` 缓存结果 |
| POST | `/api/review` | 入参 `{ contract, filename }`，返回 `{ markdown, result, model, sessionId, skills, toolCalls, elapsed_ms }` |

`POST /api/review` 要求合同文本 ≥ 50 字符，超过 600 000 字符会直接拒绝。

## 实现要点

- **白名单加载 skill**：`SKILL_NAMES` 只放行三个合同 skill，避免同目录其他来源的 skill 干扰。
- **入口唯一**：`buildPrompt` 明确要求以 `contract-risk-audit` 为入口、按序触发两个子 skill、不跳步、不自定标准。
- **凭证隔离**：把 Pi 全局 `auth.json` 复制到系统临时目录供 SDK 加锁与缓存，凭证不写入项目目录。
- **会话隔离**：会话文件默认落到系统临时目录（`SESSION_DIR` 可覆盖），避免运行账户对项目目录无写权限时失败。
- **零前端依赖**：原生 HTML / CSS / JS，无构建步骤、无框架。

## 截图

| 截图 | 内容 |
|---|---|
| [app-01-home.png](../docs/screenshots/app-01-home.png) | 首页：样本合同、合同原文、执行入口 |
| [app-02-risks.png](../docs/screenshots/app-02-risks.png) | 审查结果：P0 结论、P0/P1/P2 计数、风险卡与原文依据 |
| [app-03-redline.png](../docs/screenshots/app-03-redline.png) | 修订措辞：原文 / 替换句 before-after 对照 |
| [app-04-filter-p1.png](../docs/screenshots/app-04-filter-p1.png) | 按等级过滤（P1） |
| [app-05-fulltext.png](../docs/screenshots/app-05-fulltext.png) | 审查全文：模型返回的完整 Markdown 报告 |

## 说明

- 合同与主体均为模拟数据，仅用于演示，不构成真实报价或法律意见。
- 审查结果缓存在 [`data/demo-result.json`](data/demo-result.json)，来自一次真实执行；重新审查会覆盖前端展示，但不会自动改写该文件。
