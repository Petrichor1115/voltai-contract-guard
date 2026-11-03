import http from "node:http";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  createAgentSession,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(root, "..");
const skillsDir = resolve(projectRoot, "skills");
const SKILL_NAMES = ["contract-risk-audit", "contract-clause-parser", "contract-risk-review"];
const contractsDir = resolve(projectRoot, "docs", "contracts");
const dataDir = resolve(root, "data");
// 会话文件属于运行期产物，落到用户临时目录，避免运行进程对项目目录无写权限时失败。
const sessionDir = process.env.SESSION_DIR ?? join(tmpdir(), "voltai-contract-guard-sessions");
const port = Number(process.env.PORT ?? 4311);

// pi 的全局 auth.json 在运行进程只读时无法加锁。这里把凭证复制到用户临时目录，
// 让 SDK 在临时目录内完成读锁与模型元数据缓存；凭证不会写入项目目录。
const authDir = join(tmpdir(), "voltai-contract-guard-auth");
const authPath = join(authDir, "auth.json");

const SAMPLE_FILES = [
  {
    id: "high-risk",
    title: "样本 A · 高风险经销协议",
    subtitle: "WT-DIST-2026-014 · 荷兰法 · 单项有利经销商",
    file: "contract-a-high-risk-en.md",
  },
  {
    id: "balanced",
    title: "样本 B · 相对平衡的经销协议",
    subtitle: "WT-DIST-2026-021 · 德国法 · 双向责任上限",
    file: "contract-b-balanced-en.md",
  },
];

let loader;
let skillsMeta = [];
let runtimePromise;
let modelCache;

async function initSkills() {
  loader = new DefaultResourceLoader({
    cwd: projectRoot,
    agentDir: getAgentDir(),
    noExtensions: true,
    additionalSkillPaths: [skillsDir],
    skillsOverride: (base) => ({
      skills: base.skills.filter(
        (s) => s.filePath.startsWith(skillsDir) && SKILL_NAMES.includes(s.name)
      ),
      diagnostics: base.diagnostics,
    }),
  });
  await loader.reload();
  const { skills, diagnostics } = loader.getSkills();
  skillsMeta = skills.map((s) => ({
    name: s.name,
    description: s.description,
    path: s.filePath,
  }));
  if (diagnostics.length) console.log("[skills] diagnostics", diagnostics);
  console.log(`[skills] loaded ${skillsMeta.map((s) => s.name).join(", ")}`);
}

async function prepareAuth() {
  try {
    await mkdir(authDir, { recursive: true });
    await copyFile(join(getAgentDir(), "auth.json"), authPath);
  } catch (err) {
    console.log("[auth] 无法复制全局凭证，将回退到环境变量或默认凭证", err instanceof Error ? err.message : err);
  }
}

function getRuntime() {
  runtimePromise ??= (async () => {
    await prepareAuth();
    return ModelRuntime.create({ authPath, modelsPath: null });
  })();
  return runtimePromise;
}

async function getModel() {
  if (modelCache) return modelCache;
  const runtime = await getRuntime();
  const available = await runtime.getAvailable();
  modelCache =
    available.find((m) => m.provider === "deepseek" && m.id === "deepseek-v4-pro") ??
    available.find((m) => (m.provider ?? "").includes("deepseek")) ??
    available[0];
  if (!modelCache) throw new Error("没有可用模型凭证，请先在 pi 中执行 /login");
  return modelCache;
}

async function loadSamples() {
  const out = [];
  for (const s of SAMPLE_FILES) {
    try {
      out.push({ ...s, text: await readFile(join(contractsDir, s.file), "utf8") });
    } catch {
      // 样本缺失时跳过，不影响主流程
    }
  }
  return out;
}

function extractJson(text) {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(blocks[i][1]);
    } catch {
      // 继续尝试更早的代码块
    }
  }
  return null;
}

function buildPrompt(contract, filename) {
  return [
    "你是沃泰能源的合同风险审查助手。请直接执行，不要询问，不要只做解释。",
    "",
    "入口唯一：contract-risk-audit（skills/contract-risk-audit/SKILL.md）。",
    "由总 skill 按顺序触发两个子 skill，不要跳步、不要并行、不要自己另定标准：",
    "1) contract-clause-parser（../contract-clause-parser/SKILL.md）：解析条款库、14 项商务要素与 12 类审查索引，此阶段不判风险。",
    "2) contract-risk-review（../contract-risk-review/SKILL.md，读 references/scoring-rubric.md）：基于解析结果做 12 类风险审查，量化定级 P0/P1/P2。",
    "",
    "最终回答必须依次包含：",
    "A. 结论摘要（3 行）",
    "B. 风险明细表（编号 / 条款 / 等级 / 类别 / 风险点 / 原文依据 / 修改建议 / 可让步度）",
    "C. 修订措辞（Redline，P0 优先）",
    "D. 末尾唯一的 ```json 代码块，严格使用 contract-risk-review skill 规定的 JSON 结构。",
    "",
    "审查立场：供应商（Voltai Energy Storage GmbH）。合同原文保持原语言，原文依据必须逐字摘录。",
    "",
    `合同文件：${filename}`,
    "<contract>",
    contract,
    "</contract>",
  ].join("\n");
}

async function runReview(contract, filename) {
  const model = await getModel();
  const runtime = await getRuntime();
  await mkdir(sessionDir, { recursive: true });

  const { session } = await createAgentSession({
    cwd: projectRoot,
    model,
    modelRuntime: runtime,
    resourceLoader: loader,
    thinkingLevel: "medium",
    sessionManager: SessionManager.create(projectRoot, sessionDir),
  });

  let output = "";
  const toolCalls = [];
  session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
      output += event.assistantMessageEvent.delta;
    }
    if (event.type === "tool_execution_start") {
      toolCalls.push(event.toolName);
    }
  });

  try {
    await session.prompt(buildPrompt(contract, filename));
    return {
      markdown: output,
      result: extractJson(output),
      model: `${model.provider}/${model.id}`,
      sessionId: session.sessionId,
      sessionFile: session.sessionFile,
      skills: skillsMeta.map((s) => s.name),
      toolCalls: [...new Set(toolCalls)],
    };
  } finally {
    session.dispose();
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req, limit = 600_000) {
  return new Promise((resolveBody, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limit) reject(new Error("合同文本过大"));
    });
    req.on("end", () => resolveBody(data));
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

async function serveStatic(res, pathname) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = resolve(join(root, "public"), rel);
  if (!filePath.startsWith(resolve(join(root, "public")))) return false;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

await initSkills();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const started = Date.now();

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      const model = await getModel();
      sendJson(res, 200, {
        ok: true,
        model: `${model.provider}/${model.id}`,
        skills: skillsMeta,
        cwd: projectRoot,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/skills") {
      sendJson(res, 200, { skills: skillsMeta });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/samples") {
      sendJson(res, 200, { samples: await loadSamples() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/demo-result") {
      try {
        const cached = JSON.parse(await readFile(join(dataDir, "demo-result.json"), "utf8"));
        sendJson(res, 200, cached);
      } catch {
        sendJson(res, 404, { error: "还没有缓存结果，请先真实执行一次审查" });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/review") {
      const raw = await readBody(req);
      const { contract, filename = "contract.md" } = JSON.parse(raw || "{}");
      if (!contract || typeof contract !== "string" || contract.trim().length < 50) {
        sendJson(res, 400, { error: "合同文本太短，至少 50 个字符" });
        return;
      }
      const review = await runReview(contract, filename);
      sendJson(res, 200, { ...review, elapsed_ms: Date.now() - started });
      return;
    }

    if (req.method === "GET" && (await serveStatic(res, url.pathname))) return;

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[error]", err);
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(port, () => {
  console.log(`Voltai Contract Guard running at http://localhost:${port}`);
});
