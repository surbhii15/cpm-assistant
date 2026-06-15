const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path  = require("path");
const fs    = require("fs");
const fetch = require("node-fetch");

// Redirect Electron's userData to a local (non-cloud) path so Chromium's
// disk/GPU caches don't hit cloud storage access restrictions.
if (!app.isPackaged) {
  const localCache = path.join(process.env.HOME || process.env.TMPDIR, ".CPMAssistant-dev");
  app.setPath("userData", localCache);
}
const processFiles     = require("./services/fileProcessing");
const { fillTemplate } = require("./services/templateFiller");

const LANGFLOW_URL =
  "https://langflow.servicesessentials.ibm.com/api/v1/run/1b54bdbc-fe2e-48b1-9f54-90391ecd5482";

const LANGFLOW_API_KEY = "sk-RoRwFdmDzN5eT1WnmrszNtKlSNqXFvtl9Bue3jW0GdE";

// ── Download links (IBM Box) ──────────────────────────────────────────────────
const BOX_URL_WINDOWS = "https://ibm.ent.box.com/folder/376686176885";
const BOX_URL_MAC     = "https://ibm.ent.box.com/folder/376339494711?s=8ly2s07qclfe67hxj5dy6cqntjid596h";

const TIMEOUT_DETECT   =  90_000;   // 90s — detect_projects (cross-doc scan)
const TIMEOUT_ANALYZE  = 300_000;   // 300s — agent took ~161s on a real run
const TIMEOUT_COMPLETE = 300_000;   // 300s — complete can be equally heavy

const EXPECTED_TOKENS   = 149;

// ── Config helpers ────────────────────────────────────────────────────────────
function getConfigPath() { return path.join(app.getPath("userData"), "cpm-config.json"); }

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(getConfigPath(), "utf8")); } catch { return {}; }
}

function saveConfig(patch) {
  const merged = { ...loadConfig(), ...patch };
  fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2));
}


let mainWindow;

function log(level, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${level.toUpperCase()}] ${msg}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("backend-log", { level, msg, ts });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 860, minWidth: 1024, minHeight: 700,
    backgroundColor: "#ffffff",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile("renderer/index.html");
}

app.whenReady().then(() => {
  createWindow();
  mainWindow.webContents.on("did-finish-load", () => {
    const downloadUrl = process.platform === "darwin" ? BOX_URL_MAC : BOX_URL_WINDOWS;
    mainWindow.webContents.send("update-available", { url: downloadUrl });
  });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle("open-release-page", async (event, url) => {
  await shell.openExternal(url); return { success: true };
});

// ── IPC 1: Extract files ──────────────────────────────────────────────────────
ipcMain.handle("process-files", async (event, filePaths) => {
  if (!Array.isArray(filePaths)) filePaths = [];
  log("info", `Processing ${filePaths.length} file(s)`);
  try {
    const files = filePaths.map(p => ({ name: path.basename(p), path: p }));
    const result = await processFiles(files);
    log("info", `Extraction done — ${result.extractedText.length} chars, ${result.filesSummary.length} files, ${result.docNames.length} docs labeled`);
    return { success: true, data: result };
  } catch (err) {
    log("error", `File processing failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// ── IPC 2: Detect projects ────────────────────────────────────────────────────
ipcMain.handle("agent-detect-projects", async (event, { labeledText, extractedText, apiKey }) => {
  apiKey = LANGFLOW_API_KEY;
  log("info", "▶ DETECT-PROJECTS started");
  // Prefer labeled (per-document) text so agent can detect cross-doc presence;
  // fall back to ranked extractedText if labeled isn't available.
  const documents = labeledText || extractedText || "";
  const inputPayload = {
    mode: "detect_projects",
    documents,
    instruction: `You are analyzing MULTIPLE DOCUMENTS for a single IBM CPM profile submission.
    Each document section is labeled [DOCUMENT: filename] so you can track which projects
    appear in which documents.

    STEP 1 — IDENTIFY PROJECTS PER DOCUMENT
    Read each labeled document section and list every project/program mentioned in it.

    STEP 2 — FIND CROSS-DOCUMENT PROJECTS
    A project that appears in MULTIPLE documents is a strong signal that those documents
    were provided specifically about that project (e.g. resume + risk report + PPT all about
    the same engagement). These cross-document projects MUST be ranked highest.

    STEP 3 — FILTER FOR CPM ELIGIBILITY
    INCLUDE ONLY roles such as:
    - Program Manager, Project Manager, Senior Project Manager
    - Delivery Project Executive (DPE), Project Executive (PE)
    - Complex Program Manager (CPM), Portfolio Manager, Delivery Manager
    - Scrum Master / Senior Scrum Master when combined with PM accountability
    - Any role with explicit P&L, financial, or delivery accountability

    EXCLUDE:
    - Developer, Technical Lead, Team Lead, Consultant, Architect
    - Individual contributor roles without delivery accountability
    - Short engagements under 6 months unless TCV is substantial

    STEP 4 — RANK BY CPM SUITABILITY
    Primary rank: number of documents the project appears in (more = higher)
    Secondary rank: TCV, complexity, E2E accountability, duration

    Return ONLY this JSON, no markdown, no other text:
    {
      "mode": "detect_projects",
      "projects": [
        {
          "id": "proj_1",
          "title": "Project/program name",
          "client": "Client name",
          "role": "Candidate\'s exact role title",
          "duration": "Start date - End date",
          "tcv": "TCV or revenue if mentioned, else null",
          "summary": "One sentence: what the program was and candidate\'s accountability",
          "suitability": "high / medium / low",
          "suitability_reason": "Why suitable or not - reference TCV, complexity, role",
          "found_in_docs": ["filename1.pdf", "filename2.pptx"],
          "doc_coverage": 2
        }
      ],
      "recommendation": "id of best project for CPM profile",
      "recommendation_reason": "Why this is the strongest CPM submission candidate"
    }`,
  };
  try {
    const t0 = Date.now();
    const result = await callLangflow(inputPayload, apiKey, TIMEOUT_DETECT);
    log("info", `▶ DETECT-PROJECTS done in ${((Date.now()-t0)/1000).toFixed(1)}s — ${(result.projects||[]).length} projects`);
    return { success: true, data: result };
  } catch (err) {
    log("error", `DETECT-PROJECTS failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// ── IPC 3: Analyze selected project ──────────────────────────────────────────
ipcMain.handle("agent-analyze", async (event, { extractedText, labeledText, selectedProject, apiKey }) => {
  apiKey = LANGFLOW_API_KEY;
  log("info", `▶ ANALYZE started — project: "${selectedProject?.title || "not specified"}"`);

  const scopedLabeledText = filterLabeledDocumentsForProject(labeledText, selectedProject);
  // Prefer the selected project's own document set so the agent does not
  // blend evidence from unrelated engagements.
  const documents = scopedLabeledText || extractedText || "";

  // ── Extraction diagnostics ──────────────────────────────────────────────────
  const textLen   = documents.length;
  const textWords = documents.split(/\s+/).filter(Boolean).length;
  log("info", `   Documents: ${textLen} chars / ~${textWords} words sent to agent`);
  if (textLen < 300) {
    log("warn",
      "⚠ Very little text extracted from documents. " +
      "If files are scanned/image-based PDFs, the agent will find nothing to extract. " +
      "Text preview: " + documents.slice(0, 200)
    );
  }
  // ───────────────────────────────────────────────────────────────────────────

  const projectContext = selectedProject
    ? `SELECTED PROJECT: ${selectedProject.title} | Client: ${selectedProject.client} | Role: ${selectedProject.role} | Duration: ${selectedProject.duration}
REFERENCE DOCUMENTS: ${(selectedProject.found_in_docs || []).join(", ") || "Use only matching sections"}
IMPORTANT: Extract data ONLY for this specific project and ONLY for the candidate's selected duration (${selectedProject.duration || "selected duration"}).
Ignore all other projects entirely. Do not mix data from other engagements even if the candidate worked on them for the same client.
If a document mentions the same client but outside the selected project or outside the selected duration, ignore that evidence.`
    : "No project selected — use the most prominent project in the documents.";

  const inputPayload = {
    mode: "analyze",
    documents,
    selected_project: projectContext,
    template_fields: ALL_FIELDS,
    critical_fields: CRITICAL_FIELDS,
    instructions:
      "Generate follow-up questions only for facts you could not derive from the selected project's documents. " +
      "Do not ask generic repeat questions. If the documents already answer something, even partially, fill it instead of asking. " +
      "For serviceLine and practice, copy only values explicitly present in the documents; otherwise leave them empty and ask in the gap questions. " +
      "If a value is not found, return null or an empty field value — never write placeholders like Unknown, Not stated, Not provided, or Not found. " +
      "Return compact valid JSON only. Keep every string concise, avoid long paragraphs, and cap the total response to roughly 12,000 characters. " +
      "Summarize leadership, outcomes, org structure, and financial narratives briefly rather than exhaustively.",
  };
  try {
    const t0     = Date.now();
    const result = await callLangflow(inputPayload, apiKey, TIMEOUT_ANALYZE);
    const filled = result.filled_fields || {};
    const fCount = Object.values(filled).filter(v => v && v !== "—" && v !== null && !(Array.isArray(v) && v.length === 0)).length;
    log("info", `▶ ANALYZE done in ${((Date.now()-t0)/1000).toFixed(1)}s — fields: ${fCount}, questions: ${(result.questions||[]).length}`);
    // Log a preview of what came back so empty-field issues are diagnosable
    const filledPreview = Object.entries(filled).filter(([,v]) => v && v !== "—" && v !== null).slice(0, 5).map(([k,v]) => `${k}: ${String(v).slice(0,40)}`).join(" | ");
    log("info", `   Filled preview: ${filledPreview || "(none)"}`);
    if (fCount === 0) {
      log("warn",
        "⚠ Agent returned 0 extracted fields. Likely causes: " +
        "(1) uploaded files are scanned/image PDFs with no text layer, " +
        "(2) extracted text was too short (<300 chars), " +
        "(3) the Langflow system prompt may need updating — check agent_prompt.md. " +
        `Extracted text length: ${textLen} chars.`
      );
    }
    return { success: true, data: result, _meta: { textLen, textWords, fCount } };
  } catch (err) {
    log("error", `ANALYZE failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// ── IPC 4: Complete draft ─────────────────────────────────────────────────────
ipcMain.handle("agent-complete", async (event, { filledFields, answers, apiKey }) => {
  apiKey = LANGFLOW_API_KEY;
  log("info", `▶ COMPLETE started — answers: ${Object.keys(answers).length}`);
  const inputPayload = {
    mode: "complete",
    filled_fields: filledFields,
    answers,
    instructions:
      "Merge answers into filled_fields. Enhance all content to professional CPM submission " +
      "quality using IBM CPM language. Map complexity only to the embedded official complexity category names and include only factors supported by evidence. " +
      "Use evidence internally, but write candidate-facing complexity prose without meta references to documents or source evidence. " +
      "Write leadership behaviors as structured examples using the embedded Behaviours.pdf guidance; map each example to the correct behaviour and include what I did plus value/result/impact. Do not invent unsupported facts. Write all candidate narratives in first person voice using I. Return complete JSON.",
  };
  try {
    const t0 = Date.now();
    const result = await callLangflow(inputPayload, apiKey, TIMEOUT_COMPLETE);
    log("info", `▶ COMPLETE done in ${((Date.now()-t0)/1000).toFixed(1)}s — quality: ${result.draft_quality_score||0}%`);
    return { success: true, data: result };
  } catch (err) {
    log("error", `COMPLETE failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// ── IPC 5: Auto-fill remaining form fields ────────────────────────────────────
ipcMain.handle("agent-autofill", async (event, { filledFields, currentAnswers, emptyFieldKeys, apiKey }) => {
  apiKey = LANGFLOW_API_KEY;
  log("info", `▶ AUTOFILL started — empty fields: ${(emptyFieldKeys||[]).length}`);
  const inputPayload = {
    mode: "autofill",
    filled_fields: filledFields,
    current_answers: currentAnswers,
    empty_field_keys: emptyFieldKeys,
    instructions:
      "Given the filled fields and current user answers, infer and suggest concise professional " +
      "values for each field listed in empty_field_keys. Return a JSON object with key " +
      "'suggested_fields' mapping each field label to its suggested value. Only suggest " +
      "fields where the existing context clearly supports an inference. Do not suggest Service Line or Practice unless the exact value is explicitly present in the documents.",
  };
  try {
    const t0 = Date.now();
    const result = await callLangflow(inputPayload, apiKey, TIMEOUT_ANALYZE);
    log("info", `▶ AUTOFILL done in ${((Date.now()-t0)/1000).toFixed(1)}s — suggested: ${Object.keys(result?.suggested_fields||{}).length}`);
    return { success: true, data: result };
  } catch (err) {
    log("error", `AUTOFILL failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});


// ── IPC 9: Generate DOCX ─────────────────────────────────────────────────────
ipcMain.handle("generate-document", async (event, { fieldData }) => {
  log("info", `Generating DOCX — ${fieldData.candidateName || "unknown"}`);
  try {
    // When packaged, templates/ lives in extraResources (outside app.asar).
    // adm-zip cannot read files from inside an .asar archive, so we must use
    // process.resourcesPath when running as a built app.
    const templatePath = app.isPackaged
      ? path.join(process.resourcesPath, "templates", "CPM_Program_Profile_Template_2025_for_CIC_India_1_.docx")
      : path.join(__dirname, "templates", "CPM_Program_Profile_Template_2025_for_CIC_India_1_.docx");
    log("info", `Using bundled template (${app.isPackaged ? "packaged" : "dev"}): ${templatePath}`);

    if (!fs.existsSync(templatePath)) {
      return { success: false, error: "Template not found. Please reinstall the application." };
    }
    const name  = (fieldData.candidateName || "Candidate").replace(/\s+/g, "_");
    const today = new Date().toISOString().slice(0, 10);
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, error: "Application window was closed before the document could be saved." };
    }
    const save  = await dialog.showSaveDialog(mainWindow, {
      title: "Save CPM Profile",
      defaultPath: `CPM_Profile_${name}_${today}.docx`,
      filters: [{ name: "Word Document", extensions: ["docx"] }],
    });
    if (save.canceled) return { success: false, error: "Cancelled" };
    await fillTemplate(fieldData, templatePath, save.filePath);
    log("info", `DOCX saved: ${save.filePath}`);
    return { success: true, filePath: save.filePath };
  } catch (err) {
    log("error", `DOCX failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("open-file", async (event, filePath) => {
  await shell.openPath(filePath); return { success: true };
});

ipcMain.handle("show-open-dialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Documents", extensions: ["pdf","docx","doc","pptx","ppt","xlsx","xls","csv","txt"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled) return [];
  const { basename } = require("path");
  const { statSync  } = require("fs");
  return result.filePaths.map(p => ({
    name: basename(p),
    path: p,
    size: (() => { try { return statSync(p).size; } catch { return 0; } })(),
  }));
});

function filterLabeledDocumentsForProject(labeledText, selectedProject) {
  if (!labeledText || !selectedProject?.found_in_docs?.length) return "";
  const wanted = new Set(
    selectedProject.found_in_docs.map(name => String(name).trim().toLowerCase())
  );
  const sections = labeledText.split(/(?=^={20,}\s*$\n\[DOCUMENT: )/m);
  const filtered = sections.filter(section => {
    const match = section.match(/\[DOCUMENT:\s*(.+?)\]/);
    return match && wanted.has(String(match[1]).trim().toLowerCase());
  });
  return filtered.join("\n\n").trim();
}

// ── Error helpers ─────────────────────────────────────────────────────────────
const RATE_LIMIT_RE = /RateLimitError|Too Many Requests|rate.?limit|429/i;
const AGENT_ERR_RE  = /I apologize|couldn.t generate|I.m sorry|litellm\.|AzureException/i;

function classifyRawText(text) {
  // Returns a clean user-facing error if the agent responded with prose instead of JSON
  if (RATE_LIMIT_RE.test(text)) {
    const err = new Error(
      "The AI service is busy right now (rate limit reached). " +
      "The request will be retried automatically — please wait a moment."
    );
    err.code = "RATE_LIMIT";
    return err;
  }
  if (AGENT_ERR_RE.test(text) && !text.trimStart().startsWith("{")) {
    return new Error(`AI service returned an error: ${text.replace(/\n/g," ").slice(0, 200)}`);
  }
  return null; // text looks like real content
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function looksLikeTruncatedJson(text) {
  const s = (text || "").trim();
  if (!s.startsWith("{") && !s.startsWith("[")) return false;
  if (s.endsWith("}") || s.endsWith("]")) return false;
  return true;
}

function isAgentBlankString(value) {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return false;
  if (["unknown", "n/a", "na", "none", "null", "not available", "not found"].includes(s)) return true;
  if (s.startsWith("unknown ")) return true;
  if (s.includes("not stated")) return true;
  if (s.includes("not provided")) return true;
  if (s.includes("not explicitly described")) return true;
  if (s.includes("not explicitly documented")) return true;
  if (s.includes("not detailed")) return true;
  if (s.includes("not mentioned")) return true;
  return false;
}

function sanitizeAgentPayload(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeAgentPayload);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeAgentPayload(v)])
    );
  }
  if (typeof value === "string" && isAgentBlankString(value)) {
    return null;
  }
  return value;
}

// ── Langflow caller (with retry) ──────────────────────────────────────────────
async function callLangflow(inputPayload, apiKey, timeoutMs, { attempt = 1, maxRetries = 3 } = {}) {
  const sessionId  = `cpm-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const controller = new AbortController();
  const timer      = setTimeout(() => {
    log("warn", `Timeout after ${timeoutMs/1000}s (attempt ${attempt}/${maxRetries})`);
    controller.abort();
  }, timeoutMs);

  log("info", `  -> POST mode=${inputPayload.mode} session=${sessionId} attempt=${attempt}/${maxRetries}`);

  let res;
  try {
    const t0 = Date.now();
    res = await fetch(LANGFLOW_URL, {
      method:  "POST",
      signal:  controller.signal,
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body:    JSON.stringify({
        output_type: "chat",
        input_type:  "chat",
        input_value: JSON.stringify(inputPayload),
        session_id:  sessionId,
      }),
    });
    log("info", `  <- HTTP ${res.status} in ${Date.now()-t0}ms`);
  } catch (fetchErr) {
    clearTimeout(timer);
    // Timeout (AbortError)
    if (fetchErr.name === "AbortError") {
      const msg = `The AI is taking too long to respond (>${timeoutMs/1000}s). ` +
                  (attempt < maxRetries ? "Retrying automatically…" : "Please try again in a moment.");
      const err = new Error(msg); err.code = "TIMEOUT";
      if (attempt < maxRetries) {
        log("warn", `Timeout — retrying in 10s (attempt ${attempt}/${maxRetries})`);
        await sleep(10_000);
        return callLangflow(inputPayload, apiKey, timeoutMs, { attempt: attempt + 1, maxRetries });
      }
      throw err;
    }
    // Network / connectivity error
    const err = new Error(
      "Cannot reach the IBM Agentic Studio. Check your network connection and VPN, then try again.\n" +
      `(${fetchErr.message})`
    );
    err.code = "NETWORK";
    throw err;
  } finally { clearTimeout(timer); }

  // ── HTTP-level errors ──────────────────────────────────────────────────────
  if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
    // Retry-After may be an integer seconds string OR an HTTP-date string; parseInt handles
    // integer form; NaN (date string / missing header) falls through to the backoff array.
    const retryAfterSecs = parseInt(res.headers.get("Retry-After") || "0", 10);
    const retryAfter     = Number.isFinite(retryAfterSecs) && retryAfterSecs > 0 ? retryAfterSecs : 0;
    const backoff        = retryAfter > 0 ? retryAfter * 1000 : [8_000, 20_000, 40_000][attempt - 1] || 40_000;
    if (attempt < maxRetries) {
      log("warn", `HTTP ${res.status} rate limit — retrying in ${backoff/1000}s (attempt ${attempt}/${maxRetries})`);
      await sleep(backoff);
      return callLangflow(inputPayload, apiKey, timeoutMs, { attempt: attempt + 1, maxRetries });
    }
    throw new Error(
      `The AI service is currently overloaded (HTTP ${res.status}). ` +
      "Please wait 30 seconds and try again."
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Langflow error ${res.status} — ${body.slice(0, 200)}`);
  }

  // ── Parse response ─────────────────────────────────────────────────────────
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(
      `Langflow returned a non-JSON response (HTTP ${res.status}). ` +
      "The service may be experiencing issues. Please try again."
    );
  }

  // Extract the text payload — must handle both ChatOutput and A2AClient
  // component response shapes. A2AClient nests the message under
  // outputs.response.message / artifacts.response.raw instead of the
  // standard results.message.text path used by ChatOutput.
  const o = data?.outputs?.[0]?.outputs?.[0]; // inner component output (may be undefined for A2AClient)
  let text =
    // ── ChatOutput (standard) ──────────────────────────────────────────────
    o?.results?.message?.text      ||
    o?.artifacts?.message          ||
    o?.messages?.[0]?.message      ||
    o?.results?.message?.data?.text ||
    // ── A2AClient: nested under outputs / artifacts of the component itself
    o?.outputs?.response?.message  ||
    o?.artifacts?.response?.raw    ||
    // ── A2AClient: when Langflow returns outputs[0].outputs as an object
    data?.outputs?.[0]?.outputs?.response?.message ||
    // ── Generic fallbacks ──────────────────────────────────────────────────
    data?.result || data?.output?.text || "";

  // Some A2AClient repr payloads are double-wrapped: { "text": "<json>" }
  if (!text) {
    const repr = o?.artifacts?.response?.repr || data?.outputs?.[0]?.outputs?.response?.repr;
    if (repr) {
      try { const p = JSON.parse(repr); if (typeof p?.text === "string") text = p.text; } catch {}
    }
  }

  log("info", `  Response shape: outputs[0].outputs type=${Array.isArray(data?.outputs?.[0]?.outputs) ? "array" : typeof data?.outputs?.[0]?.outputs}, text length=${text.length}`);

  if (!text) throw new Error(
    "The AI returned an empty response. The Langflow flow output node may be misconfigured."
  );

  // Strip code fences if present
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  // Detect prose errors BEFORE attempting JSON parse
  const proseErr = classifyRawText(clean);
  if (proseErr) {
    if (proseErr.code === "RATE_LIMIT" && attempt < maxRetries) {
      const backoff = [8_000, 20_000, 40_000][attempt - 1] || 20_000;
      log("warn", `Rate limit in response — retrying in ${backoff/1000}s (attempt ${attempt}/${maxRetries})`);
      await sleep(backoff);
      return callLangflow(inputPayload, apiKey, timeoutMs, { attempt: attempt + 1, maxRetries });
    }
    log("error", `Agent prose error: ${clean.slice(0, 200)}`);
    throw proseErr;
  }

  // Parse JSON
  try {
    const parsed = sanitizeAgentPayload(JSON.parse(clean));
    log("info", `  OK JSON parsed — mode: ${parsed.mode || "unknown"}`);
    return parsed;
  } catch {
    log("error", `Agent response not valid JSON. Raw head: ${clean.slice(0, 400)}`);
    log("error", `Agent response not valid JSON. Raw tail: ${clean.slice(-400)}`);
    if (attempt < maxRetries && looksLikeTruncatedJson(clean)) {
      log("warn", `JSON looked truncated — retrying in 5s (attempt ${attempt}/${maxRetries})`);
      await sleep(5_000);
      return callLangflow(inputPayload, apiKey, timeoutMs, { attempt: attempt + 1, maxRetries });
    }
    throw new Error(
      "The AI returned a response that could not be parsed. It may have been truncated because the response was too long.\n\n" +
      `Preview: ${clean.slice(0, 300)}`
    );
  }
}

const ALL_FIELDS = [
  "candidateName","email","market","serviceLine","practice","primaryRole",
  "clientName","programTitle","overallProgramTitle","profileProjectName",
  "owningServiceLine","ippfContractIds","isComplex",
  "tcvTotal","tcvManaged","startDate","endDate",
  "fteTotal","fteOnshore","fteOffshore","fteContract",
  "managerName","managerEmail","orgStructure",
  "phases","scopeAndResponsibilities",
  "financialBaseline","financialVariance","financialManagementSystem",
  "revenueActual","costActual","gpActual","gpPercent",
  "varianceReason","varianceManagement","commercialConstruct","riskReward",
  "leadershipBehaviors","complexityFactors",
  "projectOutcomes","contractualDeliverables","otherOutcomes","lessonsLearned",
];

const CRITICAL_FIELDS = [
  "candidate_scope","project_scope","complexity_factors",
  "project_outcomes","financial_performance","leadership_behaviors",
];

