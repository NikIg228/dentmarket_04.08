import { z } from "zod";
import { emailRegisterSchema } from "./commercial.js";
export const authMailDeliverySchema = z.enum(["LOCAL_FILE", "PROVIDER"]);
export const authClientOptionsSchema = z.object({ localOperatorPasswordEnabled: z.boolean(), emailDelivery: z.enum(["LOCAL_FILE", "PROVIDER", "UNAVAILABLE"]) }).strict();
export const authRegistrationAcceptedSchema = z.object({ ok: z.literal(true), verificationRequired: z.literal(true), email: z.email(), delivery: authMailDeliverySchema }).strict();
export const authForgotAcceptedSchema = z.object({ ok: z.literal(true), message: z.string(), delivery: authMailDeliverySchema }).strict();
export const localOperatorLoginSchema = z.object({ email: z.string().trim().pipe(z.email()).transform(v=>v.toLowerCase()), password: z.string().min(1).max(128) }).strict();
export const localOperatorSessionSchema = z.object({
  user: z.object({ id: z.uuid(), email: z.email(), displayName: z.string() }).strict(),
  accessToken: z.string().min(20), accessTokenExpiresIn: z.number().int().positive(),
  refreshTokenExpiresAt: z.iso.datetime(), sessionId: z.uuid(), activeOrganizationId: z.uuid(), organizationIds: z.array(z.uuid()), csrfToken: z.string().min(24),
}).strict();
export type AuthClientOptions = z.infer<typeof authClientOptionsSchema>;
export type AuthRegistrationAccepted = z.infer<typeof authRegistrationAcceptedSchema>;
export type AuthForgotAccepted = z.infer<typeof authForgotAcceptedSchema>;
export type LocalOperatorLogin = z.infer<typeof localOperatorLoginSchema>;
export type LocalOperatorSession = z.infer<typeof localOperatorSessionSchema>;
export type AuthEmailRegistration = z.input<typeof emailRegisterSchema>;
