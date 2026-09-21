import { describe, expect, it } from "vitest";
import { DocumentRendererService } from "./document-renderer.service";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function readPdf(bytes: Buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
  const pdf = await task.promise;
  try {
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter((item) => "str" in item);
      pages.push({ text: items.map((item) => item.str).join("\n"), items, styles: content.styles, width: viewport.width, height: viewport.height });
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

describe("document renderer", () => {
  const renderer = new DocumentRendererService();

  it("renders Cyrillic transaction data to a real PDF", async () => {
    const result = await renderer.render("PDF", "Счёт", "Покупатель: {{buyer.name}}", { buyer: { name: "Стоматология Алматы" } });
    expect(result.subarray(0, 4).toString()).toBe("%PDF");
    expect(result.byteLength).toBeGreaterThan(1_000);
  });

  it("renders a DOCX zip package", async () => {
    const result = await renderer.render("DOCX", "Спецификация", "Заказ: {{order.number}}", { order: { number: "SO-100" } });
    expect(result.subarray(0, 2).toString()).toBe("PK");
    expect(result.byteLength).toBeGreaterThan(1_000);
  });

  it("preserves Russian, Kazakh, Latin, invoice identifiers and exact money in the embedded PDF", async () => {
    const lines = [
      "ТЕСТОВЫЙ СЧЁТ - не подтверждение оплаты",
      "Заказ: SO-0A25B5E63692-01",
      "БИН: 990000009915",
      "Дата: 15.09.2026",
      "Сумма: 1 738,17 ₸ / KZT",
      "Точная сумма: 9007199254740993,01 ₸",
      "Әә Ғғ Ққ Ңң Өө Ұұ Үү Һһ Іі Ёё Йй №",
      "Dental Clinic / Crème Brûlée / «Алматы»",
    ];
    const bytes = await renderer.render("PDF", "Счёт № SO-100 / Шот", lines.join("\n"), {});
    const pages = await readPdf(bytes);
    expect(pages).toHaveLength(1);
    expect(pages[0].text).toContain("Счёт № SO-100 / Шот");
    for (const line of lines) expect(pages[0].text).toContain(line);
  });

  it("wraps a long title and multiple pages without losing text or crossing A4 margins", async () => {
    const title = "Счёт на стоматологические материалы / Шот / Dental invoice ".repeat(3).trim();
    const lines = Array.from({ length: 65 }, (_, index) => `Строка ${String(index + 1).padStart(3, "0")}: Құрал / Dental A2 - 1 738,17 ₸`);
    const bytes = await renderer.render("PDF", title, lines.join("\n"), {});
    const pages = await readPdf(bytes);
    expect(pages.length).toBeGreaterThan(1);
    const allText = pages.map((page) => page.text).join("\n");
    expect(allText.replace(/\s+/g, " ")).toContain(title);
    for (const line of lines) expect(allText).toContain(line);
    for (const page of pages) {
      expect(page.width).toBeCloseTo(595.28, 1);
      expect(page.height).toBeCloseTo(841.89, 1);
      for (const item of page.items.filter((item) => item.str.trim())) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(55.5);
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(page.width - 55.5);
        expect(item.transform[5]).toBeGreaterThanOrEqual(55.5);
        expect(item.transform[5] + item.height * page.styles[item.fontName].ascent).toBeLessThanOrEqual(page.height - 55.5);
      }
    }
  });

  it("keeps empty and multiline templates valid", async () => {
    const empty = await readPdf(await renderer.render("PDF", "Счёт", "", {}));
    expect(empty).toHaveLength(1);
    expect(empty[0].text).toBe("Счёт");
    const multiline = await readPdf(await renderer.render("PDF", "Счёт", "A: {{value}}\r\n\r\nБ: {{missing}}\nВ: 0", { value: "100 ₸" }));
    expect(multiline[0].text).toContain("A: 100 ₸");
    expect(multiline[0].text).toContain("Б:");
    expect(multiline[0].text).toContain("В: 0");
  });

  it("ties the character coverage to the exact shipped font and license", () => {
    const metadata = JSON.parse(readFileSync(join(__dirname, "fonts", "coverage.json"), "utf8"));
    for (const [file, hash] of [["NotoSans.ttf", metadata.sha256], ["OFL.txt", metadata.licenseSha256]]) {
      const bytes = readFileSync(join(__dirname, "fonts", file));
      const content = file === "OFL.txt" ? bytes.toString("utf8").replace(/\r\n/g, "\n") : bytes;
      expect(createHash("sha256").update(content).digest("hex")).toBe(hash);
    }
  });

  it.each(["title", "body"])("rejects unsupported %s characters instead of losing document content", async (location) => {
    await expect(renderer.render("PDF", location === "title" ? "Счёт 🦷" : "Счёт", location === "body" ? "Материал 🦷" : "Материал", {}))
      .rejects.toThrow("PDF font does not support character U+1F9B7");
  });
});
