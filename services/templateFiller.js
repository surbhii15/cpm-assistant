/**
 * templateFiller.js — v5
 *
 * Updated for the new template with 154 <complete> tokens (after Pass 1 normalisation).
 *
 * TOKEN MAP (154 tokens, confirmed from XML analysis after Pass 1 normalisation):
 *  #1        Intro marker
 *  #2        Candidate Name
 *  #3        Email ID
 *  #4        Market
 *  #5        Service Line
 *  #6        Practice
 *  #7        Client Name (top summary)
 *  #8        Program/Project Title (WBS short description)
 *  #9        Owning Service Line
 *  #10       IPPF WBS ID / Contract IDs
 *  #11       Complex Y/N
 *  #12       Primary Role
 *  #13       TCV Total
 *  #14       Start Date
 *  #15       End Date
 *  #16       FTEs Total
 *  #17       FTEs onshore
 *  #18       FTEs offshore
 *  #19       # Contracts
 *  #20       Client Name (profile table)
 *  #21       Manager Name + Email
 *  #22       Overall Program Title
 *  #23       Profile Project Name
 *  #24       IPPF Contract IDs (overall program)
 *  #25       IPPF Contract IDs (profile scope)
 *  #26       Start Date (overall program col)
 *  #27       Start Date (profile scope col)
 *  #28       End Date (overall program col)
 *  #29       End Date (profile scope col)
 *  #30       Owning Service Line (profile table)
 *  #31       Complex Y/N (IPPF col)
 *  #32       Complex Y/N (by IPPF col)
 *  #33       Primary Role (overall program)
 *  #34       Primary Role (work managed)
 *  #35       TCV Total (profile table row)
 *  #36       TCV Managed (profile table row)
 *  #37       FTEs (profile table)
 *  #38       FTEs Total (profile table)
 *  #39       FTEs split by location
 *  #40–49    Org diagram shape labels (manager/team names in org chart)
 *  #50       Phase 1 name
 *  #51       Phase 1 duration
 *  #52       Phase 1 from date
 *  #53       Phase 1 to date
 *  #54       Phase 1 description
 *  #55–62    Phase 1 detail rows (e2e, scope, delivery model, solution, tech, commercial, genAI, AO)
 *  #63       Phase 2 name
 *  #64       Phase 2 duration
 *  #65       Phase 2 from date
 *  #66       Phase 2 to date
 *  #67       Phase 2 description
 *  #68       Phase 3 name
 *  #69       Phase 3 duration
 *  #70       Phase 3 from date
 *  #71       Phase 3 to date
 *  #72       Phase 3 description
 *  #73       E2E responsibility Y/N
 *  #74       If N — exact responsibilities
 *  #75       Scope & Responsibilities narrative
 *  #76–83    Service line specific (AO, HCD, SAP) — N/A for most
 *  #84–92    SAP-specific rows
 *  #93–99    Additional scope/org detail rows
 *  #100      Leadership: Customer Relationships
 *  #101      Leadership: Embracing Change
 *  #102      Leadership: Negotiation
 *  #103      Leadership: Communication Skills
 *  #104      Leadership: Problem Solving
 *  #105      Leadership: Collaboration
 *  #106      Leadership: Mentoring
 *  #107      Leadership: Delegation
 *  #108      Leadership: Leadership
 *  #109–110  Complexity FOAK: elaboration, actions
 *  #111–112  Complexity CSI: elaboration, actions
 *  #113–114  Complexity Cross-Brand: elaboration, actions
 *  #115–116  Complexity Project Delivery: elaboration, actions
 *  #117–118  Complexity Client Environment: elaboration, actions
 *  #119–120  Complexity Client Transformation: elaboration, actions
 *  #121–122  Complexity Contract Terms: elaboration, actions
 *  #123–124  Complexity Inclusion: elaboration, actions
 *  #125      Project Outcomes
 *  #126      Other Outcomes / NPS
 *  #127      VaC% / Financial Baseline intro
 *  #128–131  Financial table header cells
 *  #132      Planned/Actual label
 *  #133–136  Revenue (4 cols)
 *  #137–140  Cost (4 cols)
 *  #141–144  GP (4 cols)
 *  #145–148  GP% (4 cols)
 *  #149      Variance reason
 *  #150      Variance management
 *  #151      Commercial Construct
 *  #152      Risk/Reward
 *  #153      Penalties / contract notes
 *  #154      IPPF screenshot notes
 */

const fs     = require("fs");
const AdmZip = require("adm-zip");

async function fillTemplate(data, templatePath, outputPath) {
  // Pass a buffer rather than a path so adm-zip never tries to open the file
  // itself — important when the path is inside an Electron .asar archive.
  const zip      = new AdmZip(fs.readFileSync(templatePath));
  const docEntry = zip.getEntry("word/document.xml");
  if (!docEntry) throw new Error("Template missing word/document.xml");
  let xml = docEntry.getData().toString("utf8");

  // Pass 1 — normalise split-run <complete> markers
  xml = xml.replace(
    /<w:t>&lt;<\/w:t>([\s\S]*?)<w:t>complete&gt;<\/w:t>/g,
    (_, m) => `<w:t>&lt;complete&gt;</w:t>${m}<w:t></w:t>`
  );
  xml = xml.replace(
    /<w:t>&lt;<\/w:t>([\s\S]*?)<w:t>complete<\/w:t>([\s\S]*?)<w:t>&gt;<\/w:t>/g,
    (_, b, a) => `<w:t>&lt;complete&gt;</w:t>${b}<w:t></w:t>${a}<w:t></w:t>`
  );

  // Pass 2 — replace all 154 tokens in order (lowercase <complete> only)
  const R = buildReplacements(data);
  let idx = 0;
  xml = xml.replace(/&lt;complete&gt;[ \u00a0]*/g, () => {
    const val = R[idx] !== undefined ? R[idx] : "";
    idx++;
    return sanitise(String(val || ""));
  });
  console.log(`Pass 2: ${idx} tokens replaced`);

  // Pass 3 — strip remaining guidance/example/SAP placeholder text
  // Note: XML encodes & as &amp; so [^&] stops too early — use xmlPh() to match
  // any placeholder content including embedded &amp; sequences.
  const xmlPh = prefix => new RegExp(`&lt;${prefix}(?:[^&]|&amp;)*&gt;`, "gi");

  xml = xml.replace(xmlPh("e\\.g\\."), "");
  xml = xml.replace(xmlPh("description up to"), "");
  xml = xml.replace(/&lt;Guidance&gt;[\s\S]*?&lt;\/Guidance&gt;/g, "");
  xml = xml.replace(/&lt;(?:[^&]|&amp;){0,120}\/(?:[^&]|&amp;){0,120}&gt;/g, "");
  xml = xml.replace(xmlPh("Provide evidence|Complete where applicable"), "");
  xml = xml.replace(xmlPh("If this is a Program"), "");
  xml = xml.replace(xmlPh("Successfully led"), "");
  xml = xml.replace(xmlPh("Completed Industry Certification"), "");
  xml = xml.replace(xmlPh("Experience"), "");
  xml = xml.replace(xmlPh("Knowledge"), "");
  xml = xml.replace(xmlPh("Describe what specific"), "");
  xml = xml.replace(xmlPh("Refer to Describing"), "");
  xml = xml.replace(xmlPh("What made it complex\\?"), "");
  xml = xml.replace(xmlPh("Not applicable"), "");
  // Final catch-all: remove any remaining <...> template placeholder (up to 200 chars)
  xml = xml.replace(/&lt;(?:[^&]|&amp;){1,200}&gt;/g, "");

  zip.updateFile("word/document.xml", Buffer.from(xml, "utf8"));
  updateCoreProps(zip, data);
  zip.writeZip(outputPath);

  const rem = (xml.match(/&lt;complete&gt;/gi) || []).length;
  console.log(`✅ Done — ${rem} tokens remaining unfilled`);
}

// ─────────────────────────────────────────────────────────────────────────────
function buildReplacements(d) {
  const lb = d.leadershipBehaviors || {};
  const cf = Array.isArray(d.complexityFactors) ? d.complexityFactors : [];

  const NV = "Not available";
  const na = "Not applicable to this profile.";

  // Find a complexity factor by keyword match.
  // Primary: match against factor/name field.
  // Secondary: match against elaboration+actions text (catches unnamed factors).
  const findCF = (...keys) => {
    const byName = cf.find(c => {
      const n = (c.factor || c.name || "").toLowerCase();
      return keys.some(k => n.includes(k));
    });
    if (byName) return byName;
    return cf.find(c => {
      const body = ((c.elaboration||"")+" "+(c.actions||"")).toLowerCase();
      return keys.some(k => body.includes(k));
    }) || {};
  };

  // Find a leadership behaviour by keyword-matching across all lb keys.
  // Agent may use keys like Client_focus, Win_as_a_team, Negotiation_and_influence, etc.
  // Strip underscores/spaces before comparing so "clientfocus" matches "client".
  const lbStr = (val) => {
    if (!val) return null;
    if (typeof val === "string") return val.trim() || null;
    return (val.text || val.description || val.summary || JSON.stringify(val)) || null;
  };
  const findLB = (...keywords) => {
    // First pass: match by key name
    for (const key of Object.keys(lb)) {
      const norm = key.toLowerCase().replace(/[_\s-]+/g, "");
      if (keywords.some(kw => norm.includes(kw.replace(/[_\s-]+/g, "")))) {
        const v = lbStr(lb[key]);
        if (v) return v;
      }
    }
    // Second pass: match by value content (agent embeds category label in the text)
    for (const key of Object.keys(lb)) {
      const v = lbStr(lb[key]);
      if (!v) continue;
      const vLow = v.toLowerCase();
      if (keywords.some(kw => vLow.includes(kw.replace(/[_\s-]+/g, "")))) return v;
    }
    return NV;
  };

  const foak = findCF("first","foak");
  const csi  = findCF("integrat","csi","system");
  const cbdm = findCF("cross","multi","brand");
  const pd   = findCF("project del","delivery");
  const ce   = findCF("client env","environ","psu","regulat");
  const ct   = findCF("transform","change");
  const cts  = findCF("contract","term","commercial","cts");
  const ide  = findCF("inclusion","excellence","ide");

  // Financial — use null-check (not falsy ||) so 0 is kept, not replaced with NV
  const fin = (v) => (v != null && v !== "") ? v : NV;
  const revPlanned  = fin(d.revenuePlanned);
  const revActual   = fin(d.revenueActual);
  const costPlanned = fin(d.costPlanned);
  const costActual  = fin(d.costActual);
  const gpPlanned   = fin(d.gpPlanned);
  const gpActual    = fin(d.gpActual);
  const gpPctPlan   = fin(d.gpPercentPlanned);
  const gpPctAct    = fin(d.gpPercent);

  const varR    = d.varianceReason     || "Delivered within approved price case parameters.";
  const varM    = d.varianceManagement || "Active financial monitoring through IBM IPPF with regular EAC reviews.";
  const comm    = d.commercialConstruct|| "Services-based contract with milestone-linked deliverables.";
  const rr      = d.riskReward         || "Standard IBM contract — no risk/reward arrangement.";
  const finBase = d.financialBaseline  || `TCV: ${d.tcvTotal||NV} | Managed: ${d.tcvManaged||NV}`;

  // Normalise phase — agent may return phases as strings, objects, or primitives
  const normPhase = (p) => {
    if (!p) return {};
    if (typeof p === "string") return { name: p, description: p };
    if (typeof p !== "object") return {};  // guard: number/boolean/etc. → safe empty
    return p;
  };
  const ph1 = normPhase(Array.isArray(d.phases) ? d.phases[0] : null);
  const ph2 = normPhase(Array.isArray(d.phases) ? d.phases[1] : null);
  const ph3 = normPhase(Array.isArray(d.phases) ? d.phases[2] : null);

  const fteOnshore  = d.fteOnshore  || NV;
  const fteOffshore = d.fteOffshore || NV;
  const fteContract = d.fteContract || NV;
  const fteSplit    = `Onshore: ${fteOnshore}  Offshore: ${fteOffshore}  Contract: ${fteContract}`;

  return [
    /* 001 */ "Completed — CPM Application Assistant",
    /* 002 */ d.candidateName        || NV,
    /* 003 */ d.email                || NV,
    /* 004 */ d.market               || NV,
    /* 005 */ d.serviceLine          || NV,
    /* 006 */ d.practice             || NV,
    /* 007 */ d.clientName           || NV,
    /* 008 */ d.programTitle         || NV,
    /* 009 */ d.owningServiceLine    || d.serviceLine || NV,
    /* 010 */ d.ippfContractIds      || NV,
    /* 011 */ d.isComplex            || "Yes",
    /* 012 */ d.primaryRole          || NV,
    /* 013 */ d.tcvTotal ? "$" + d.tcvTotal : NV,
    /* 014 */ d.startDate            || NV,
    /* 015 */ d.endDate              || NV,
    /* 016 */ d.fteTotal             || NV,
    /* 017 */ fteOnshore,
    /* 018 */ fteOffshore,
    /* 019 */ fteContract,
    /* 020 */ d.clientName           || NV,
    /* 021 */ (d.managerName||NV) + "  |  " + (d.managerEmail||NV),
    /* 022 */ d.overallProgramTitle  || d.programTitle || NV,
    /* 023 */ d.profileProjectName   || d.programTitle || NV,
    /* 024 */ d.ippfContractIds      || NV,
    /* 025 */ d.ippfContractIds      || NV,
    /* 026 */ d.startDate            || NV,
    /* 027 */ d.startDate            || NV,
    /* 028 */ d.endDate              || NV,
    /* 029 */ d.endDate              || NV,
    /* 030 */ d.owningServiceLine    || d.serviceLine || NV,
    /* 031 */ d.isComplex            || "Yes",
    /* 032 */ d.isComplex            || "Yes",
    /* 033 */ d.primaryRole          || NV,
    /* 034 */ d.primaryRole          || NV,
    /* 035 */ d.tcvTotal ? "$" + d.tcvTotal : NV,
    /* 036 */ d.tcvManaged ? "$" + d.tcvManaged : NV,
    /* 037 */ d.fteTotal             || NV,
    /* 038 */ d.fteTotal             || NV,
    /* 039 */ fteSplit,
    // Org diagram (#40-49)
    /* 040 */ d.candidateName        || "IBM PM",
    /* 041 */ d.clientName           || "Client",
    /* 042 */ d.managerName          || "Delivery Manager",
    /* 043 */ "Onshore Team",
    /* 044 */ "Offshore Team",
    /* 045 */ "Workstream Lead 1",
    /* 046 */ "Workstream Lead 2",
    /* 047 */ "Integration Partner",
    /* 048 */ "Test/QA Lead",
    /* 049 */ "Business Analyst",
    // Phase 1 (#50-62)
    /* 050 */ ph1.name        || d.programTitle || "Full Delivery",
    /* 051 */ ph1.duration    || (d.startDate||NV) + " - " + (d.endDate||NV),
    /* 052 */ ph1.fromDate    || d.startDate    || NV,
    /* 053 */ ph1.toDate      || d.endDate      || NV,
    /* 054 */ ph1.description || d.scopeAndResponsibilities || NV,
    /* 055 */ ph1.e2eResponsibility     || "Yes",
    /* 056 */ ph1.exactResponsibilities || d.scopeAndResponsibilities || NV,
    /* 057 */ ph1.deliveryModel         || "Hybrid onshore-offshore agile delivery.",
    /* 058 */ ph1.solution              || na,
    /* 059 */ ph1.technology            || na,
    /* 060 */ ph1.commercial            || d.commercialConstruct || "Services contract with milestone deliverables.",
    /* 061 */ ph1.genAI                 || na,
    /* 062 */ ph1.aoDetails             || na,
    // Phase 2 (#63-67)
    /* 063 */ ph2.name        || NV,
    /* 064 */ ph2.duration    || NV,
    /* 065 */ ph2.fromDate    || NV,
    /* 066 */ ph2.toDate      || NV,
    /* 067 */ ph2.description || NV,
    // Phase 3 (#68-72)
    /* 068 */ ph3.name        || NV,
    /* 069 */ ph3.duration    || NV,
    /* 070 */ ph3.fromDate    || NV,
    /* 071 */ ph3.toDate      || NV,
    /* 072 */ ph3.description || NV,
    /* 073 */ "Yes",
    /* 074 */ d.scopeAndResponsibilities || NV,
    /* 075 */ d.scopeAndResponsibilities || NV,
    // Service-line specific: AO (#76-78), HCD (#79-83), SAP (#84-99)
    /* 076 */ na,  /* 077 */ na,  /* 078 */ na,
    /* 079 */ na,  /* 080 */ na,  /* 081 */ na,  /* 082 */ na,  /* 083 */ na,
    /* 084 */ na,  /* 085 */ na,  /* 086 */ na,  /* 087 */ na,  /* 088 */ na,
    /* 089 */ na,  /* 090 */ na,  /* 091 */ na,  /* 092 */ na,
    /* 093 */ na,  /* 094 */ na,  /* 095 */ na,  /* 096 */ na,
    /* 097 */ na,  /* 098 */ na,  /* 099 */ na,
    // Leadership Behaviours (#100-108)
    /* 100 */ findLB("customer","client","relationship"),
    /* 101 */ findLB("change","embrac","adapt","agil"),
    /* 102 */ findLB("negotiat","influenc"),
    /* 103 */ findLB("communicat","present","stakeholder"),
    /* 104 */ findLB("problem","solv","analyt","critical"),
    /* 105 */ findLB("collaborat","team","win"),
    /* 106 */ findLB("mentor","coach","develop","grow"),
    /* 107 */ findLB("delegat","empower"),
    /* 108 */ findLB("leadership","strateg","vision","direct"),
    // Complexity (#109-124) — pairs of elaboration + actions
    /* 109 */ foak.elaboration || NV,  /* 110 */ foak.actions || NV,
    /* 111 */ csi.elaboration  || NV,  /* 112 */ csi.actions  || NV,
    /* 113 */ cbdm.elaboration || NV,  /* 114 */ cbdm.actions || NV,
    /* 115 */ pd.elaboration   || NV,  /* 116 */ pd.actions   || NV,
    /* 117 */ ce.elaboration   || NV,  /* 118 */ ce.actions   || NV,
    /* 119 */ ct.elaboration   || NV,  /* 120 */ ct.actions   || NV,
    /* 121 */ cts.elaboration  || NV,  /* 122 */ cts.actions  || NV,
    /* 123 */ ide.elaboration  || NV,  /* 124 */ ide.actions  || NV,
    // Outcomes (#125-126)
    /* 125 */ d.projectOutcomes || NV,
    /* 126 */ d.otherOutcomes   || d.lessonsLearned || NV,
    // Financial summary table (#127-132)
    /* 127 */ finBase,
    /* 128 */ d.tcvTotal   ? "$" + d.tcvTotal   : NV,
    /* 129 */ d.tcvManaged ? "$" + d.tcvManaged  : NV,
    /* 130 */ d.startDate  || NV,
    /* 131 */ d.endDate    || NV,
    /* 132 */ finBase,
    // Financial data rows — 4 cols each: Orig Plan | Approved Plan | When Joined | Final Actual
    /* 133 */ revPlanned,   /* 134 */ revPlanned,   /* 135 */ revActual,    /* 136 */ revActual,
    /* 137 */ costPlanned,  /* 138 */ costPlanned,  /* 139 */ costActual,   /* 140 */ costActual,
    /* 141 */ gpPlanned,    /* 142 */ gpPlanned,    /* 143 */ gpActual,     /* 144 */ gpActual,
    /* 145 */ gpPctPlan,    /* 146 */ gpPctPlan,    /* 147 */ gpPctAct,     /* 148 */ gpPctAct,
    // Variance, commercial, risk, penalties, notes (#149-154)
    /* 149 */ varR,
    /* 150 */ varM,
    /* 151 */ comm,
    /* 152 */ rr,
    /* 153 */ "No penalty clauses applicable to this engagement.",
    /* 154 */ "IPPF Top Sheet and project evidence available on request from IBM PM.",
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
function sanitise(str) {
  if (!str) return "";
  return String(str)
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-").replace(/\u2248/g, "~")
    .replace(/\u00a0/g, " ").replace(/[\u2022\u2023]/g, "-")
    .replace(/[^\x00-\x7F]/g, c => {
      const k = "àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜÝÞŸ";
      return k.includes(c) ? c : "";
    })
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function updateCoreProps(zip, data) {
  const entry = zip.getEntry("docProps/core.xml");
  if (!entry) return;
  let core = entry.getData().toString("utf8");
  const now   = new Date().toISOString();
  const title = sanitise(`CPM Profile - ${data.candidateName||"Candidate"} - ${data.programTitle||"Program"}`);
  core = core
    .replace(/<dc:title>[\s\S]*?<\/dc:title>/,     `<dc:title>${title}</dc:title>`)
    .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/,  `<dc:creator>${sanitise(data.candidateName||"")}</dc:creator>`)
    .replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/, `<cp:lastModifiedBy>CPM Assistant</cp:lastModifiedBy>`)
    .replace(/<dcterms:modified[^>]*>[\s\S]*?<\/dcterms:modified>/, `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>`);
  zip.updateFile("docProps/core.xml", Buffer.from(core, "utf8"));
}

module.exports = { fillTemplate, buildReplacements };