import { describe, expect, it } from "vitest";
import { acceptSupplierTermsSchema, reviewSupplierAdmissionSchema } from "./supplier-terms";

describe("supplier agreement contracts", () => {
  const input = { organizationVersion: 1, bundleHash: "a".repeat(64), reviewedDocuments: ["seller-agreement", "tariffs", "rules", "personal-data"].map((code) => ({ code, hash: "b".repeat(64) })), acknowledged: true, actsForOrganization: true, representativeAuthority: "Руководитель" };
  it("requires explicit organization authority and all four document references", () => {
    expect(acceptSupplierTermsSchema.safeParse(input).success).toBe(true);
    expect(acceptSupplierTermsSchema.safeParse({ ...input, actsForOrganization: false }).success).toBe(false);
    expect(acceptSupplierTermsSchema.safeParse({ ...input, reviewedDocuments: input.reviewedDocuments.slice(1) }).success).toBe(false);
    expect(acceptSupplierTermsSchema.safeParse({ ...input, organizationId: "forged-tenant" }).success).toBe(false);
  });
  it("requires both operator verifications to grant admission, and a reason for rejection", () => {
    const review = { expectedVersion: 1, status: "APPROVED", organizationVerified: true, representativeVerified: true, reason: "Проверено" };
    expect(reviewSupplierAdmissionSchema.safeParse(review).success).toBe(true);
    expect(reviewSupplierAdmissionSchema.safeParse({ ...review, representativeVerified: false }).success).toBe(false);
    expect(reviewSupplierAdmissionSchema.safeParse({ ...review, status: "REJECTED", reason: "" }).success).toBe(false);
  });
});
