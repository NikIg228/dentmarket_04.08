export const XLSX_ZIP_RESOURCE_LIMITS = {
  maxEntries: 2_000,
  maxEntryUncompressedBytes: 16 * 1024 * 1024,
  maxTotalUncompressedBytes: 64 * 1024 * 1024,
  maxCompressionRatio: 200,
  ratioCheckThresholdBytes: 256 * 1024,
} as const;

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_LENGTH = 22;
const MAX_ZIP_COMMENT_BYTES = 0xffff;

export type ZipResourceLimits = typeof XLSX_ZIP_RESOURCE_LIMITS;

function reject(message: string): never {
  throw new Error(`ZIP resource limits exceeded: ${message}`);
}

function findEndOfCentralDirectory(body: Buffer) {
  const firstOffset = Math.max(
    0,
    body.length - END_OF_CENTRAL_DIRECTORY_LENGTH - MAX_ZIP_COMMENT_BYTES,
  );
  for (
    let offset = body.length - END_OF_CENTRAL_DIRECTORY_LENGTH;
    offset >= firstOffset;
    offset -= 1
  ) {
    if (body.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      const commentLength = body.readUInt16LE(offset + 20);
      if (offset + END_OF_CENTRAL_DIRECTORY_LENGTH + commentLength <= body.length)
        return offset;
    }
  }
  reject("end of central directory is missing");
}

export function assertSafeZipPackage(
  body: Buffer,
  limits: ZipResourceLimits = XLSX_ZIP_RESOURCE_LIMITS,
) {
  if (body.length < END_OF_CENTRAL_DIRECTORY_LENGTH)
    reject("package is too small");

  const endOffset = findEndOfCentralDirectory(body);
  const diskNumber = body.readUInt16LE(endOffset + 4);
  const centralDirectoryDisk = body.readUInt16LE(endOffset + 6);
  const entriesOnDisk = body.readUInt16LE(endOffset + 8);
  const entryCount = body.readUInt16LE(endOffset + 10);
  const centralDirectorySize = body.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = body.readUInt32LE(endOffset + 16);

  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount)
    reject("multi-disk or inconsistent directory metadata");
  if (entryCount > limits.maxEntries) reject(`entry count ${entryCount}`);
  if (centralDirectorySize > body.length || centralDirectoryOffset > body.length)
    reject("central directory is outside the package");
  if (centralDirectoryOffset + centralDirectorySize > body.length)
    reject("central directory is truncated");

  let totalUncompressedBytes = 0;
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > body.length || body.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE)
      reject("central directory entry is malformed");
    const compressedSize = body.readUInt32LE(offset + 20);
    const uncompressedSize = body.readUInt32LE(offset + 24);
    const nameLength = body.readUInt16LE(offset + 28);
    const extraLength = body.readUInt16LE(offset + 30);
    const commentLength = body.readUInt16LE(offset + 32);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff)
      reject("ZIP64 entry sizes are not supported");
    if (uncompressedSize > limits.maxEntryUncompressedBytes)
      reject(`entry ${index} expands to ${uncompressedSize} bytes`);
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes)
      reject(`package expands to ${totalUncompressedBytes} bytes`);
    if (
      compressedSize === 0 &&
      uncompressedSize > 0
    ) reject(`entry ${index} has no compressed payload`);
    if (
      compressedSize > 0 &&
      uncompressedSize > limits.ratioCheckThresholdBytes &&
      uncompressedSize / compressedSize > limits.maxCompressionRatio
    ) reject(`entry ${index} compression ratio is too high`);
    offset += 46 + nameLength + extraLength + commentLength;
    if (offset > centralDirectoryOffset + centralDirectorySize)
      reject("central directory entry exceeds its declared bounds");
  }
  if (offset !== centralDirectoryOffset + centralDirectorySize)
    reject("central directory contains trailing or missing entries");
}
