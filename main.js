const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path  = require("path");
const fs    = require("fs");
const fetch = require("node-fetch");
const processFiles     = require("./services/fileProcessing");
const { fillTemplate } = require("./services/templateFiller");

const LANGFLOW_URL =
  "https://langflow.servicesessentials.ibm.com/api/v1/run/1b54bdbc-fe2e-48b1-9f54-90391ecd5482";

const TIMEOUT_DETECT   =  60_000;
const TIMEOUT_ANALYZE  = 120_000;
const TIMEOUT_COMPLETE = 180_000;

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

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── IPC 1: Extract files ──────────────────────────────────────────────────────
ipcMain.handle("process-files", async (event, filePaths) => {
  log("info", `Processing ${filePaths.length} file(s)`);
  try {
    const files = filePaths.map(p => ({ name: path.basename(p), path: p }));
    const result = await processFiles(files);
    log("info", `Extraction done — ${result.extractedText.length} chars, ${result.filesSummary.length} files`);
    return { success: true, data: result };
  } catch (err) {
    log("error", `File processing failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// ── IPC 2: Detect projects ────────────────────────────────────────────────────
ipcMain.handle("agent-detect-projects", async (event, { extractedText, apiKey }) => {
  log("info", "▶ DETECT-PROJECTS started");
  const inputPayload = {
    mode: "detect_projects",
    documents: extractedText,
    instruction: `Scan the documents and identify projects/programs where the candidate held a
    DELIVERY LEADERSHIP role eligible for CPM accreditation.

    INCLUDE ONLY roles such as:
    - Program Manager, Project Manager, Senior Project Manager
    - Delivery Project Executive (DPE), Project Executive (PE)
    - Complex Program Manager (CPM)
    - Portfolio Manager, Delivery Manager
    - Scrum Master / Senior Scrum Master when combined with PM accountability
    - Any role with explicit P&L, financial, or delivery accountability

    EXCLUDE roles such as:
    - Developer, Technical Lead, Team Lead, Consultant, Architect
    - Individual contributor roles without delivery accountability
    - Short engagements under 6 months unless TCV is substantial
    - Support/maintenance roles without program management scope

    For each eligible project, assess CPM suitability based on:
    - TCV size (higher = better; check against IBM service line clip levels)
    - Program complexity (multi-country, FOAK, regulated, large team)
    - Candidate\'s personal accountability (E2E vs partial)
    - Duration (longer = more evidence)

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
          "suitability_reason": "Why suitable or not - reference TCV, complexity, role"
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
ipcMain.handle("agent-analyze", async (event, { extractedText, selectedProject, apiKey }) => {
  log("info", `▶ ANALYZE started — project: "${selectedProject?.title || "not specified"}"`);
  const projectContext = selectedProject
    ? `SELECTED PROJECT: ${selectedProject.title} | Client: ${selectedProject.client} | Role: ${selectedProject.role} | Duration: ${selectedProject.duration}\nIMPORTANT: Extract data ONLY for this specific project. Ignore all others.`
    : "No project selected — use the most prominent project.";

  const inputPayload = {
    mode: "analyze",
    documents: extractedText,
    selected_project: projectContext,
    template_fields: ALL_FIELDS,
    critical_fields: CRITICAL_FIELDS,
  };
  try {
    const t0 = Date.now();
    const result = await callLangflow(inputPayload, apiKey, TIMEOUT_ANALYZE);
    log("info", `▶ ANALYZE done in ${((Date.now()-t0)/1000).toFixed(1)}s — fields: ${Object.values(result.filled_fields||{}).filter(v=>v&&v!=="—").length}, questions: ${(result.questions||[]).length}`);
    return { success: true, data: result };
  } catch (err) {
    log("error", `ANALYZE failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// ── IPC 4: Complete draft ─────────────────────────────────────────────────────
ipcMain.handle("agent-complete", async (event, { filledFields, answers, apiKey }) => {
  log("info", `▶ COMPLETE started — answers: ${Object.keys(answers).length}`);
  const inputPayload = {
    mode: "complete",
    filled_fields: filledFields,
    answers,
    instructions:
      "Merge answers into filled_fields. Enhance all content to professional CPM submission " +
      "quality using IBM CPM language. Map complexity to IBM official categories. " +
      "Write leadership behaviors as STAR examples. Return complete JSON.",
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

// ── IPC 5: Generate DOCX ─────────────────────────────────────────────────────
ipcMain.handle("generate-document", async (event, { fieldData }) => {
  log("info", `Generating DOCX — ${fieldData.candidateName || "unknown"}`);
  try {
    const templatePath = () => {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      "templates",
      "CPM_Program_Profile_Template_2025_for_CIC_India_1_.docx"
    );
  } else {
    return path.join(
      __dirname,
      "templates",
      "CPM_Program_Profile_Template_2025_for_CIC_India_1_.docx"
    );
  }
};
    const name  = (fieldData.candidateName || "Candidate").replace(/\s+/g, "_");
    const today = new Date().toISOString().slice(0, 10);
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

// ── Langflow caller ───────────────────────────────────────────────────────────
async function callLangflow(inputPayload, apiKey, timeoutMs) {
  const sessionId  = `cpm-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const controller = new AbortController();
  const timer      = setTimeout(() => { log("warn", `Timeout after ${timeoutMs/1000}s`); controller.abort(); }, timeoutMs);

  log("info", `  -> POST mode=${inputPayload.mode} session=${sessionId} timeout=${timeoutMs/1000}s`);

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
  } finally { clearTimeout(timer); }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Langflow ${res.status} — ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text =
    data?.outputs?.[0]?.outputs?.[0]?.results?.message?.text      ||
    data?.outputs?.[0]?.outputs?.[0]?.artifacts?.message           ||
    data?.outputs?.[0]?.outputs?.[0]?.messages?.[0]?.message       ||
    data?.outputs?.[0]?.outputs?.[0]?.results?.message?.data?.text ||
    data?.result || data?.output?.text || "";

  if (!text) throw new Error("Agent returned empty response. Check Langflow flow output node.");

  const clean = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
  try {
    const parsed = JSON.parse(clean);
    log("info", `  OK JSON parsed — mode: ${parsed.mode || "unknown"}`);
    return parsed;
  } catch {
    log("error", `  JSON parse failed. Raw: ${clean.slice(0, 300)}`);
    throw new Error(`Agent response not valid JSON.\n\nRaw:\n${clean.slice(0, 400)}`);
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
