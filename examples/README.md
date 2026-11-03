# 示例

## pi-sdk-ingest · Pi Agent SDK + llm-wiki 入库

演示「如何在程序里加载一个指定目录的 skill，并让 Agent 按该 skill 的流程真实执行」。

### 做了什么

1. 用 `DefaultResourceLoader` + `additionalSkillPaths` 只加载 `examples/pi-sdk-ingest/.pi/skills/llm-wiki`；
2. `skillsOverride` 过滤掉其他 skill，保证执行环境干净；
3. `ModelRuntime.create()` 选取可用的 deepseek 模型；
4. `createAgentSession()` 创建内存会话，按 llm-wiki 的 Ingest 流程把 `docs/sample-source.md` 录入知识库：
   - 原文归档到 `raw/`（带元信息头、kebab-case 命名）
   - 对照已有 `wiki/` 做去重与拆分判断
   - 按模板编译成 `wiki/` 文章
   - 更新 `wiki/index.md`，追加 `wiki/log.md`

### 运行

在**仓库根目录**执行：

```bash
npm install
npm run example:ingest     # 等价于 node examples/pi-sdk-ingest/test.mjs
```

`test.mjs` 以自身目录为 `cwd`，因此脚本输出里看到的是 `examples/pi-sdk-ingest` 下的相对路径。

### 依赖环境

- Node.js ≥ 18
- Pi Agent 模型凭证（`pi` 内 `/login`，凭证位于 `~/.pi/agent/auth.json`，不入库）
- `@earendil-works/pi-coding-agent`（根 `package.json` 已声明）

### 目录

```
examples/pi-sdk-ingest/
├─ test.mjs                     # SDK 调用脚本
├─ .pi/skills/llm-wiki/         # 被加载的 skill（第三方，MIT）
├─ docs/sample-source.md        # 输入：工商业储能峰谷套利
├─ raw/                         # Ingest 产物：原文归档
└─ wiki/                        # Ingest 产物：编译后的知识页 + index + log
```

### 结果与自检

一次真实执行后生成的产物已保留在仓库：

- `raw/energy-storage/industrial-commercial-storage-peak-valley-arbitrage.md`
- `wiki/energy-storage/industrial-commercial-storage-arbitrage.md`
- `wiki/index.md`、`wiki/log.md`

llm-wiki 自带 `scripts/check_evidence.py` 可做自检（0 fidelity suspects / 0 evidence errors / 0 unreferenced raw files）：

```bash
python examples/pi-sdk-ingest/.pi/skills/llm-wiki/scripts/check_evidence.py examples/pi-sdk-ingest
```

运行截图与原始输出见 [`../../docs/screenshots/pi-sdk.png`](../../docs/screenshots/pi-sdk.png) 与 [`../../docs/screenshots/pi-sdk-run.txt`](../../docs/screenshots/pi-sdk-run.txt)。

## 第三方说明

`llm-wiki` skill 来自 [Astro-Han/karpathy-llm-wiki](https://github.com/Astro-Han/karpathy-llm-wiki)，MIT 许可，原样收录用于演示，未做修改；许可证见其目录内 `LICENSE`。
