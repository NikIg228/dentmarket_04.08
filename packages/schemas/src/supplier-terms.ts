import { z } from "zod";

export const supplierLegalCodeSchema = z.enum(["seller-agreement", "tariffs", "rules", "personal-data"]);
export const supplierLegalDocumentSchema = z.object({
  code: supplierLegalCodeSchema,
  title: z.string(),
  purpose: z.enum(["COMMERCIAL", "PERSONAL_DATA"]),
  version: z.string(),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  content: z.string(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const supplierLegalBundleSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  available: z.boolean(),
  documents: z.array(supplierLegalDocumentSchema),
});
export const acceptSupplierTermsSchema = z.object({
  organizationVersion: z.number().int().positive(),
  bundleHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewedDocuments: z.array(z.object({ code: supplierLegalCodeSchema, hash: z.string().regex(/^[a-f0-9]{64}$/) })).length(4),
  acknowledged: z.literal(true),
  actsForOrganization: z.literal(true),
  representativeAuthority: z.string().trim().min(3).max(500),
}).strict();
export const supplierAdmissionStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]);
export const reviewSupplierAdmissionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  status: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
  organizationVerified: z.boolean(),
  representativeVerified: z.boolean(),
  reason: z.string().trim().min(3).max(1000),
}).strict().refine((value) => value.status !== "APPROVED" || (value.organizationVerified && value.representativeVerified), {
  message: "Подтвердите проверку организации и полномочий представителя",
});
export const supplierTermsAcceptanceSchema = z.object({
  id: z.uuid(), organizationId: z.uuid(), userId: z.uuid(),
  legalName: z.string(), bin: z.string(), representativeName: z.string(), representativeAuthority: z.string(),
  bundleHash: z.string(), acceptedAt: z.iso.datetime(),
  documents: z.array(supplierLegalDocumentSchema),
  admissionStatus: supplierAdmissionStatusSchema,
  reviewReason: z.string().nullable(), reviewedAt: z.iso.datetime().nullable(),
  reviewedById: z.uuid().nullable(), version: z.number().int(),
});
export const supplierTermsStateSchema = z.object({
  organization: z.object({ id: z.uuid(), legalName: z.string(), bin: z.string(), version: z.number().int(), representativeName: z.string() }),
  bundle: supplierLegalBundleSchema,
  acceptance: supplierTermsAcceptanceSchema.nullable(),
  contractAccepted: z.boolean(), admitted: z.boolean(),
  legacyAgreementActive: z.boolean(),
});
export const supplierAdmissionListSchema = z.object({ items: z.array(supplierTermsAcceptanceSchema) });
export type SupplierLegalDocument = z.infer<typeof supplierLegalDocumentSchema>;
export type SupplierLegalBundle = z.infer<typeof supplierLegalBundleSchema>;
export type AcceptSupplierTermsInput = z.infer<typeof acceptSupplierTermsSchema>;
export type ReviewSupplierAdmissionInput = z.infer<typeof reviewSupplierAdmissionSchema>;
export type SupplierTermsAcceptance = z.infer<typeof supplierTermsAcceptanceSchema>;
export type SupplierTermsState = z.infer<typeof supplierTermsStateSchema>;
export type SupplierAdmissionList = z.infer<typeof supplierAdmissionListSchema>;
