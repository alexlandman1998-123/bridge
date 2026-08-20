import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const workingDir = "/Users/alexanderlandman/the-it-guy/the-it-guy/tmp/produktive-mailgun-forwarding-export";
const outputDir = "/Users/alexanderlandman/the-it-guy/the-it-guy/outputs/produktive-mailgun-forwarding-addresses-20260820";
const outputPath = `${outputDir}/produktive-mailgun-forwarding-addresses.xlsx`;
const previewDir = `${workingDir}/previews`;
const sourcePath = `${workingDir}/source-data.json`;

const data = JSON.parse(await fs.readFile(sourcePath, "utf8"));

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Summary");
const team = workbook.worksheets.add("Team Addresses");
const live = workbook.worksheets.add("Live Aliases");

const colors = {
  navy: "#0F2742",
  blue: "#315A78",
  green: "#11835A",
  greenPale: "#EAF7F0",
  red: "#B42318",
  redPale: "#FEF3F2",
  amber: "#B54708",
  amberPale: "#FFFAEB",
  slate: "#526579",
  border: "#D7E2EC",
  pale: "#F5F8FB",
  white: "#FFFFFF",
};

function title(sheet, range, value, subtitle) {
  sheet.showGridLines = false;
  sheet.getRange(range).merge();
  sheet.getRange(range).values = [[value]];
  sheet.getRange(range).format = {
    fill: colors.navy,
    font: { bold: true, color: colors.white, size: 18 },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };
  if (subtitle) {
    const subtitleRange = sheet.getRange("A2:H2");
    subtitleRange.merge();
    subtitleRange.values = [[subtitle]];
    subtitleRange.format = {
      fill: colors.navy,
      font: { color: "#D9E6F2", size: 10 },
      horizontalAlignment: "left",
      verticalAlignment: "center",
    };
  }
}

function writeTable(sheet, startCell, headers, rows, tableName) {
  const startCol = startCell.match(/[A-Z]+/)[0];
  const startRow = Number(startCell.match(/\d+/)[0]);
  const width = headers.length;
  const height = rows.length + 1;
  const endCol = columnName(columnIndex(startCol) + width - 1);
  const endRow = startRow + height - 1;
  const range = `${startCell}:${endCol}${endRow}`;
  sheet.getRange(range).values = [headers, ...rows];
  sheet.getRange(`${startCell}:${endCol}${startRow}`).format = {
    fill: colors.blue,
    font: { bold: true, color: colors.white },
    horizontalAlignment: "left",
    verticalAlignment: "center",
    wrapText: true,
  };
  sheet.getRange(range).format.borders = {
    insideHorizontal: { style: "thin", color: colors.border },
    bottom: { style: "thin", color: colors.border },
  };
  sheet.tables.add(range, true, tableName);
  sheet.freezePanes.freezeRows(startRow);
  return range;
}

function columnIndex(name) {
  return [...name].reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0);
}

function columnName(index) {
  let name = "";
  let value = index;
  while (value > 0) {
    const mod = (value - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    value = Math.floor((value - mod) / 26);
  }
  return name;
}

function isoDateText(value) {
  if (!value) return "";
  return String(value).replace("T", " ").replace(/\.\d+(\+|Z).*$/, " UTC");
}

title(
  summary,
  "A1:H1",
  "Produktive Mailgun Forwarding Addresses",
  `Workspace: ${data.organisation.name} · Generated: ${isoDateText(data.generatedAt)} · Source: ${data.sourceEnvironment.supabaseHost}`,
);

summary.getRange("A4:D9").values = [
  ["Metric", "Value", "Status", "Notes"],
  ["Produktive roster agents", data.totals.rosterAgents, "Source roster", "Imported active workspace report and agent CSV"],
  ["Live aliases in Supabase", data.totals.liveAliases, data.totals.liveAliases ? "Found" : "None", "Rows in lead_capture_aliases for the Produktive workspace"],
  ["Live aliases matching imported team", data.totals.liveMatchingTeamCount, data.totals.liveMatchingTeamCount ? "Found" : "Gap", "General / agent aliases matching the imported 20 users"],
  ["Missing live team aliases", data.totals.missingLiveAgentAliases, data.totals.missingLiveAgentAliases ? "Action needed" : "Clear", "Team rows that should be generated before using them operationally"],
  ["Lead capture domain", "leads.arch9.co.za", "Current", "The alias domain used by the database function"],
];
summary.getRange("A4:D4").format = {
  fill: colors.blue,
  font: { bold: true, color: colors.white },
};
summary.getRange("A5:D9").format = {
  fill: colors.white,
  font: { color: "#152238" },
};
summary.getRange("A4:D9").format.borders = {
  insideHorizontal: { style: "thin", color: colors.border },
  outside: { style: "thin", color: colors.border },
};
summary.getRange("B5:B8").format.numberFormat = "#,##0";
summary.getRange("A12:H14").values = [
  ["Important note", "", "", "", "", "", "", ""],
  ["The Team Addresses sheet contains expected database-format forwarding addresses for the imported Produktive agents. They are flagged as missing because the live alias table currently has no matching rows for those 20 users.", "", "", "", "", "", "", ""],
  ["The Live Aliases sheet shows the one active database alias found: it belongs to the Produktive training principal account, not the imported agent roster.", "", "", "", "", "", "", ""],
];
summary.getRange("A12:H12").merge();
summary.getRange("A13:H13").merge();
summary.getRange("A14:H14").merge();
summary.getRange("A12:H14").format = {
  fill: colors.amberPale,
  font: { color: "#452B06" },
  wrapText: true,
  verticalAlignment: "top",
};
summary.getRange("A12:H12").format.font = { bold: true, color: colors.amber };
summary.getRange("A12:H14").format.borders = { preset: "outside", style: "thin", color: "#FEDF89" };
summary.getRange("A:A").format.columnWidthPx = 250;
summary.getRange("B:B").format.columnWidthPx = 140;
summary.getRange("C:C").format.columnWidthPx = 150;
summary.getRange("D:D").format.columnWidthPx = 440;
summary.getRange("A1:H1").format.rowHeightPx = 44;
summary.getRange("A2:H2").format.rowHeightPx = 28;
summary.getRange("A13:H14").format.rowHeightPx = 42;

title(team, "A1:N1", "Team Addresses", "Expected current-system Mailgun forwarding addresses for the imported Produktive team");
const teamHeaders = [
  "Agent Name",
  "Agent Email",
  "Mobile",
  "Forwarding Address",
  "Source",
  "Routing Level",
  "Alias Status",
  "Live Check",
  "Branch",
  "Workspace Role",
  "Membership Status",
  "Alias Local Part",
  "User ID",
  "Alias ID",
];
const teamRows = data.teamRows.map((row) => [
  row.fullName,
  row.agentEmail,
  row.phoneMobile,
  row.forwardingAddress,
  row.source,
  row.routingLevel,
  row.aliasStatus,
  row.liveStatus,
  row.branch,
  row.workspaceRole,
  row.membershipStatus,
  row.aliasLocalPart,
  row.userId,
  row.aliasId,
]);
writeTable(team, "A4", teamHeaders, teamRows, "TeamAddressesTable");
team.getRange("A:N").format.font = { color: "#172033", size: 10 };
team.getRange("A4:N4").format.font = { bold: true, color: colors.white };
team.getRange("A1:N2").format.font = { color: colors.white };
team.getRange("A1:N1").format.font = { bold: true, color: colors.white, size: 18 };
team.getRange("A2:N2").format.font = { color: "#D9E6F2", size: 10 };
team.getRange("A4:N4").format.rowHeightPx = 36;
team.getRange("A:A").format.columnWidthPx = 200;
team.getRange("B:B").format.columnWidthPx = 285;
team.getRange("C:C").format.columnWidthPx = 120;
team.getRange("D:D").format.columnWidthPx = 270;
team.getRange("E:G").format.columnWidthPx = 115;
team.getRange("H:H").format.columnWidthPx = 315;
team.getRange("I:I").format.columnWidthPx = 155;
team.getRange("J:K").format.columnWidthPx = 135;
team.getRange("K:K").format.columnWidthPx = 160;
team.getRange("L:L").format.columnWidthPx = 195;
team.getRange("M:N").format.columnWidthPx = 260;
team.getRange(`H5:H${teamRows.length + 4}`).conditionalFormats.add("containsText", {
  text: "missing",
  format: { fill: colors.redPale, font: { color: colors.red, bold: true } },
});
team.getRange(`G5:G${teamRows.length + 4}`).conditionalFormats.add("containsText", {
  text: "missing",
  format: { fill: colors.redPale, font: { color: colors.red, bold: true } },
});
team.getRange(`A5:N${teamRows.length + 4}`).format.wrapText = false;

title(live, "A1:L1", "Live Aliases", "Database rows currently present in lead_capture_aliases for the Produktive workspace");
const liveHeaders = [
  "Owner Name",
  "Owner Email",
  "Workspace Role",
  "Membership Status",
  "Forwarding Address",
  "Source",
  "Routing Level",
  "Alias Status",
  "Agent User ID",
  "Branch ID",
  "Alias ID",
  "Created At",
];
const liveRows = data.liveAliasRows.map((row) => [
  row.fullName,
  row.ownerEmail,
  row.workspaceRole,
  row.membershipStatus,
  row.emailAddress,
  row.source,
  row.routingLevel,
  row.aliasStatus,
  row.agentUserId,
  row.branchId,
  row.aliasId,
  isoDateText(row.createdAt),
]);
writeTable(live, "A4", liveHeaders, liveRows, "LiveAliasesTable");
live.getRange("A:L").format.font = { color: "#172033", size: 10 };
live.getRange("A4:L4").format.font = { bold: true, color: colors.white };
live.getRange("A1:L2").format.font = { color: colors.white };
live.getRange("A1:L1").format.font = { bold: true, color: colors.white, size: 18 };
live.getRange("A2:L2").format.font = { color: "#D9E6F2", size: 10 };
live.getRange("A4:L4").format.rowHeightPx = 36;
live.getRange("A:A").format.columnWidthPx = 190;
live.getRange("B:B").format.columnWidthPx = 265;
live.getRange("C:D").format.columnWidthPx = 140;
live.getRange("E:E").format.columnWidthPx = 280;
live.getRange("F:H").format.columnWidthPx = 115;
live.getRange("I:K").format.columnWidthPx = 260;
live.getRange("L:L").format.columnWidthPx = 180;
live.getRange(`H5:H${liveRows.length + 4}`).conditionalFormats.add("containsText", {
  text: "active",
  format: { fill: colors.greenPale, font: { color: colors.green, bold: true } },
});

for (const sheet of [summary, team, live]) {
  sheet.getRange("A:Z").format.verticalAlignment = "center";
}

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

for (const sheetName of ["Summary", "Team Addresses", "Live Aliases"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(`${previewDir}/${sheetName.replaceAll(" ", "-").toLowerCase()}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(outputPath);
