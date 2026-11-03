# pi-sdk-ingest

Pi Agent SDK 加指定目录 skill 的最小可运行示例：加载 `llm-wiki`，把 `docs/sample-source.md` 按 Ingest 流程录入知识库。

```bash
npm install            # 在仓库根目录执行
npm run example:ingest
```

- 需要 Pi Agent 模型凭证（`pi` 内 `/login`），凭证不入库。
- 产物写入 `raw/` 与 `wiki/`；一次真实执行的结果已保留在仓库。
- 完整说明见 [`../README.md`](../README.md)。
- `llm-wiki` skill 为第三方组件（MIT，Astro-Han），许可证见 `.pi/skills/llm-wiki/LICENSE`。
