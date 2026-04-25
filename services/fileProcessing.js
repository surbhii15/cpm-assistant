const fs   = require("fs");
const path = require("path");

/**
 * processFiles — extracts and chunks text from uploaded documents.
 * @param {Array<{name:string, path:string}>} files
 * @returns {{ extractedText:string, filesSummary:Array }}
 */
const MAX_FILE_MB = 30;

async function processFiles(files) {
  const results = [];

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();

    // Skip Office temp/lock files (e.g. ~$filename.pptx) — they are binary
    // lock files, not real documents, and will crash any parser.
    if (path.basename(file.name).startsWith("~$")) {
      results.push({ fileName:file.name, ext, status:"error",
        error:"Skipped — this is a temporary Office lock file (~$). Close the original file in Office and try again.",
        chunks:[], chunkCount:0 });
      continue;
    }

    // Warn and skip files that are too large to process reliably.
    const sizeMB = (fs.statSync(file.path).size / 1048576);
    if (sizeMB > MAX_FILE_MB) {
      results.push({ fileName:file.name, ext, status:"error",
        error:`Skipped — file is ${sizeMB.toFixed(0)} MB (limit ${MAX_FILE_MB} MB). Compress images in the file and try again.`,
        chunks:[], chunkCount:0 });
      continue;
    }

    try {
      let text = "";
      switch (ext) {
        case ".pdf":          text = await extractPDF(file.path);   break;
        case ".docx":
        case ".doc":          text = await extractDOCX(file.path);  break;
        case ".pptx":
        case ".ppt":          text = await extractPPTX(file.path);  break;
        case ".xlsx":
        case ".xls":          text = await extractXLSX(file.path);  break;
        case ".csv":          text = fs.readFileSync(file.path, "utf8"); break;
        case ".txt":          text = fs.readFileSync(file.path, "utf8"); break;
        default:              text = `[Unsupported file type: ${ext}]`;
      }
      const cleaned = cleanText(text);
      const chunks  = chunkText(cleaned, file.name);
      // Warn when a PDF returns near-empty text — almost always a scanned/image PDF
      const warn = (ext === ".pdf" || ext === ".docx") && cleaned.length < 100 && cleaned.length > 0;
      results.push({
        fileName:file.name, ext, status: warn ? "warn" : "ok",
        warning: warn ? "Very little text extracted — this may be a scanned or image-based file." : undefined,
        chunks, chunkCount:chunks.length, cleanedText:cleaned, preview:cleaned.slice(0,500)
      });
    } catch (err) {
      results.push({ fileName:file.name, ext, status:"error", error:err?.message || String(err), chunks:[], chunkCount:0 });
    }
  }

  const ranked       = rankChunks(results.flatMap(r => r.chunks || []));
  const extractedText = ranked.slice(0, 80).map(c => `--- [${c.source}] ---\n${c.text}`).join("\n\n");

  // Build labeled text: full cleaned content per document, clearly separated.
  // Used by detect-projects so the agent can identify which projects appear
  // in which documents and rank cross-document matches highest.
  const SEP = "=".repeat(60);
  const labeledText = results
    .filter(r => r.status === "ok" && r.cleanedText)
    .map(r => `${SEP}\n[DOCUMENT: ${r.fileName}]\n${SEP}\n${r.cleanedText}`)
    .join("\n\n");

  const docNames = results.filter(r => r.status === "ok").map(r => r.fileName);

  return {
    extractedText,
    labeledText,
    docNames,
    filesSummary: results.map(r => ({
      fileName:   r.fileName,
      status:     r.status,
      error:      r.error,
      chunkCount: r.chunkCount,
      preview:    r.preview,
    })),
  };
}

async function extractPDF(filePath) {
  const pdfParse = require("pdf-parse");
  // Suppress noisy TrueType font warnings from pdfjs-dist internals
  const _warn = console.warn;
  console.warn = () => {};
  try {
    const data = await pdfParse(fs.readFileSync(filePath));
    return data.text;
  } finally {
    console.warn = _warn;
  }
}

async function extractDOCX(filePath) {
  const mammoth = require("mammoth");
  const result  = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function extractPPTX(filePath) {
  try {
    const pptx2json = require("pptx2json");
    const data = await pptx2json(filePath);
    const texts = [];
    if (data?.slides) {
      for (const slide of data.slides)
        if (slide.texts) texts.push(...slide.texts.map(t => typeof t === "string" ? t : t.text || ""));
    }
    return texts.join("\n");
  } catch {
    const AdmZip = require("adm-zip");
    return new AdmZip(filePath).getEntries()
      .filter(e => e.entryName.match(/ppt\/slides\/slide\d+\.xml/))
      .map(e => e.getData().toString("utf8").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim())
      .join("\n\n");
  }
}

async function extractXLSX(filePath) {
  const XLSX = require("xlsx");
  const wb   = XLSX.readFile(filePath);
  return wb.SheetNames.map(n => `=== Sheet: ${n} ===\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join("\n\n");
}

function cleanText(text) {
  if (!text || typeof text !== "string") return "";
  return text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").replace(/\t/g," ")
             .replace(/[^\S\n]+/g," ").replace(/\n{3,}/g,"\n\n").trim();
}

function chunkText(text, source, maxLen=600, overlap=100) {
  const chunks = [];
  let buffer   = "";
  for (const para of text.split(/\n\n+/)) {
    if ((buffer + para).length > maxLen) {
      if (buffer.trim()) chunks.push({ source, text:buffer.trim() });
      buffer = buffer.slice(-overlap) + "\n\n" + para;
    } else {
      buffer += (buffer ? "\n\n" : "") + para;
    }
  }
  if (buffer.trim()) chunks.push({ source, text:buffer.trim() });
  return chunks;
}

const CPM_KEYWORDS = [
  "project","program","manager","management","delivery","client","ibm",
  "revenue","budget","fte","scope","contract","phase","complexity","outcome",
  "tcv","financial","stakeholder","risk","team","led","managed","delivered",
  "responsible","accountable","agile","integration","transformation",
];

function rankChunks(chunks) {
  return chunks
    .map(c => {
      const lower = c.text.toLowerCase();
      const score = CPM_KEYWORDS.reduce((a,kw) => a + (lower.match(new RegExp(kw,"g"))||[]).length, 0);
      return { ...c, score };
    })
    .sort((a,b) => b.score - a.score);
}

module.exports = processFiles;