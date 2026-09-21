import { z } from "zod";

/** Minimal current-organization context; never an organization directory. */
export const workspaceContextSchema = z.object({
  organizationId: z.uuid(),
  organizationDisplayName: z.string().min(1),
  capabilities: z.array(z.enum(["BUYER", "SUPPLIER"])).max(2)
    .refine(values => new Set(values).size === values.length, "Capabilities must be unique"),
}).strict();
export type WorkspaceContext = z.infer<typeof workspaceContextSchema>;
