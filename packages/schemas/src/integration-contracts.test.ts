import { describe, expect, it } from "vitest";
import { browserEdsSignatureSchema, signatureGatewayCallbackSchema } from "./commercial.js";
import { parseConnectorAgentJobResult } from "./integration-contracts.js";

describe("connector agent result contracts", () => {
  it("keeps exact price values as strings", () => {
    const result = parseConnectorAgentJobResult("PRICE_SYNC", {
      items: [
        {
          externalId: "1c-offer-1",
          valueMinor: "125000",
          currency: "KZT",
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) expect(JSON.stringify(result.data)).toContain('"valueMinor":"125000"');
  });

  it("rejects a price result that uses a floating point value", () => {
    const result = parseConnectorAgentJobResult("PRICE_SYNC", {
      items: [
        {
          externalId: "1c-offer-1",
          valueMinor: 125000,
          currency: "KZT",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("requires catalog identity fields and does not accept an empty page item", () => {
    const result = parseConnectorAgentJobResult("CATALOG_SYNC", {
      items: [{ externalId: "1c-item-1", name: "Композит" }],
    });

    expect(result.success).toBe(true);
    expect(
      parseConnectorAgentJobResult("CATALOG_SYNC", { items: [{ name: "Без ID" }] }).success,
    ).toBe(false);
  });

  it("accepts reservation results used by external reservation finalization", () => {
    const result = parseConnectorAgentJobResult("RESERVATION_CREATE", {
      externalReservationId: "reserve-1",
      status: "ACTIVE",
      data: { source: "1c" },
    });

    expect(result.success).toBe(true);
  });

  it("requires cryptographic verification evidence for signed gateway callbacks", () => {
    expect(signatureGatewayCallbackSchema.safeParse({
      signatureId: "00000000-0000-4000-8000-000000000001",
      externalSessionId: "session-123456",
      status: "SIGNED",
      externalSignatureId: "signature-123456",
      signedDocumentChecksum: "a".repeat(64),
      certificate: {
        subjectBin: "123456789012",
        issuer: "NCA",
        serialNumber: "serial-1",
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: "2027-01-01T00:00:00.000Z",
      },
    }).success).toBe(false);
  });

  it("accepts a browser EDS payload with a bounded CMS container and checksum", () => {
    expect(browserEdsSignatureSchema.safeParse({
      signatureId: "00000000-0000-4000-8000-000000000001",
      signedContainerBase64: "Y21zLXNpZ25hdHVyZQ==",
      dataChecksumSha256: "a".repeat(64),
    }).success).toBe(true);
  });
});
