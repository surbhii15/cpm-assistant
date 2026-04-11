# CPM Application Assistant
### IBM Complex Program Manager Profile Builder — Electron App v2.1

---

## Project Structure

```
cpm-app/
├── main.js                      ← Electron main process + IPC handlers
├── preload.js                   ← Secure bridge (renderer ↔ main)
├── package.json
│
├── renderer/
│   └── index.html               ← Full UI (5-step wizard, dark theme)
│
├── services/
│   ├── fileProcessing.js        ← Extract text from PDF/DOCX/PPTX/XLSX/CSV
│   ├── templateFiller.js        ← Fill the real IBM .docx template ← NEW
│   └── docGenerator.js          ← (backup) generate DOCX from scratch
│
└── templates/                   ← ⚠️ PUT YOUR TEMPLATE HERE
    └── CPM_Program_Profile_Template_2025_for_CIC_India_1_.docx
```

---

## ⚠️ Important — Template Setup

**Before running the app**, create the `templates/` folder and copy your `.docx` template into it:

```
cpm-app/
└── templates/
    └── CPM_Program_Profile_Template_2025_for_CIC_India_1_.docx
```

**Windows:**
```powershell
mkdir templates
copy "CPM_Program_Profile_Template_2025_for_CIC_India_1_.docx" templates\
```

**Mac/Linux:**
```bash
mkdir templates
cp CPM_Program_Profile_Template_2025_for_CIC_India_1_.docx templates/
```

---

## How Template Filling Works

The template has **69 `<complete>` placeholders** spread across all sections.

`templateFiller.js` works by:
1. Unzipping the `.docx` (which is a ZIP of XML files)
2. Opening `word/document.xml`
3. Replacing each `&lt;complete&gt;` token **in order** with the AI-generated value
4. Repacking everything back into a new `.docx`

This preserves IBM's exact formatting, fonts, tables, and layout — only the placeholder text is replaced.

### Placeholder Mapping (in document order)

| # | Field | Source |
|---|-------|--------|
| 1 | Section marker | Auto |
| 2 | Candidate Name | Form / Agent |
| 3 | Email ID | Form / Agent |
| 4 | Market | Form / Agent |
| 5 | Service Line | Form / Agent |
| 6 | Practice | Form / Agent |
| 7 | Client Name | Form / Agent |
| 8 | Manager Name & Email | Form / Agent |
| 9–10 | Program Title (overall / profile) | Agent |
| 11–12 | IPPF Contract IDs | Form / Agent |
| 13–16 | Start & End Dates | Form |
| 17 | Owning Service Line | Agent |
| 18–19 | Complex Y/N | Form |
| 20–21 | Primary Role | Form |
| 22–23 | TCV & Managed Value | Form |
| 24–25 | FTEs total | Form |
| 26 | FTE split (onshore/offshore/contract) | Form |
| 27 | Org structure | Agent |
| 28–35 | Phase 1 details | Agent |
| 36 | General scope responsibilities | Agent |
| 37–49 | AO / HCD / SAP sections | Agent (N/A if not applicable) |
| 50–58 | Leadership behaviours (9 behaviours) | Agent |
| 59–60 | Complexity #1 (FOAK) | Agent |
| 61–69 | Financial outcomes, variances, commercial | Agent / Form |

---

## Setup & Run

```bash
# 1. Install dependencies
cd cpm-app
npm install

# 2. Place template in templates/ folder (see above)

# 3. Start the app
npm start
```

---

## API Configuration

Click **⚙ API Configuration** (bottom-left of the app sidebar) to enter:

- **Langflow API URL** — from your Langflow flow's "API" tab
- **API Key** — from Langflow Settings → API Keys

If no API is configured, the app runs in **fallback mode** — it builds the document directly from your form answers without calling an external AI agent.

---

## Data Flow

```
Upload files
    ↓
fileProcessing.js  →  extract + chunk + rank text
    ↓
Gap Form  →  candidate fills required missing fields
    ↓
Langflow Agent  →  maps data, writes professional content, returns JSON
    ↓
templateFiller.js  →  replaces <complete> markers in real IBM .docx template
    ↓
User saves filled .docx to their chosen location
```

sk-RoRwFdmDzN5eT1WnmrszNtKlSNqXFvtl9Bue3jW0GdE

agent - ak_IiECRNbMBbmlnd_tC47kZjIJlmwzVw_lcLUVF67Mz04