const state = {
  samples: [],
  selected: null,
  data: null,
  filter: "all",
  tab: "risks",
};

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const REC_LABEL = { sign: "可签", revise: "改后签", reject: "不签" };
const REC_EN = { sign: "SIGN", revise: "REVISE", reject: "REJECT" };
const NEG_LABEL = { "must-change": "必须修改", preferred: "优先谈判", acceptable: "可接受" };

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMd(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(md) {
  const lines = String(md ?? "").split(/\r?\n/);
  const out = [];
  let i = 0;
  let list = null;

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      closeList();
      const lang = line.slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push(`<pre><code data-lang="${escapeHtml(lang)}">${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i]);
        i += 1;
      }
      const cells = (row) =>
        row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const header = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push("<table><thead><tr>" + header.map((c) => `<th>${inlineMd(c)}</th>`).join("") + "</tr></thead><tbody>");
      body.forEach((r) => {
        out.push("<tr>" + r.map((c) => `<td>${inlineMd(c)}</td>`).join("") + "</tr>");
      });
      out.push("</tbody></table>");
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMd(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      closeList();
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote>${inlineMd(buf.join(" "))}</blockquote>`);
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const type = ul ? "ul" : "ol";
      if (list !== type) {
        closeList();
        out.push(`<${type}>`);
        list = type;
      }
      out.push(`<li>${inlineMd((ul || ol)[1])}</li>`);
      i += 1;
      continue;
    }

    if (!line.trim()) {
      closeList();
      i += 1;
      continue;
    }

    closeList();
    const buf = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*\|.*\||\s*>|\s*[-*]\s|\s*\d+[.)]\s)/.test(lines[i])) {
      buf.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${inlineMd(buf.join(" "))}</p>`);
  }
  closeList();
  return out.join("\n");
}

function levelCounts(risks) {
  const counts = { P0: 0, P1: 0, P2: 0 };
  risks.forEach((r) => {
    if (counts[r.level] !== undefined) counts[r.level] += 1;
  });
  return counts;
}

function setCharCount() {
  const n = $("contractText").value.trim().length;
  $("charCount").textContent = `${n.toLocaleString()} 字符`;
}

function applySample(id) {
  const sample = state.samples.find((s) => s.id === id);
  if (!sample) return;
  state.selected = id;
  $("contractText").value = sample.text;
  $("filename").textContent = sample.file;
  setCharCount();
  document.querySelectorAll(".sample").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === id);
  });
}

function renderSamples() {
  const box = $("samples");
  box.innerHTML = state.samples
    .map(
      (s) => `
      <div class="sample" data-id="${escapeHtml(s.id)}">
        <span class="tag">${s.id === "high-risk" ? "高风险" : "相对平衡"}</span>
        <b>${escapeHtml(s.title)}</b>
        <span>${escapeHtml(s.subtitle)}</span>
      </div>`
    )
    .join("");
  box.querySelectorAll(".sample").forEach((el) => {
    el.addEventListener("click", () => applySample(el.dataset.id));
  });
}

function showOnly(id) {
  ["idleState", "loadingState", "errorState", "resultState"].forEach((key) => {
    $(key).hidden = key !== id;
  });
  $("resultActions").hidden = id !== "resultState";
  resetPage();
}

function resetPage() {
  const body = $("panelBody");
  if (!body) return;
  body.scrollTop = 0;
  requestAnimationFrame(updatePager);
}

function syncPanelHeight() {
  const left = document.querySelector(".input-panel");
  const right = document.querySelector(".result-panel");
  if (!left || !right) return;
  right.style.height = window.matchMedia("(max-width: 1180px)").matches ? "" : `${left.offsetHeight}px`;
  updatePager();
}

function updatePager() {
  const body = $("panelBody");
  const pager = $("pager");
  if (!body || !pager) return;
  const maxScroll = body.scrollHeight - body.clientHeight;
  const show = !$("resultState").hidden && maxScroll > 8 && !window.matchMedia("(max-width: 1180px)").matches;
  pager.hidden = !show;
  if (!show) return;
  const size = body.clientHeight || 1;
  const pages = Math.ceil(maxScroll / size) + 1;
  const page = Math.min(pages, Math.round(body.scrollTop / size) + 1);
  $("pagerInfo").textContent = `第 ${page} / ${pages} 页`;
  $("prevPage").disabled = body.scrollTop <= 2;
  $("nextPage").disabled = body.scrollTop >= maxScroll - 2;
}

function turnPage(dir) {
  const body = $("panelBody");
  body.scrollTop += dir * body.clientHeight;
}

const STEP_TIMINGS = [0, 3500, 9000, 16000];
let stepTimer;

function startLoading() {
  showOnly("loadingState");
  const steps = [...document.querySelectorAll(".load-step")];
  const sub = $("loadingSub");
  const labels = ["创建 Pi Agent 会话", "加载 contract-risk-audit 总 skill", "触发 contract-clause-parser 解析", "触发 contract-risk-review 审查"];
  const start = Date.now();
  const tick = () => {
    const elapsed = Date.now() - start;
    let active = 0;
    STEP_TIMINGS.forEach((t, idx) => {
      if (elapsed >= t) active = idx;
    });
    steps.forEach((el, idx) => {
      el.classList.toggle("active", idx === active);
      el.classList.toggle("done", idx < active);
      el.querySelector("em").textContent = idx < active ? "完成" : idx === active ? "进行中" : "等待";
    });
    sub.textContent = labels[active];
  };
  tick();
  stepTimer = setInterval(tick, 500);
}

function stopLoading() {
  clearInterval(stepTimer);
}

function renderSummary(data) {
  const result = data.result ?? {};
  const risks = Array.isArray(result.risks) ? result.risks : [];
  const c = levelCounts(risks);
  const overall = result.overall_level || (c.P0 > 0 ? "P0" : c.P1 > 0 ? "P1" : "P2");
  const rec = result.recommendation || "revise";
  const summary =
    result.summary ||
    `共识别 ${risks.length} 项风险，其中 P0 ${c.P0} 项。建议${REC_LABEL[rec] ?? "改后签"}，P0 条款签署前必须修改。`;

  $("summary").className = `summary`;
  $("summary").innerHTML = `
    <div>
      <div class="level-row">
        <div class="level ${overall.toLowerCase()}">${escapeHtml(overall)}</div>
        <div class="verdict">${REC_LABEL[rec] ?? rec}<small>OVERALL RISK · ${REC_EN[rec] ?? "REVISE"}</small></div>
      </div>
      <p class="summary-text">${escapeHtml(summary)}</p>
    </div>
    <div class="counts">
      <div class="count-box p0"><b>${c.P0}</b><span>P0 必须修改</span></div>
      <div class="count-box p1"><b>${c.P1}</b><span>P1 优先谈判</span></div>
      <div class="count-box p2"><b>${c.P2}</b><span>P2 可接受</span></div>
    </div>`;

  $("cntAll").textContent = risks.length;
  $("cntP0").textContent = c.P0;
  $("cntP1").textContent = c.P1;
  $("cntP2").textContent = c.P2;
}

function renderMeta(data) {
  const chips = [];
  chips.push(`<span class="meta-chip session" title="${escapeHtml(data.sessionId ?? "")}">session · ${escapeHtml((data.sessionId ?? "").slice(0, 18))}…</span>`);
  if (data.model) chips.push(`<span class="meta-chip">${escapeHtml(data.model)}</span>`);
  if (data.elapsed_ms) chips.push(`<span class="meta-chip">${(data.elapsed_ms / 1000).toFixed(1)}s</span>`);
  (data.skills ?? []).forEach((s) => chips.push(`<span class="meta-chip skill">skill · ${escapeHtml(s)}</span>`));
  if (data.toolCalls?.length) chips.push(`<span class="meta-chip">${data.toolCalls.length} tool calls</span>`);
  $("runMeta").innerHTML = chips.join("");
  $("footerSession").textContent = data.sessionId ? `session ${String(data.sessionId).slice(0, 8)}` : "尚无会话";
}

function renderRisks() {
  const risks = state.data?.result?.risks ?? [];
  const visible = state.filter === "all" ? risks : risks.filter((r) => r.level === state.filter);
  const list = $("riskList");

  if (!visible.length) {
    list.innerHTML = `<p style="font-size:11px;color:#7b8894;padding:18px 0;">该等级下没有风险项。</p>`;
  } else {
    list.innerHTML = visible
      .map((r) => {
        const clause = r.clause && r.clause !== "-" ? `第 ${r.clause} 条` : "合同未约定";
        return `
        <article class="risk" data-level="${escapeHtml(r.level)}">
          <div class="risk-head">
            <span class="sev ${escapeHtml(r.level)}">${escapeHtml(r.level)}</span>
            <span class="clause">${escapeHtml(clause)}</span>
            <span class="cat">${escapeHtml(r.category ?? "")}</span>
            <span class="neg">${escapeHtml(NEG_LABEL[r.negotiability] ?? r.negotiability ?? "")}</span>
            <h3>${escapeHtml(r.issue ?? "")}</h3>
          </div>
          <div class="risk-body">
            <blockquote><b>原文依据 / EVIDENCE</b>${escapeHtml(r.evidence ?? "合同未约定")}</blockquote>
            <div class="fix"><b>修改建议 / REDLINE</b><p>${escapeHtml(r.suggestion ?? "")}</p></div>
          </div>
        </article>`;
      })
      .join("");
  }

  const missing = state.data?.result?.missing_clauses ?? [];
  $("missing").hidden = !missing.length;
  if (missing.length) {
    $("missing").innerHTML = `<h4>缺失条款提醒 · MISSING CLAUSES</h4><ul>${missing
      .map((m) => `<li>${escapeHtml(m)}</li>`)
      .join("")}</ul>`;
  }
}

function renderRedline() {
  const risks = (state.data?.result?.risks ?? [])
    .filter((r) => r.suggestion)
    .sort((a, b) => {
      const order = { P0: 0, P1: 1, P2: 2 };
      return (order[a.level] ?? 3) - (order[b.level] ?? 3);
    })
    .slice(0, 10);

  $("redlineList").innerHTML = risks
    .map(
      (r) => `
      <div class="redline">
        <div class="redline-head-row">
          <span class="sev ${escapeHtml(r.level)}">${escapeHtml(r.level)}</span>
          <b>第 ${escapeHtml(r.clause)} 条 · ${escapeHtml(r.category ?? "")}</b>
          <span class="neg" style="margin-left:auto">${escapeHtml(NEG_LABEL[r.negotiability] ?? r.negotiability ?? "")}</span>
        </div>
        <div class="redline-body">
          <div class="before-after">
            <div><div class="ba-label">原文 / CURRENT</div><div class="ba-old">${escapeHtml(r.evidence ?? "合同未约定")}</div></div>
            <div><div class="ba-label">替换措辞 / PROPOSED</div><div class="ba-new">${escapeHtml(r.suggestion)}</div></div>
          </div>
          <p class="why">${escapeHtml(r.issue ?? "")}</p>
        </div>
      </div>`
    )
    .join("");
}

function renderFullText(data) {
  $("tab-fulltext").innerHTML = data.markdown
    ? renderMarkdown(data.markdown)
    : `<p style="color:#7b8894;font-size:11px;">模型未返回可展示的文本。</p>`;
}

const TAB_NAMES = ["risks", "redline", "fulltext"];

function switchTab(name) {
  const next = TAB_NAMES.includes(name) ? name : "risks";
  state.tab = next;
  document.querySelectorAll(".tab").forEach((el) => el.classList.toggle("active", el.dataset.tab === next));
  TAB_NAMES.forEach((key) => {
    $(`tab-${key}`).hidden = key !== next;
  });
  resetPage();
}

function renderResult(data) {
  state.data = data;
  stopLoading();
  showOnly("resultState");
  renderSummary(data);
  renderMeta(data);
  renderRisks();
  renderRedline();
  renderFullText(data);
  switchTab(state.tab || "risks");
  syncPanelHeight();
}

function showError(message) {
  stopLoading();
  showOnly("errorState");
  $("errorText").textContent = message;
}

async function runReview() {
  const contract = $("contractText").value.trim();
  if (contract.length < 50) {
    showError("合同文本太短，至少 50 个字符。");
    return;
  }
  const btn = $("runBtn");
  btn.disabled = true;
  startLoading();
  try {
    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contract, filename: $("filename").textContent }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "服务端执行失败");
    if (!data.result) {
      throw new Error("模型返回了文本，但没有找到结构化的 JSON 结果。请查看「审查全文」或重试。");
    }
    renderResult(data);
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  } finally {
    btn.disabled = false;
  }
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function baseName() {
  const file = $("filename").textContent || "contract";
  return file.replace(/\.(md|txt|markdown)$/i, "");
}

function bindEvents() {
  $("runBtn").addEventListener("click", runReview);
  $("retryBtn").addEventListener("click", runReview);
  $("contractText").addEventListener("input", () => {
    setCharCount();
    state.selected = null;
    document.querySelectorAll(".sample").forEach((el) => el.classList.remove("active"));
  });
  $("fileInput").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      $("contractText").value = String(reader.result ?? "");
      $("filename").textContent = file.name;
      setCharCount();
      state.selected = null;
      document.querySelectorAll(".sample").forEach((el) => el.classList.remove("active"));
    };
    reader.readAsText(file);
  });
  document.querySelectorAll(".filter").forEach((el) => {
    el.addEventListener("click", () => {
      state.filter = el.dataset.level;
      document.querySelectorAll(".filter").forEach((f) => f.classList.toggle("active", f === el));
      renderRisks();
      resetPage();
    });
  });
  document.querySelectorAll(".tab").forEach((el) => {
    el.addEventListener("click", () => switchTab(el.dataset.tab));
  });
  $("exportMd").addEventListener("click", () => {
    if (!state.data?.markdown) return;
    download(`${baseName()}-risk-review.md`, state.data.markdown, "text/markdown;charset=utf-8");
  });
  $("exportJson").addEventListener("click", () => {
    if (!state.data) return;
    download(`${baseName()}-risk-review.json`, JSON.stringify(state.data, null, 2), "application/json;charset=utf-8");
  });
  $("copyRedline").addEventListener("click", async () => {
    const risks = (state.data?.result?.risks ?? []).filter((r) => r.suggestion);
    const text = risks
      .map((r) => `[${r.level}] Clause ${r.clause} · ${r.category}\nISSUE: ${r.issue}\nCURRENT: ${r.evidence}\nPROPOSED: ${r.suggestion}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      $("copyRedline").textContent = "已复制";
      setTimeout(() => ($("copyRedline").textContent = "复制全部措辞"), 1600);
    } catch {
      $("copyRedline").textContent = "复制失败";
    }
  });
  $("panelBody").addEventListener("scroll", updatePager, { passive: true });
  $("prevPage").addEventListener("click", () => turnPage(-1));
  $("nextPage").addEventListener("click", () => turnPage(1));
  window.addEventListener("resize", syncPanelHeight);
  if (window.ResizeObserver) new ResizeObserver(syncPanelHeight).observe(document.querySelector(".input-panel"));
}

async function init() {
  bindEvents();
  setCharCount();

  try {
    const [health, samples] = await Promise.all([
      fetch("/api/health").then((r) => r.json()),
      fetch("/api/samples").then((r) => r.json()),
    ]);
    if (health.model) $("modelName").textContent = health.model;
    $("skillCount").textContent = "1 总 skill · 2 子 skill";
    state.samples = samples.samples ?? [];
    renderSamples();
    if (state.samples.length) applySample(state.samples[0].id);
    syncPanelHeight();
  } catch {
    $("samples").innerHTML = `<p style="font-size:10px;color:#c0392b;">样本加载失败，可以直接粘贴合同。</p>`;
  }

  const tab = params.get("tab");
  if (tab) state.tab = tab;
  const filter = params.get("filter");
  if (filter && ["P0", "P1", "P2"].includes(filter)) {
    state.filter = filter;
    document.querySelectorAll(".filter").forEach((f) => f.classList.toggle("active", f.dataset.level === filter));
  }

  if (params.has("demo")) {
    try {
      const data = await fetch("/api/demo-result").then((r) => r.json());
      if (data.error) throw new Error(data.error);
      renderResult(data);
    } catch (err) {
      showError(`演示结果未就绪：${err instanceof Error ? err.message : err}`);
    }
  }
}

init();
