import { z } from "zod";
import { workspaceContextSchema } from "./workspace-context.js";
export { workspaceContextSchema } from "./workspace-context.js";

export const workspaceChoicesSchema = z.array(workspaceContextSchema);
export const workspaceHandoffRequestSchema = z.object({ capability: z.enum(["BUYER", "SUPPLIER"]) }).strict();
export const workspaceHandoffResponseSchema = workspaceHandoffRequestSchema.extend({
  handoffCode: z.string().min(20), expiresAt: z.iso.datetime(),
  organizationId: z.uuid(), organizationDisplayName: z.string().min(1),
});
export const workspaceExchangeRequestSchema = z.object({ handoffCode: z.string().min(20).max(512) }).strict();
export const workspaceRefreshResponseSchema = z.object({
  accessToken: z.string().min(1), accessTokenExpiresIn: z.number().int().positive(),
  sessionId: z.uuid(), activeOrganizationId: z.uuid(), organizationIds: z.array(z.uuid()),
  refreshTokenExpiresAt: z.iso.datetime(), csrfToken: z.string().min(24),
});
export const workspaceSessionSchema = workspaceRefreshResponseSchema.extend({
  user: z.object({ id: z.uuid(), email: z.email(), displayName: z.string().min(1) }),
  capability: z.enum(["BUYER", "SUPPLIER"]), organizationId: z.uuid(),
  organizationDisplayName: z.string().min(1),
});
export type WorkspaceSession = z.infer<typeof workspaceSessionSchema>;

// Read-only restoration from an HttpOnly session cookie. No refresh rotation or
// workspace creation; the server rechecks active membership before returning it.
export const currentSessionSchema = workspaceRefreshResponseSchema.extend({
  user: z.object({ id: z.uuid(), email: z.email(), displayName: z.string().min(1) }),
  workspaces: workspaceChoicesSchema,
});
export type CurrentSession = z.infer<typeof currentSessionSchema>;
export const currentSessionQuerySchema = z.object({ workspace: z.enum(["BUYER", "SUPPLIER"]).optional() }).strict();
