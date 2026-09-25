import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Frozen labels from the demo catalog, chosen before executing search.
const sample = JSON.parse(readFileSync(resolve(__dirname, "../fixtures/catalog-search-sample.json"), "utf8")) as Array<{ query: string; expectedName: string }>;
test("CORE-04: fixed 50 search queries find their product in the first five", async ({ request }, testInfo) => {
  const results = [];
  for (const row of sample) {
    const response = await request.get(`${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api"}/catalog/search`, { params: { q: row.query, limit: "5" } });
    expect(response.ok()).toBe(true);
    const body = await response.json();
    const names = body.items.slice(0, 5).map((item: { name: string }) => item.name);
    results.push({ ...row, names, hit: names.includes(row.expectedName) });
  }
  const reportPath = testInfo.outputPath("search-quality.json");
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  await testInfo.attach("search-quality.json", { path: reportPath, contentType: "application/json" });
  expect(results).toHaveLength(50);
  expect(results.filter(row => row.hit).length, JSON.stringify(results.filter(row => !row.hit))).toBeGreaterThanOrEqual(45);
});
