import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = path.resolve("datasets/real/_staging/taxonomy_risk_sources");

const xlsxFiles = [
  "cfihos_v2/CORE-CFIHOS-V2.0-excel-FINAL.xlsx",
  "cfihos_v2/C-ST-001-Extended-Reference-Data-Library-1.xlsx",
  "cfihos_v2/C-DM-002-Data-Dictionary-V2.0-FINAL.xlsx",
  "cfihos_v2/V2.0-CFIHOS-Contract-Scenario-Templates-4.xlsx",
];

for (const relativeFile of xlsxFiles) {
  const filePath = path.join(root, relativeFile);
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(filePath));
  const inspection = await workbook.inspect({
    kind: "workbook,sheet,table",
    include: "id,name",
    maxChars: 20000,
    tableMaxRows: 2,
    tableMaxCols: 4,
    tableMaxCellChars: 80,
  });
  console.log(JSON.stringify({ file: relativeFile, inspection: inspection.ndjson }));
}

const csvFile = "safety_risk_library/Safety Risk Library dataset.csv";
const csvText = await (await import("node:fs/promises")).readFile(path.join(root, csvFile), "utf8");
const csvWorkbook = await Workbook.fromCSV(csvText, { sheetName: "Safety Risk Library" });
const csvInspection = await csvWorkbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 10000,
  tableMaxRows: 5,
  tableMaxCols: 12,
  tableMaxCellChars: 120,
});
console.log(JSON.stringify({ file: csvFile, inspection: csvInspection.ndjson }));
