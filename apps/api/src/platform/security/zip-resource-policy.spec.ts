import { describe, expect, it } from "vitest";
import {
  assertSafeZipPackage,
  XLSX_ZIP_RESOURCE_LIMITS,
} from "./zip-resource-policy";

type Entry = {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
};

function centralDirectoryPackage(entries: Entry[]) {
  const centralDirectory = Buffer.concat(
    entries.map(({ name, compressedSize, uncompressedSize }) => {
      const nameBytes = Buffer.from(name);
      const header = Buffer.alloc(46 + nameBytes.length);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt32LE(compressedSize, 20);
      header.writeUInt32LE(uncompressedSize, 24);
      header.writeUInt16LE(nameBytes.length, 28);
      nameBytes.copy(header, 46);
      return header;
    }),
  );
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(0, 16);
  return Buffer.concat([centralDirectory, end]);
}

describe("ZIP resource policy", () => {
  it("accepts a small ordinary package", () => {
    expect(() =>
      assertSafeZipPackage(
        centralDirectoryPackage([
          { name: "xl/workbook.xml", compressedSize: 400, uncompressedSize: 2_000 },
        ]),
      ),
    ).not.toThrow();
  });

  it("rejects an entry that expands beyond the per-entry limit", () => {
    expect(() =>
      assertSafeZipPackage(
        centralDirectoryPackage([
          {
            name: "xl/sharedStrings.xml",
            compressedSize: 1_000,
            uncompressedSize: XLSX_ZIP_RESOURCE_LIMITS.maxEntryUncompressedBytes + 1,
          },
        ]),
      ),
    ).toThrow(/entry 0 expands/);
  });

  it("rejects a high compression ratio before ExcelJS sees the package", () => {
    expect(() =>
      assertSafeZipPackage(
        centralDirectoryPackage([
          {
            name: "xl/worksheets/sheet1.xml",
            compressedSize: 1_000,
            uncompressedSize: 300_000,
          },
        ]),
      ),
    ).toThrow(/compression ratio/);
  });

  it("rejects ZIP64 sizes instead of trusting an unbounded expansion", () => {
    expect(() =>
      assertSafeZipPackage(
        centralDirectoryPackage([
          { name: "xl/workbook.xml", compressedSize: 0xffffffff, uncompressedSize: 0xffffffff },
        ]),
      ),
    ).toThrow(/ZIP64/);
  });
});
