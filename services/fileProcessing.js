const fs   = require("fs");
const path = require("path");

/**
 * processFiles — extracts and chunks text from uploaded documents.
 * @param {Array<{name:string, path:string}>} files
 * @returns {{ extractedText:string, filesSummary:Array }}
 */
async function processFiles(files) {
  const results = [];

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();
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
      results.push({ fileName:file.name, ext, status:"ok", chunks, chunkCount:chunks.length, preview:cleaned.slice(0,500) });
    } catch (err) {
      results.push({ fileName:file.name, ext, status:"error", error:err.message, chunks:[], chunkCount:0 });
    }
  }

  const ranked       = rankChunks(results.flatMap(r => r.chunks || []));
  const extractedText = ranked.slice(0, 80).map(c => `--- [${c.source}] ---\n${c.text}`).join("\n\n");

  return {
    extractedText,
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
  const data = await pdfParse(fs.readFileSync(filePath));
  return data.text;
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