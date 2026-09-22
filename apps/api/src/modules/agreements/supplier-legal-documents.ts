import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { SupplierLegalBundle, SupplierLegalDocument } from "@marketplace/schemas";

type LegalSource = Omit<SupplierLegalDocument, "hash">;
// Owner requested empty legal pages. Publishing requires approved text and a new version.
// Never put example clauses here: test content belongs only in test fixtures.
export const supplierLegalDocuments: LegalSource[] = [
  { code: "seller-agreement", title: "Договор с продавцом", purpose: "COMMERCIAL", version: "draft-2026-09-22", status: "DRAFT", content: "" },
  { code: "tariffs", title: "Тарифы", purpose: "COMMERCIAL", version: "draft-2026-09-22", status: "DRAFT", content: "" },
  { code: "rules", title: "Правила работы площадки", purpose: "COMMERCIAL", version: "draft-2026-09-22", status: "DRAFT", content: "" },
  { code: "personal-data", title: "Документы о персональных данных", purpose: "PERSONAL_DATA", version: "draft-2026-09-22", status: "DRAFT", content: "" },
];
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function buildSupplierLegalBundle(source: LegalSource[]): SupplierLegalBundle {
  const documents = source.map(({ code, title, purpose, version, status, content }) => {
    const document = { code, title, purpose, version, status, content };
    return { ...document, hash: hash(document) };
  });
  return { documents, hash: hash(documents), available: documents.length === 4 && documents.every((document) => document.status === "PUBLISHED" && document.content.trim().length > 0) };
}
@Injectable()
export class SupplierLegalDocuments {
  current() { return buildSupplierLegalBundle(supplierLegalDocuments); }
}
