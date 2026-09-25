import ExcelJS from "exceljs";

/** Controlled fixture cells only; CSV fixture values must not contain commas. */
export async function importFile(fileType: "CSV" | "EXCEL", rows: string[][]) {
  if (fileType === "CSV") return Buffer.from(rows.map(row => row.join(",")).join("\n") + "\n");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Price list");
  sheet.addRow(["Supplier price list"]);
  sheet.addRow([]);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
