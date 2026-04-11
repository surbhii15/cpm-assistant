const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, HeadingLevel,
  LevelFormat, Header, Footer, PageNumber, NumberFormat,
} = require("docx");

/**
 * generateDocument - Creates a filled CPM profile DOCX from agent data.
 * @param {Object} fieldData - Structured data from the AI agent
 * @param {string} templatePath - Path to the original template (for reference)
 * @param {string} outputPath - Where to save the generated DOCX
 */
async function generateDocument(fieldData, templatePath, outputPath) {
  const d = fieldData;

  const border = { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  const accentBorder = { style: BorderStyle.SINGLE, size: 3, color: "1F4E79" };
  const accentBorders = { top: accentBorder, bottom: accentBorder, left: accentBorder, right: accentBorder };

  const cellMargins = { top: 100, bottom: 100, left: 150, right: 150 };

  // ── Helper functions ────────────────────────────────────────────────────────
  const heading1 = (text) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text, bold: true, size: 28, color: "1F4E79", font: "Calibri" })],
      spacing: { before: 360, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1F4E79" } },
    });

  const heading2 = (text) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text, bold: true, size: 24, color: "2E74B5", font: "Calibri" })],
      spacing: { before: 240, after: 80 },
    });

  const bodyPara = (text, opts = {}) =>
    new Paragraph({
      children: [new TextRun({ text: text || "—", size: 20, font: "Calibri", ...opts })],
      spacing: { before: 60, after: 60 },
    });

  const labelValue = (label, value) =>
    new Paragraph({
      children: [
        new TextRun({ text: `${label}: `, bold: true, size: 20, font: "Calibri" }),
        new TextRun({ text: value || "—", size: 20, font: "Calibri" }),
      ],
      spacing: { before: 60, after: 60 },
    });

  const twoColRow = (col1Label, col1Val, col2Label, col2Val) =>
    new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: 4680, type: WidthType.DXA },
          margins: cellMargins,
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `${col1Label}: `, bold: true, size: 20, font: "Calibri" }),
                new TextRun({ text: col1Val || "—", size: 20, font: "Calibri" }),
              ],
            }),
          ],
        }),
        new TableCell({
          borders,
          width: { size: 4680, type: WidthType.DXA },
          margins: cellMargins,
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `${col2Label}: `, bold: true, size: 20, font: "Calibri" }),
                new TextRun({ text: col2Val || "—", size: 20, font: "Calibri" }),
              ],
            }),
          ],
        }),
      ],
    });

  const headerRow = (cols) =>
    new TableRow({
      tableHeader: true,
      children: cols.map((col) =>
        new TableCell({
          borders: accentBorders,
          shading: { fill: "1F4E79", type: ShadingType.CLEAR },
          margins: cellMargins,
          width: { size: Math.floor(9360 / cols.length), type: WidthType.DXA },
          children: [
            new Paragraph({
              children: [new TextRun({ text: col, bold: true, size: 20, color: "FFFFFF", font: "Calibri" })],
            }),
          ],
        })
      ),
    });

  // ── Cover / Title Block ─────────────────────────────────────────────────────
  const titleSection = [
    new Paragraph({
      children: [new TextRun({ text: "IBM CPM Program Profile", bold: true, size: 48, color: "1F4E79", font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Complex Program Manager Application — 2025", size: 24, color: "595959", font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 480 },
    }),
  ];

  // ── Section 1: Candidate Details ────────────────────────────────────────────
  const candidateTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [4680, 4680],
    rows: [
      twoColRow("Name", d.candidateName, "Email", d.email),
      twoColRow("Market", d.market, "Service Line", d.serviceLine),
      twoColRow("Practice", d.practice, "Primary Role", d.primaryRole),
    ],
  });

  // ── Section 2: Profile Summary ──────────────────────────────────────────────
  const summaryTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [4680, 4680],
    rows: [
      twoColRow("Client Name", d.clientName, "Program / Project Title", d.programTitle),
      twoColRow("Owning Service Line", d.owningServiceLine, "IPPF Contract IDs", d.ippfContractIds),
      twoColRow("Complex (Y/N)", d.isComplex, "Your Primary Role", d.primaryRole),
      twoColRow("TCV ($M)", d.tcvTotal, "Value of Profile Managed ($M)", d.tcvManaged),
      twoColRow("Start Date", d.startDate, "End Date", d.endDate),
      twoColRow("FTEs Total", d.fteTotal, "FTEs Onshore / Offshore / Contract", `${d.fteOnshore || "—"} / ${d.fteOffshore || "—"} / ${d.fteContract || "—"}`),
      twoColRow("Manager Name", d.managerName, "Manager Email", d.managerEmail),
    ],
  });

  // ── Section 3: Phases ───────────────────────────────────────────────────────
  const phaseContent = [];
  const phases = Array.isArray(d.phases) ? d.phases : [];
  phases.forEach((phase, i) => {
    phaseContent.push(
      heading2(`Phase ${i + 1}: ${phase.name || "Unnamed Phase"}`),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4680, 4680],
        rows: [
          twoColRow("Duration", phase.duration, "From / To", `${phase.fromDate || "—"} → ${phase.toDate || "—"}`),
          new TableRow({
            children: [
              new TableCell({
                borders,
                width: { size: 9360, type: WidthType.DXA },
                margins: cellMargins,
                columnSpan: 2,
                children: [
                  new Paragraph({ children: [new TextRun({ text: "Phase Description", bold: true, size: 20, font: "Calibri" })] }),
                  new Paragraph({ children: [new TextRun({ text: phase.description || "—", size: 20, font: "Calibri" })] }),
                ],
              }),
            ],
          }),
        ],
      }),
      new Paragraph({ spacing: { before: 80, after: 80 } }),
      ...buildDetailTable("Scope & Delivery Details", [
        ["E2E Responsibility", phase.hasE2EResponsibility],
        ["Exact Responsibilities", phase.exactResponsibilities],
        ["Scope Description", phase.scopeDescription],
        ["Delivery Model", phase.deliveryModel],
        ["Solution", phase.solution],
        ["Technology", phase.technology],
        ["Commercial / Contract", phase.commercialContractDetails],
        ["GenAI Experience", phase.genAIExperience],
      ], borders, cellMargins)
    );
  });

  // ── Section 4: Financial ─────────────────────────────────────────────────────
  const financialRows = [
    ["Financial Measurement Baseline", d.financialBaseline],
    ["Budget Breakdown", d.budgetBreakdown],
    ["Financial Management System", d.financialManagementSystem],
  ];

  // ── Section 5: Leadership Behaviors ─────────────────────────────────────────
  const lb = d.leadershipBehaviors || {};
  const behaviorRows = Object.entries({
    "Customer Relationships": lb.customerRelationships,
    "Embracing Change": lb.embracingChange,
    "Negotiation": lb.negotiation,
    "Communication Skills": lb.communicationSkills,
    "Problem Solving": lb.problemSolving,
    "Collaboration": lb.collaboration,
    "Mentoring": lb.mentoring,
    "Delegation": lb.delegation,
    "Leadership": lb.leadership,
  });

  const behaviorTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2800, 6560],
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            borders: accentBorders,
            shading: { fill: "1F4E79", type: ShadingType.CLEAR },
            margins: cellMargins,
            width: { size: 2800, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: "Behaviour", bold: true, size: 20, color: "FFFFFF", font: "Calibri" })] })],
          }),
          new TableCell({
            borders: accentBorders,
            shading: { fill: "1F4E79", type: ShadingType.CLEAR },
            margins: cellMargins,
            width: { size: 6560, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: "Brief Description", bold: true, size: 20, color: "FFFFFF", font: "Calibri" })] })],
          }),
        ],
      }),
      ...behaviorRows.map(([behavior, description]) =>
        new TableRow({
          children: [
            new TableCell({
              borders,
              width: { size: 2800, type: WidthType.DXA },
              margins: cellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: behavior, bold: true, size: 20, font: "Calibri" })] })],
            }),
            new TableCell({
              borders,
              width: { size: 6560, type: WidthType.DXA },
              margins: cellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: description || "—", size: 20, font: "Calibri" })] })],
            }),
          ],
        })
      ),
    ],
  });

  // ── Section 6: Complexity ────────────────────────────────────────────────────
  const complexityFactors = Array.isArray(d.complexityFactors) ? d.complexityFactors : [];
  const complexityTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2400, 3480, 3480],
    rows: [
      headerRow(["Complexity Factor", "Elaboration / Issues Faced", "Actions Taken"]),
      ...complexityFactors.map((cf) =>
        new TableRow({
          children: [
            new TableCell({
              borders,
              width: { size: 2400, type: WidthType.DXA },
              margins: cellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: cf.factor || "—", bold: true, size: 20, font: "Calibri" })] })],
            }),
            new TableCell({
              borders,
              width: { size: 3480, type: WidthType.DXA },
              margins: cellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: cf.elaboration || "—", size: 20, font: "Calibri" })] })],
            }),
            new TableCell({
              borders,
              width: { size: 3480, type: WidthType.DXA },
              margins: cellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: cf.actions || "—", size: 20, font: "Calibri" })] })],
            }),
          ],
        })
      ),
    ],
  });

  // ── Assemble Document ────────────────────────────────────────────────────────
  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Calibri", size: 20 } } },
      paragraphStyles: [
        {
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal",
          run: { size: 28, bold: true, font: "Calibri", color: "1F4E79" },
          paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 },
        },
        {
          id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal",
          run: { size: 24, bold: true, font: "Calibri", color: "2E74B5" },
          paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{
            level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "IBM CONFIDENTIAL  |  CPM Program Profile  |  ", size: 16, color: "888888", font: "Calibri" }),
                  new TextRun({ text: d.candidateName || "Candidate", size: 16, color: "888888", font: "Calibri" }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Page ", size: 16, color: "888888", font: "Calibri" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "888888", font: "Calibri" }),
                  new TextRun({ text: " of ", size: 16, color: "888888", font: "Calibri" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "888888", font: "Calibri" }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [
          // Cover
          ...titleSection,

          // 1. Candidate Details
          heading1("1. Candidate Details"),
          candidateTable,
          new Paragraph({ spacing: { before: 240, after: 0 } }),

          // 2. Profile Summary
          heading1("2. Profile Summary"),
          summaryTable,
          new Paragraph({ spacing: { before: 240, after: 0 } }),

          // 3. Overall vs Managed Scope
          heading1("3. Scope Overview"),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [4680, 4680],
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders: accentBorders,
                    shading: { fill: "1F4E79", type: ShadingType.CLEAR },
                    margins: cellMargins,
                    width: { size: 4680, type: WidthType.DXA },
                    children: [new Paragraph({ children: [new TextRun({ text: "OVERALL PROGRAM OF WORK", bold: true, size: 20, color: "FFFFFF", font: "Calibri" })] })],
                  }),
                  new TableCell({
                    borders: accentBorders,
                    shading: { fill: "1F4E79", type: ShadingType.CLEAR },
                    margins: cellMargins,
                    width: { size: 4680, type: WidthType.DXA },
                    children: [new Paragraph({ children: [new TextRun({ text: "SCOPE MANAGED BY CANDIDATE", bold: true, size: 20, color: "FFFFFF", font: "Calibri" })] })],
                  }),
                ],
              }),
              twoColRow("Program/Project Title", d.overallProgramTitle, "Project Name (Profile)", d.profileProjectName),
              twoColRow("IPPF Contract IDs", d.ippfContractIds, "Contract No. / Work Items", d.ippfContractIds),
              twoColRow("Start Date", d.startDate, "Start Date", d.startDate),
              twoColRow("End Date", d.endDate, "End Date", d.endDate),
              twoColRow("Owning Service Line", d.owningServiceLine, "Owning Service Line", d.owningServiceLine),
              twoColRow("Complex (Y/N)", d.isComplex, "Complex (Y/N)", d.isComplex),
              twoColRow("TCV ($M)", d.tcvTotal, "Value Managed ($M)", d.tcvManaged),
              twoColRow("FTEs", d.fteTotal, "FTEs Total", d.fteTotal),
            ],
          }),
          new Paragraph({ spacing: { before: 240, after: 0 } }),

          // 4. Personal Involvement / Phases
          heading1("4. Personal Involvement — Phases"),
          ...phaseContent,
          new Paragraph({ spacing: { before: 120, after: 0 } }),

          // 5. Scope & Responsibilities
          heading1("5. Scope & Responsibilities"),
          bodyPara(d.scopeAndResponsibilities),
          new Paragraph({ spacing: { before: 120, after: 0 } }),

          // 6. Financial Management
          heading1("6. Financial Management"),
          ...[
            ["Financial Measurement Baseline", d.financialBaseline],
            ["Budget Breakdown", d.budgetBreakdown],
            ["Financial Management System", d.financialManagementSystem],
          ].flatMap(([label, val]) => [
            new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, font: "Calibri", color: "1F4E79" })], spacing: { before: 120, after: 40 } }),
            bodyPara(val),
          ]),
          new Paragraph({ spacing: { before: 120, after: 0 } }),

          // 7. Leadership Behaviors
          heading1("7. Leadership Behaviours"),
          behaviorTable,
          new Paragraph({ spacing: { before: 240, after: 0 } }),

          // 8. Complexity
          heading1("8. Complexity Categories"),
          complexityTable,
          new Paragraph({ spacing: { before: 240, after: 0 } }),

          // 9. Project Outcomes
          heading1("9. Project Outcomes"),
          bodyPara(d.projectOutcomes),
          new Paragraph({ children: [new TextRun({ text: "Major Contractual Deliverables", bold: true, size: 20, font: "Calibri" })], spacing: { before: 160, after: 40 } }),
          bodyPara(d.contractualDeliverables),
          new Paragraph({ children: [new TextRun({ text: "Other Outcomes (NPS, Business Value, Awards)", bold: true, size: 20, font: "Calibri" })], spacing: { before: 160, after: 40 } }),
          bodyPara(d.otherOutcomes),
          new Paragraph({ children: [new TextRun({ text: "Lessons Learned", bold: true, size: 20, font: "Calibri" })], spacing: { before: 160, after: 40 } }),
          bodyPara(d.lessonsLearned),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

// ── Build a simple two-column detail table ───────────────────────────────────
function buildDetailTable(title, rows, borders, cellMargins) {
  return [
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [2800, 6560],
      rows: rows.map(([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              borders,
              width: { size: 2800, type: WidthType.DXA },
              margins: cellMargins,
              shading: { fill: "EBF3FB", type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, font: "Calibri" })] })],
            }),
            new TableCell({
              borders,
              width: { size: 6560, type: WidthType.DXA },
              margins: cellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: value || "—", size: 20, font: "Calibri" })] })],
            }),
          ],
        })
      ),
    }),
    new Paragraph({ spacing: { before: 80, after: 80 } }),
  ];
}

module.exports = { generateDocument };
