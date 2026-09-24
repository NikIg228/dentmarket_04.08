import { z } from "zod";

export const organizationAddressSchema = z.object({
  cityId: z.uuid(),
  line1: z.string().trim().min(5).max(500),
  postalCode: z.string().trim().max(20).nullable(),
}).strict();
export const organizationProfileFieldsSchema = z.object({
  contactName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(7).max(30).regex(/^\+?[\d ()-]+$/, "Укажите телефон с кодом города или оператора").refine(value => value.replace(/\D/g, "").length >= 7, "Укажите полный номер телефона"),
  email: z.email().max(254).toLowerCase(),
  legalAddress: organizationAddressSchema,
  deliveryAddress: organizationAddressSchema,
}).strict();
export const saveOrganizationProfileSchema = organizationProfileFieldsSchema.extend({
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(160),
});
export const organizationProfileResponseSchema = z.object({
  organizationId: z.uuid(), legalName: z.string(), displayName: z.string(), bin: z.string(),
  version: z.number().int().positive(), canEdit: z.boolean(), complete: z.boolean(),
  profile: organizationProfileFieldsSchema.nullable(),
}).strict();
export const organizationOnboardingStepSchema = z.object({
  id: z.enum(["organization", "warehouse", "credentials", "agreement", "admission"]),
  label: z.string(), complete: z.boolean(), reason: z.string().nullable(),
  action: z.enum(["profile", "warehouse", "compliance", "documents", "wait"]),
}).strict();
export const organizationOnboardingSchema = z.object({
  organization: organizationProfileResponseSchema,
  capability: z.enum(["BUYER", "SUPPLIER"]),
  ready: z.boolean(), steps: z.array(organizationOnboardingStepSchema),
}).strict();
export type OrganizationProfileFields = z.infer<typeof organizationProfileFieldsSchema>;
export type SaveOrganizationProfileInput = z.infer<typeof saveOrganizationProfileSchema>;
export type OrganizationProfileResponse = z.infer<typeof organizationProfileResponseSchema>;
export type OrganizationOnboarding = z.infer<typeof organizationOnboardingSchema>;
