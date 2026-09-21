import { z } from "zod";

export const registrationResumeRequestSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  bin: z.string().regex(/^\d{12}$/),
  capability: z.enum(["BUYER", "SUPPLIER"]),
}).strict();
export const registrationResumeProofSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{64}$/) }).strict();
export const registrationResumeCompleteSchema = registrationResumeRequestSchema.extend({
  token: registrationResumeProofSchema.shape.token,
  password: z.string().min(12).max(128),
}).strict();
export const registrationResumeRequestedSchema = z.object({ status: z.literal("ACCEPTED") }).strict();
export const registrationResumeDetailsSchema = z.object({
  status: z.enum(["READY", "COMPLETED"]),
  email: z.email(), bin: z.string().regex(/^\d{12}$/), capability: z.enum(["BUYER", "SUPPLIER"]),
  organizationDisplayName: z.string(), ownerDisplayName: z.string(),
  passwordMode: z.enum(["NEW", "EXISTING"]), expiresAt: z.iso.datetime(),
}).strict();
export const registrationResumeCompletedSchema = z.object({ status: z.literal("COMPLETED"), next: z.literal("LOGIN") }).strict();
export type RegistrationResumeRequest = z.infer<typeof registrationResumeRequestSchema>;
export type RegistrationResumeProof = z.infer<typeof registrationResumeProofSchema>;
export type RegistrationResumeComplete = z.infer<typeof registrationResumeCompleteSchema>;
export type RegistrationResumeRequested = z.infer<typeof registrationResumeRequestedSchema>;
export type RegistrationResumeDetails = z.infer<typeof registrationResumeDetailsSchema>;
export type RegistrationResumeCompleted = z.infer<typeof registrationResumeCompletedSchema>;
