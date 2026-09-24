import { createHash, createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";
import { completeFixtureOrganization } from "../../../scripts/lib/organization-profile-fixture.mjs";

// Only the isolated browser fixture API uses this published test key.
export const e2eJwtSecret = "isolated-e2e-jwt-key-never-use-outside-tests";
function assertTestDatabase() {
  const target = new URL(process.env.DATABASE_URL!);
  if (!process.env.CI && target.pathname !== "/dentmarket_audit_20260914") throw new Error("Workspace browser fixtures require the approved isolated DB");
  if (!["127.0.0.1", "localhost"].includes(target.hostname)) throw new Error("Browser fixtures require a local database");
}
export async function workspaceFixture(prisma: PrismaClient, capability: "BUYER" | "SUPPLIER", identity: { userId: string; organizationId: string; displayName: string }) {
  assertTestDatabase();
  const membership = await prisma.organizationMembership.findFirstOrThrow({ where: { userId: identity.userId, organizationId: identity.organizationId, status: "ACTIVE", organization: { capabilities: { some: { capability } } } } });
  await completeFixtureOrganization(prisma, identity.organizationId);
  const id = randomUUID(), now = Math.floor(Date.now() / 1000);
  await prisma.authSession.create({ data: { id, userId: membership.userId, familyId: randomUUID(), refreshTokenHash: createHash("sha256").update(randomUUID()).digest("hex"), organizationIds: [identity.organizationId], activeOrganizationId: identity.organizationId, authMethods: ["password"], expiresAt: new Date(Date.now() + 3600000) } });
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: identity.userId, jti: id, organization_id: identity.organizationId, organization_ids: [identity.organizationId], amr: ["password"], iss: process.env.JWT_ISSUER ?? "dentmarket-kz", aud: process.env.JWT_AUDIENCE ?? "dentmarket-web", iat: now, exp: now + 1800 })}`;
  const accessToken = unsigned + "." + createHmac("sha256", process.env.JWT_SECRET ?? e2eJwtSecret).update(unsigned).digest("base64url");
  return { sessionId: id, capability, organizationId: identity.organizationId, organizationDisplayName: identity.displayName, displayName: identity.displayName, accessToken, accessTokenExpiresAt: Date.now() + 1800000 };
}

/** UI/profile scenarios use a real scoped session; normal login has separate coverage. */
export async function installPilotWorkspace(page: Page, capability: "BUYER" | "SUPPLIER") {
  assertTestDatabase();
  const db = new PrismaClient();
  try {
    const org = await db.organization.findFirstOrThrow({ where: { bin: { startsWith: capability === "BUYER" ? "970" : "980" }, status: "ACTIVE", capabilities: { some: { capability } } }, orderBy: { bin: "asc" } });
    const permissions = capability === "BUYER" ? ["organization.view","order.create","document.view","notification.view","catalog.product.view"] : ["organization.view","catalog.product.view","inventory.view","order.confirm","integration.view","import.manage","compliance.view","document.view","notification.view"];
    const key = randomUUID();
    const user = await db.user.create({ data: { email: `e2e-workspace-${key}@example.invalid`, displayName: "Browser fixture", status: "ACTIVE", emailVerifiedAt: new Date() } });
    const role = await db.role.create({ data: { organizationId: org.id, code: `e2e-${key}`, name: "Browser fixture", permissions: { create: permissions.map(code => ({ permission: { connect: { code } } })) } } });
    await db.organizationMembership.create({ data: { userId: user.id, organizationId: org.id, status: "ACTIVE", acceptedAt: new Date(), roles: { create: { roleId: role.id } } } });
    const session = await workspaceFixture(db, capability, { userId: user.id, organizationId: org.id, displayName: org.displayName });
    await page.addInitScript(({ session, capability }) => sessionStorage.setItem(`dentmarket:${capability.toLowerCase()}-session`, JSON.stringify(session)), { session, capability });
    return { displayName: org.displayName, dispose: async () => { const cleanup = new PrismaClient(); try { await cleanup.authSession.updateMany({ where: { id: session.sessionId }, data: { status: "REVOKED", revokedAt: new Date(), revokeReason: "browser_fixture_finished" } }); } finally { await cleanup.$disconnect(); } } };
  } finally { await db.$disconnect(); }
}
