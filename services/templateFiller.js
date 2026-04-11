/**
 * templateFiller.js — v5
 *
 * Updated for the new template with 149 <complete> tokens.
 *
 * TOKEN MAP (confirmed from XML analysis):
 *  #1        Intro marker
 *  #2        Candidate Name
 *  #3        Market
 *  #4        Service Line
 *  #5        Practice
 *  #6        Client Name (top summary)
 *  #7        Program/Project Title (WBS short description)
 *  #8        Owning Service Line
 *  #9        IPPF WBS ID
 *  #10       Complex Y/N
 *  #11       Primary Role
 *  #12       TCV Total
 *  #13       Start Date
 *  #14       End Date (paired)
 *  #15       FTEs Total
 *  #16       FTEs onshore
 *  #17       FTEs offshore
 *  #18       # Contracts
 *  #19       Client Name (profile table)
 *  #20       Manager Name + Email
 *  #21       Overall Program Title
 *  #22       Profile Project Name
 *  #23       IPPF Contract IDs (overall)
 *  #24       IPPF Contract IDs (scope)
 *  #25       TCV Total (profile table)
 *  #26       Start Date (profile table)
 *  #27       TCV Managed
 *  #28       End Date (profile table)
 *  #29       Owning Service Line (profile table)
 *  #30       Complex Y/N (profile table IPPF)
 *  #31       Complex Y/N (profile table by)
 *  #32       Primary Role (profile table col 1)
 *  #33       Primary Role (profile table col 2)
 *  #34       TCV Total (profile table row)
 *  #35       TCV Managed (profile table row)
 *  #36       Duration months
 *  #37       FTEs Total (profile table)
 *  #38       FTEs split by location
 *  #39–48    Org diagram shape labels (manager/team names in org chart)
 *  #49       Phase 1 name
 *  #50       Phase 1 duration
 *  #51       Phase 1 from date
 *  #52       Phase 1 to date
 *  #53       Phase 1 description
 *  #54–61    Phase 1 detail rows (scope, delivery model, solution, tech, commercial, genAI, AO, SAP)
 *  #62       Phase 2 name
 *  #63       Phase 2 duration
 *  #64       Phase 2 from date
 *  #65       Phase 2 to date
 *  #66       Phase 2 description
 *  #67       Phase 3 name
 *  #68       Phase 3 duration
 *  #69       Phase 3 from date
 *  #70       Phase 3 to date
 *  #71       Phase 3 description
 *  #72       E2E responsibility Y/N
 *  #73       If N — exact responsibilities
 *  #74       Scope & Responsibilities narrative
 *  #75–82    Service line specific (AO, HCD, SAP) — N/A for most
 *  #83–91    SAP-specific rows
 *  #92–98    Additional scope/org detail rows
 *  #99       Leadership: Customer Relationships
 *  #100      Leadership: Embracing Change
 *  #101      Leadership: Negotiation
 *  #102      Leadership: Communication Skills
 *  #103      Leadership: Problem Solving
 *  #104      Leadership: Collaboration
 *  #105      Leadership: Mentoring
 *  #106      Leadership: Delegation
 *  #107      Leadership: Leadership
 *  #108–109  Complexity FOAK: elaboration, actions
 *  #110–111  Complexity CSI: elaboration, actions
 *  #112–113  Complexity Cross-Brand: elaboration, actions
 *  #114–115  Complexity Project Delivery: elaboration, actions
 *  #116–117  Complexity Client Environment: elaboration, actions
 *  #118–119  Complexity Client Transformation: elaboration, actions
 *  #120–121  Complexity Contract Terms: elaboration, actions
 *  #122–123  Complexity Inclusion: elaboration, actions
 *  #124      Project Outcomes
 *  #125      Other Outcomes / NPS
 *  #126      VaC% / Financial Baseline intro
 *  #127–130  Financial table header cells
 *  #131      Planned/Actual label
 *  #132–133  Revenue label + value
 *  #134      Revenue actual
 *  #135–136  Cost label + value
 *  #137      Cost actual
 *  #138–139  GP label + value
 *  #140      GP actual
 *  #141–142  GP% label + value
 *  #143      GP% actual
 *  #144      Variance reason
 *  #145      Variance management
 *  #146      Commercial Construct
 *  #147      Risk/Reward
 *  #148      Penalties / contract notes
 *  #149      IPPF screenshot notes
 */

const fs     = require("fs");
const AdmZip = require("adm-zip");

async function fillTemplate(data, templatePath, outputPath) {
  const zip      = new AdmZip(templatePath);
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

  // Pass 2 — replace all 149 tokens in order
  const R = buildReplacements(data);
  let idx = 0;
  xml = xml.replace(/&lt;complete&gt;[ \u00a0]*/gi, () => {
    const val = R[idx] !== undefined ? R[idx] : "";
    idx++;
    return sanitise(String(val || ""));
  });
  console.log(`Pass 2: ${idx} tokens replaced`);

  // Pass 3 — strip remaining guidance/example/SAP placeholder text
  xml = xml.replace(/&lt;e\.g\.[^&]*&gt;/g, "");
  xml = xml.replace(/&lt;description up to[^&]*&gt;/g, "");
  xml = xml.replace(/&lt;Guidance&gt;[\s\S]*?&lt;\/Guidance&gt;/g, "");
  xml = xml.replace(/&lt;[^&]{0,80}?\/[^&]{0,80}?&gt;/g, "");
  xml = xml.replace(/&lt;(?:Provide evidence|Complete where applicable)[^&]*&gt;/gi, "");
  xml = xml.replace(/&lt;(?:If this is a Program)[^&]*&gt;/gi, "");
  xml = xml.replace(/&lt;Successfully led[^&]*&gt;/gi, "");
  xml = xml.replace(/&lt;Experience[^&]*&gt;/gi, "");
  xml = xml.replace(/&lt;Knowledge[^&]*&gt;/gi, "");
  xml = xml.replace(/&lt;Describe what specific[^&]*&gt;/gi, "");
  xml = xml.replace(/&lt;Refer to Describing[^&]*&gt;/gi, "");
  xml = xml.replace(/&lt;What made it complex\?[^&]*&gt;/gi, "");

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

  // Helper — find CF by keyword
  const findCF = (...keys) => cf.find(c => {
    const n = (c.factor || "").toLowerCase();
    return keys.some(k => n.includes(k));
  }) || {};

  const foak = findCF("first","foak");
  const csi  = findCF("integrat","csi","system");
  const cbdm = findCF("cross","multi","brand");
  const pd   = findCF("project del","delivery");
  const ce   = findCF("client env","environ","psu","regulat");
  const ct   = findCF("transform","change");
  const cts  = findCF("contract","term","commercial","cts");
  const ide  = findCF("inclusion","excellence","ide");

  const na      = "Not applicable to this profile.";
  const revenue = d.revenueActual   || d.tcvManaged || "—";
  const cost    = d.costActual      || "—";
  const gp      = d.gpActual        || "—";
  const gpPct   = d.gpPercent       || "—";
  const varR    = d.varianceReason  || "Delivered within approved price case parameters.";
  const varM    = d.varianceManagement || "Active financial monitoring through IBM IPPF with regular EAC reviews.";
  const comm    = d.commercialConstruct|| "Services-based contract with milestone-linked deliverables.";
  const rr      = d.riskReward      || "Standard IBM contract — no risk/reward arrangement.";
  const finBase = d.financialBaseline|| `TCV: ${d.tcvTotal||"—"} | Managed: ${d.tcvManaged||"—"}`;

  const ph1 = (Array.isArray(d.phases) && d.phases[0]) ? d.phases[0] : {};
  const ph2 = (Array.isArray(d.phases) && d.phases[1]) ? d.phases[1] : {};
  const ph3 = (Array.isArray(d.phases) && d.phases[2]) ? d.phases[2] : {};

  const fteOnshore  = d.fteOnshore  || "—";
  const fteOffshore = d.fteOffshore || "—";
  const fteContract = d.fteContract || "—";
  const fteSplit    = `Onshore: ${fteOnshore}  Offshore: ${fteOffshore}  Contract: ${fteContract}`;

  const orgBox = (name) => name || "—";

  return [
    /* 001 */ "Completed — CPM Application Assistant",
    /* 002 */ d.candidateName        || "—",   // Name
    /* 003 */ d.market               || "—",   // Market
    /* 004 */ d.serviceLine          || "—",   // Service Line
    /* 005 */ d.practice             || "—",   // Practice
    /* 006 */ d.clientName           || "—",   // Client Name (top)
    /* 007 */ d.programTitle         || "—",   // Program Title / WBS
    /* 008 */ d.owningServiceLine    || d.serviceLine || "—",  // Owning SL
    /* 009 */ d.ippfContractIds      || "—",   // IPPF WBS ID
    /* 010 */ d.isComplex            || "Yes", // Complex Y/N
    /* 011 */ d.primaryRole          || "—",   // Primary Role
    /* 012 */ d.tcvTotal ? `$${d.tcvTotal}` : "—",  // TCV Total
    /* 013 */ d.startDate            || "—",   // Start Date
    /* 014 */ d.endDate              || "—",   // End Date (paired)
    /* 015 */ d.fteTotal             || "—",   // FTEs Total
    /* 016 */ fteOnshore,                      // FTEs Onshore
    /* 017 */ fteOffshore,                     // FTEs Offshore
    /* 018 */ d.ippfContractIds      || "—",   // # Contracts
    /* 019 */ d.clientName           || "—",   // Client Name (profile table)
    /* 020 */ `${d.managerName||"—"}  |  ${d.managerEmail||""}`, // Manager
    /* 021 */ d.overallProgramTitle  || d.programTitle || "—",  // Overall Program
    /* 022 */ d.profileProjectName   || d.programTitle || "—",  // Profile Project
    /* 023 */ d.ippfContractIds      || "—",   // IPPF IDs overall
    /* 024 */ d.ippfContractIds      || "—",   // IPPF IDs scope
    /* 025 */ d.tcvTotal ? `$${d.tcvTotal}` : "—",  // TCV Total (table)
    /* 026 */ d.startDate            || "—",   // Start Date (table)
    /* 027 */ d.tcvManaged ? `$${d.tcvManaged}` : "—", // TCV Managed
    /* 028 */ d.endDate              || "—",   // End Date (table)
    /* 029 */ d.owningServiceLine    || d.serviceLine || "—",  // Owning SL (table)
    /* 030 */ d.isComplex            || "Yes", // Complex (IPPF col)
    /* 031 */ d.isComplex            || "Yes", // Complex (by IPPF)
    /* 032 */ d.primaryRole          || "—",   // Primary Role col 1
    /* 033 */ d.primaryRole          || "—",   // Primary Role col 2
    /* 034 */ d.tcvTotal ? `$${d.tcvTotal}` : "—",  // TCV Total row
    /* 035 */ d.tcvManaged ? `$${d.tcvManaged}` : "—", // TCV Managed row
    /* 036 */ d.duration || `${d.startDate||"—"} – ${d.endDate||"—"}`, // Duration
    /* 037 */ d.fteTotal             || "—",   // FTEs Total (table)
    /* 038 */ fteSplit,                        // FTEs split
    // Org diagram shape labels (#39–48) — name key roles
    /* 039 */ d.candidateName        || "IBM PM",
    /* 040 */ d.clientName           || "Client",
    /* 041 */ d.managerName          || "Delivery Manager",
    /* 042 */ "Onshore Team",
    /* 043 */ "Offshore Team",
    /* 044 */ "Workstream Lead 1",
    /* 045 */ "Workstream Lead 2",
    /* 046 */ "Integration Partner",
    /* 047 */ "Test/QA Lead",
    /* 048 */ "Business Analyst",
    // Phase 1
    /* 049 */ ph1.name     || d.programTitle || "Full Delivery",
    /* 050 */ ph1.duration || `${d.startDate||"—"} – ${d.endDate||"—"}`,
    /* 051 */ ph1.fromDate || d.startDate    || "—",
    /* 052 */ ph1.toDate   || d.endDate      || "—",
    /* 053 */ ph1.description || d.scopeAndResponsibilities || "—",
    // Phase 1 detail rows
    /* 054 */ ph1.e2eResponsibility || "Yes",
    /* 055 */ ph1.exactResponsibilities || d.scopeAndResponsibilities || "—",
    /* 056 */ ph1.deliveryModel || "Hybrid onshore-offshore agile delivery.",
    /* 057 */ ph1.solution     || na,
    /* 058 */ ph1.technology   || na,
    /* 059 */ ph1.commercial   || d.commercialConstruct || "Services contract with milestone deliverables.",
    /* 060 */ ph1.genAI        || na,
    /* 061 */ ph1.aoDetails    || na,
    // Phase 2
    /* 062 */ ph2.name     || "—",
    /* 063 */ ph2.duration || "—",
    /* 064 */ ph2.fromDate || "—",
    /* 065 */ ph2.toDate   || "—",
    /* 066 */ ph2.description || "—",
    // Phase 3
    /* 067 */ ph3.name     || "—",
    /* 068 */ ph3.duration || "—",
    /* 069 */ ph3.fromDate || "—",
    /* 070 */ ph3.toDate   || "—",
    /* 071 */ ph3.description || "—",
    /* 072 */ "Yes",           // E2E responsibility
    /* 073 */ d.scopeAndResponsibilities || "—",  // If N responsibilities
    /* 074 */ d.scopeAndResponsibilities || "—",  // Scope narrative
    // Service-line specific (AO, HCD, SAP) — na for most profiles
    /* 075 */ na,  /* 076 */ na,  /* 077 */ na,  /* 078 */ na,
    /* 079 */ na,  /* 080 */ na,  /* 081 */ na,  /* 082 */ na,
    /* 083 */ na,  /* 084 */ na,  /* 085 */ na,  /* 086 */ na,
    /* 087 */ na,  /* 088 */ na,  /* 089 */ na,  /* 090 */ na,
    /* 091 */ na,
    // Additional scope/detail rows
    /* 092 */ d.scopeAndResponsibilities || "—",
    /* 093 */ d.orgStructure || `IBM PM: ${d.candidateName||"—"} | Manager: ${d.managerName||"—"}`,
    /* 094 */ d.scopeAndResponsibilities || "—",
    /* 095 */ d.commercialConstruct || comm,
    /* 096 */ na,
    /* 097 */ na,
    /* 098 */ d.lessonsLearned || "—",
    // Leadership Behaviours (#99–107)
    /* 099 */ lb.customerRelationships || lb.customer  || "—",
    /* 100 */ lb.embracingChange       || lb.change    || "—",
    /* 101 */ lb.negotiation           || "—",
    /* 102 */ lb.communicationSkills   || lb.communication || "—",
    /* 103 */ lb.problemSolving        || lb.problemsolving || "—",
    /* 104 */ lb.collaboration         || "—",
    /* 105 */ lb.mentoring             || "—",
    /* 106 */ lb.delegation            || "—",
    /* 107 */ lb.leadership            || lb.leadershipskills || "—",
    // Complexity (#108–123) — pairs of elaboration + actions
    /* 108 */ foak.elaboration || "—",  /* 109 */ foak.actions || "—",
    /* 110 */ csi.elaboration  || "—",  /* 111 */ csi.actions  || "—",
    /* 112 */ cbdm.elaboration || "—",  /* 113 */ cbdm.actions || "—",
    /* 114 */ pd.elaboration   || "—",  /* 115 */ pd.actions   || "—",
    /* 116 */ ce.elaboration   || "—",  /* 117 */ ce.actions   || "—",
    /* 118 */ ct.elaboration   || "—",  /* 119 */ ct.actions   || "—",
    /* 120 */ cts.elaboration  || "—",  /* 121 */ cts.actions  || "—",
    /* 122 */ ide.elaboration  || "—",  /* 123 */ ide.actions  || "—",
    // Outcomes (#124–125)
    /* 124 */ d.projectOutcomes || "—",
    /* 125 */ d.otherOutcomes   || d.lessonsLearned || "—",
    // Financial (#126–149)
    /* 126 */ finBase,         // VaC%/Financial baseline intro
    /* 127 */ finBase,         // FMB header
    /* 128 */ d.tcvTotal    ? `$${d.tcvTotal}`    : "—",
    /* 129 */ d.tcvManaged  ? `$${d.tcvManaged}`  : "—",
    /* 130 */ d.startDate   || "—",
    /* 131 */ "Actual",      // Planned/Actual label
    /* 132 */ finBase,       // Revenue label area
    /* 133 */ revenue,       // Revenue Planned
    /* 134 */ revenue,       // Revenue Actual
    /* 135 */ cost,          // Cost Planned
    /* 136 */ cost,          // Cost label area
    /* 137 */ cost,          // Cost Actual
    /* 138 */ gp,            // GP Planned
    /* 139 */ gp,            // GP label area
    /* 140 */ gp,            // GP Actual
    /* 141 */ gpPct,         // GP% Planned
    /* 142 */ gpPct,         // GP% label area
    /* 143 */ gpPct,         // GP% Actual
    /* 144 */ varR,          // Variance reason
    /* 145 */ varM,          // Variance management
    /* 146 */ comm,          // Commercial Construct
    /* 147 */ rr,            // Risk/Reward
    /* 148 */ "No penalty clauses applicable to this engagement.",
    /* 149 */ "IPPF Top Sheet available on request from IBM PM.",
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

module.exports = { fillTemplate };