import { describe, expect, it } from "vitest";
import { documentDateValid, documentUploadError, documentUploadFileError, formatDocumentAmount, parseDocumentAmount } from "./document-upload-model";

describe("document upload money and validation", () => {
  it.each([["",undefined],[" ",undefined],["0","0"],["1,25","125"],["1.25","125"],["1250","125000"],["1 250,50","125050"],["1\u00a0250,5","125050"],["1\u202f250.01","125001"],["90071992547409,93","9007199254740993"],["999999999999999999.99","99999999999999999999"]])("converts %s exactly", (input, minor) => expect(parseDocumentAmount(input!)).toEqual(minor === undefined ? {} : {minor}));
  it.each(["1,250","1.234,56","1,234.56","12 34","1e3","-1","+1","NaN","Infinity","01","1.","1000000000000000000","1/2"])("rejects ambiguous or oversized amount %s", input => expect(parseDocumentAmount(input).error).toBeTruthy());
  it("validates extension, empty files and exact byte limit", () => {
    expect(documentUploadFileError(null)).toBeTruthy();
    expect(documentUploadFileError({name:"test.exe",size:2})).toContain("PDF");
    expect(documentUploadFileError({name:"test.pdf",size:0})).toContain("пуст");
    expect(documentUploadFileError({name:"test.PDF",size:10_000_000})).toBeNull();
    expect(documentUploadFileError({name:"test.docx",size:10_000_001})).toContain("10 МБ");
  });
  it("validates calendar dates without normalization", () => {
    expect(documentDateValid("2024-02-29")).toBe(true);
    for (const value of ["", "2025-02-29", "2026-02-30", "2026-13-01"]) expect(documentDateValid(value)).toBe(false);
  });
  it("formats archive values in major units, even above Number safe integer", () => {
    expect(formatDocumentAmount("0", "KZT")).toBe("0,00 ₸");
    expect(formatDocumentAmount("125", "KZT")).toBe("1,25 ₸");
    expect(formatDocumentAmount("9007199254740993", "KZT")).toBe("90\u00a0071\u00a0992\u00a0547\u00a0409,93 ₸");
    expect(formatDocumentAmount(null, "KZT")).toBe("—");
  });
  it("uses safe recovery copy instead of raw server errors", () => {
    expect(documentUploadError({status:403,message:"SELECT secret"})).toContain("прав");
    expect(documentUploadError({status:409})).toContain("конфликт");
    expect(documentUploadError(new Error("private token"))).not.toContain("private");
    expect(documentUploadError(new Error("network"))).toContain("мог сохраниться");
  });
});
