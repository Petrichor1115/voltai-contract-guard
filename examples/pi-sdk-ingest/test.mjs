/**
 * 任务 2：基于 Pi SDK 的测试脚本
 * 1) 加载指定目录下的 llm-wiki skill
 * 2) 让 agent 按该 skill 的 Ingest 流程，把 docs/sample-source.md 录入知识库
 */
import { resolve } from "node:path";
import {
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  createAgentSession,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

const cwd = resolve(import.meta.dirname);
const skillsDir = resolve(cwd, ".pi", "skills");
const skillDir = resolve(skillsDir, "llm-wiki");
const sourceFile = resolve(cwd, "docs", "sample-source.md");

const loader = new DefaultResourceLoader({
  cwd,
  agentDir: getAgentDir(),
  noExtensions: true,
  additionalSkillPaths: [skillDir],
  skillsOverride: (base) => ({
    skills: base.skills.filter((s) => s.filePath.startsWith(skillDir)),
    diagnostics: base.diagnostics,
  }),
});
await loader.reload();

const { skills, diagnostics } = loader.getSkills();
console.log(`[cwd] ${cwd}`);
console.log(`[skill dir] ${skillDir}`);
console.log(`[skills] ${skills.map((s) => s.name).join(", ") || "(none)"}`);
if (diagnostics.length) console.log(`[diagnostics] ${JSON.stringify(diagnostics)}`);

const modelRuntime = await ModelRuntime.create();
const available = await modelRuntime.getAvailable();
const model = available.find((m) => (m.provider ?? "").includes("deepseek")) ?? available[0];
if (!model) throw new Error("没有可用模型凭证，请先在 pi 中执行 /login");
console.log(`[model] ${model.provider}/${model.id}`);
console.log(`[source] ${sourceFile}`);
console.log("------------------------------------------------------------\n");

const { session } = await createAgentSession({
  cwd,
  model,
  modelRuntime,
  resourceLoader: loader,
  sessionManager: SessionManager.inMemory(),
});

session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
  if (event.type === "tool_execution_start") {
    process.stdout.write(`\n  · tool: ${event.toolName}\n`);
  }
});

await session.prompt(
  [
    "Use the llm-wiki skill (name: karpathy-llm-wiki) that was loaded from .pi/skills/llm-wiki.",
    "Ingest the knowledge document docs/sample-source.md into the knowledge base by following the skill's Ingest workflow exactly:",
    "1) save the source into raw/ with the required metadata header and a kebab-case filename,",
    "2) triage it against the existing wiki/,",
    "3) compile the content into wiki/ as an article using the skill's article template,",
    "4) update wiki/index.md and append to wiki/log.md.",
    "Keep every number and date traceable to the raw file. When finished, list the files you created or modified.",
  ].join("\n"),
);

console.log("\n\n[done] llm-wiki ingest 执行结束");
session.dispose();
