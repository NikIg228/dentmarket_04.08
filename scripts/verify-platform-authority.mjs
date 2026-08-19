import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { PrismaClient } from "../apps/api/node_modules/@prisma/client/index.js";

const root = path.resolve(import.meta.dirname, "..");
const apiDirectory = path.join(root, "apps", "api");
const apiEntry = path.join(apiDirectory, "dist", "src", "main.js");
const databaseUrl =
  process.env.POSTGRES_TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public";
const parsedDatabaseUrl = new URL(databaseUrl);
const runId = `r1a_${Date.now()}_${process.pid}`;
const slugRunId = runId.replaceAll("_", "-");
let port = Number(process.env.PLATFORM_AUTHORITY_API_PORT ?? 0);
let apiBase = "";
const storageRoot = path.join(root, ".tmp", "platform-authority", runId);
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const fixture = {
  organizationIds: [],
  userIds: [],
  roleIds: [],
  globalRoleIds: [],
  invitationIds: [],
  membershipIds: [],
  productIds: [],
  variantIds: [],
  attributeIds: [],
  conversationIds: [],
  categoryIds: [],
};
const logs = [];
let api;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runPnpm(args, env) {
  const windows = process.platform === "win32";
  const executable = windows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
  const commandArgs = windows
    ? ["/d", "/s", "/c", `pnpm ${args.join(" ")}`]
    : args;
  const result = spawnSync(executable, commandArgs, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      `pnpm ${args.join(" ")} failed with exit code ${result.status}`,
    );
  }
}

function rememberLog(chunk) {
  logs.push(...String(chunk).split(/\r?\n/).filter(Boolean));
  if (logs.length > 100) logs.splice(0, logs.length - 100);
}

async function resolvePort() {
  if (port > 0) {
    apiBase = `http://127.0.0.1:${port}/api`;
    return;
  }
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(
    address && typeof address === "object",
    "Failed to allocate an API port",
  );
  port = address.port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  apiBase = `http://127.0.0.1:${port}/api`;
}

async function request(route, { method = "GET", identity, body } = {}) {
  const headers = {};
  if (identity) {
    headers["x-user-id"] = identity.userId;
    headers["x-organization-id"] = identity.organizationId;
  }
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${apiBase}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { status: response.status, body: payload };
}

async function expectStatus(route, options, expectedStatus) {
  const response = await request(route, options);
  assert(
    response.status === expectedStatus,
    `${options?.method ?? "GET"} ${route} returned ${response.status}, expected ${expectedStatus}: ${JSON.stringify(response.body)}`,
  );
  return response.body;
}

async function waitUntilReady(timeoutMs = 60_000) {
  const startedAt = Date.now();
  let lastHealth = null;
  while (Date.now() - startedAt < timeoutMs) {
    if (api.exitCode !== null) {
      throw new Error(
        `API exited before readiness with code ${api.exitCode}:\n${logs.join("\n")}`,
      );
    }
    try {
      const response = await request("/health/ready");
      lastHealth = response;
      if (response.status === 200 && response.body?.status === "ready") return;
    } catch (error) {
      lastHealth = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(
    `API at ${apiBase} did not become ready within ${timeoutMs} ms; last health=${JSON.stringify(lastHealth)}:\n${logs.join("\n")}`,
  );
}

async function stopApi() {
  if (!api || api.exitCode !== null) return;
  api.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => api.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (api.exitCode === null) api.kill("SIGKILL");
}

async function createOrganizationFixture({
  capability,
  binPrefix,
  emailPrefix,
  roleCode,
  roleName,
  permissionCodes,
}) {
  const suffix = `${String(Date.now()).slice(-7)}${String((process.pid + fixture.organizationIds.length) % 1000).padStart(3, "0")}`;
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}-${runId}@marketplace.local`,
      displayName: roleName,
      emailVerifiedAt: new Date(),
    },
  });
  const organization = await prisma.organization.create({
    data: {
      legalName: `${roleName} ${runId}`,
      displayName: roleName,
      bin: `${binPrefix}${suffix}`,
      capabilities: { create: { capability } },
    },
  });
  const role = await prisma.role.create({
    data: {
      organizationId: organization.id,
      code: roleCode,
      name: roleName,
      isSystem: true,
      permissions: {
        create: permissionCodes.map((code) => ({
          permission: { connect: { code } },
        })),
      },
    },
  });
  const membership = await prisma.organizationMembership.create({
    data: {
      userId: user.id,
      organizationId: organization.id,
      status: "ACTIVE",
      acceptedAt: new Date(),
      isPrimary: true,
      roles: { create: { roleId: role.id } },
    },
  });
  await prisma.organizationFeature.create({
    data: {
      organizationId: organization.id,
      featureKey: "ai.assistant",
      enabled: true,
      source: "R1A_TEST",
    },
  });
  fixture.organizationIds.push(organization.id);
  fixture.userIds.push(user.id);
  fixture.roleIds.push(role.id);
  fixture.membershipIds.push(membership.id);
  return {
    identity: { userId: user.id, organizationId: organization.id },
    membershipId: membership.id,
  };
}

async function cleanupFixtures() {
  if (fixture.conversationIds.length) {
    await prisma.aiFeedback.deleteMany({
      where: { conversationId: { in: fixture.conversationIds } },
    });
    await prisma.aiToolExecution.deleteMany({
      where: { conversationId: { in: fixture.conversationIds } },
    });
    await prisma.aiMessage.deleteMany({
      where: { conversationId: { in: fixture.conversationIds } },
    });
    await prisma.aiConversation.deleteMany({
      where: { id: { in: fixture.conversationIds } },
    });
  }
  if (fixture.organizationIds.length) {
    await prisma.auditLog.deleteMany({
      where: { organizationId: { in: fixture.organizationIds } },
    });
    await prisma.organizationFeature.deleteMany({
      where: { organizationId: { in: fixture.organizationIds } },
    });
  }
  const aggregateIds = [
    ...fixture.roleIds,
    ...fixture.productIds,
    ...fixture.variantIds,
    ...fixture.invitationIds,
    ...fixture.membershipIds,
  ];
  if (aggregateIds.length) {
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: aggregateIds } },
    });
  }
  if (fixture.productIds.length) {
    await prisma.product.deleteMany({
      where: { id: { in: fixture.productIds } },
    });
  }
  if (fixture.invitationIds.length) {
    await prisma.membershipInvitation.deleteMany({
      where: { id: { in: fixture.invitationIds } },
    });
  }
  if (fixture.globalRoleIds.length) {
    await prisma.role.deleteMany({
      where: { id: { in: fixture.globalRoleIds } },
    });
  }
  if (fixture.organizationIds.length) {
    await prisma.organization.deleteMany({
      where: { id: { in: fixture.organizationIds } },
    });
  }
  if (fixture.userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: fixture.userIds } } });
  }
  if (fixture.categoryIds.length) {
    await prisma.category.deleteMany({
      where: { id: { in: fixture.categoryIds } },
    });
  }
  if (fixture.attributeIds.length) {
    await prisma.attributeDefinition.deleteMany({
      where: { id: { in: fixture.attributeIds } },
    });
  }
  const [organizations, users, roles, products, conversations, invitations] =
    await Promise.all([
      prisma.organization.count({
        where: { id: { in: fixture.organizationIds } },
      }),
      prisma.user.count({ where: { id: { in: fixture.userIds } } }),
      prisma.role.count({ where: { id: { in: fixture.roleIds } } }),
      prisma.product.count({ where: { id: { in: fixture.productIds } } }),
      prisma.aiConversation.count({
        where: { id: { in: fixture.conversationIds } },
      }),
      prisma.membershipInvitation.count({
        where: { id: { in: fixture.invitationIds } },
      }),
    ]);
  assert(
    organizations + users + roles + products + conversations + invitations ===
      0,
    `Authority fixture cleanup left organization/user/role/product/conversation/invitation counts ${organizations}/${users}/${roles}/${products}/${conversations}/${invitations}`,
  );
}

try {
  assert(
    ["127.0.0.1", "localhost", "::1"].includes(parsedDatabaseUrl.hostname) ||
      process.env.POSTGRES_VERIFY_ALLOW_REMOTE === "true",
    "Platform-authority verification is local-only unless POSTGRES_VERIFY_ALLOW_REMOTE=true",
  );
  assert(/^[a-zA-Z0-9_]+$/.test(runId), "Unsafe fixture run identifier");
  await resolvePort();
  await mkdir(storageRoot, { recursive: true });
  const testEnvironment = {
    ...process.env,
    NODE_ENV: "test",
    DEPLOYMENT_PROFILE: "pilot",
    PROCESS_ROLE: "api",
    DATABASE_URL: databaseUrl,
    AUTH_MODE: "development",
    BACKGROUND_QUEUE_ENABLED: "false",
    OBJECT_STORAGE_DRIVER: "local",
    LOCAL_STORAGE_PATH: storageRoot,
    AV_SCAN_MODE: "disabled",
    LOG_LEVEL: "warn",
  };
  runPnpm(
    ["--filter", "@marketplace/api", "exec", "prisma", "migrate", "deploy"],
    testEnvironment,
  );
  runPnpm(["db:seed:test"], testEnvironment);
  await prisma.$connect();

  const supplier = await createOrganizationFixture({
    capability: "SUPPLIER",
    binPrefix: "79",
    emailPrefix: "supplier",
    roleCode: "r1a_supplier_owner",
    roleName: "R1A supplier owner",
    permissionCodes: [
      "organization.view",
      "organization.members.manage",
      "organization.roles.manage",
      "catalog.product.view",
      "catalog.product.create",
      "ai.use",
    ],
  });
  const operator = await createOrganizationFixture({
    capability: "MARKETPLACE_OPERATOR",
    binPrefix: "78",
    emailPrefix: "operator",
    roleCode: "r1a_platform_operator",
    roleName: "R1A marketplace operator",
    permissionCodes: ["organization.view", "catalog.product.create", "ai.use"],
  });
  const globalRole = await prisma.role.create({
    data: {
      organizationId: null,
      code: `r1a_global_${process.pid}`,
      name: "R1A global role",
      isSystem: true,
      permissions: {
        create: {
          permission: { connect: { code: "security.event.view" } },
        },
      },
    },
  });
  fixture.roleIds.push(globalRole.id);
  fixture.globalRoleIds.push(globalRole.id);

  const industry = await prisma.industry.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  assert(industry, "Reference industry is missing");
  const unit = await prisma.unitOfMeasure.findFirst({
    orderBy: { code: "asc" },
  });
  assert(unit, "Reference unit of measure is missing");
  const attribute = await prisma.attributeDefinition.create({
    data: {
      code: `r1a_attribute_${process.pid}`,
      nameRu: "R1A attribute",
      nameKk: "R1A attribute",
      valueType: "TEXT",
    },
  });
  fixture.attributeIds.push(attribute.id);
  let category = await prisma.category.findFirst({
    where: { industryId: industry.id, status: "ACTIVE" },
    orderBy: { path: "asc" },
  });
  if (!category) {
    category = await prisma.category.create({
      data: {
        industryId: industry.id,
        code: `r1a-${process.pid}`,
        nameRu: "R1A category",
        nameKk: "R1A category",
        path: `r1a-${process.pid}`,
        depth: 0,
      },
    });
    fixture.categoryIds.push(category.id);
  }

  api = spawn(process.execPath, [apiEntry], {
    cwd: apiDirectory,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...testEnvironment,
      API_HOST: "127.0.0.1",
      API_PORT: String(port),
    },
  });
  api.stdout.on("data", rememberLog);
  api.stderr.on("data", rememberLog);
  await waitUntilReady();

  await expectStatus("/organizations", { identity: supplier.identity }, 403);
  const operatorOrganizations = await expectStatus(
    "/organizations",
    { identity: operator.identity },
    200,
  );
  assert(
    Array.isArray(operatorOrganizations) &&
      operatorOrganizations.some(
        ({ id }) => id === supplier.identity.organizationId,
      ) &&
      operatorOrganizations
        .find(({ id }) => id === supplier.identity.organizationId)
        ?.capabilities?.some(({ capability }) => capability === "SUPPLIER"),
    "Platform operator organization view did not return the expected capability projection",
  );

  const roleAuditBefore = await prisma.auditLog.count({
    where: {
      organizationId: supplier.identity.organizationId,
      action: "access.role.created",
    },
  });
  const roleOutboxBefore = await prisma.outboxEvent.count();
  await expectStatus(
    `/organizations/${supplier.identity.organizationId}/roles`,
    {
      method: "POST",
      identity: supplier.identity,
      body: {
        code: "r1a_forbidden",
        name: "Forbidden escalation",
        permissionCodes: ["security.event.view"],
      },
    },
    403,
  );
  const [forbiddenRoleCount, roleAuditAfter, roleOutboxAfter] =
    await Promise.all([
      prisma.role.count({ where: { code: "r1a_forbidden" } }),
      prisma.auditLog.count({
        where: {
          organizationId: supplier.identity.organizationId,
          action: "access.role.created",
        },
      }),
      prisma.outboxEvent.count(),
    ]);
  assert(
    forbiddenRoleCount === 0 &&
      roleAuditAfter === roleAuditBefore &&
      roleOutboxAfter === roleOutboxBefore,
    "Denied role escalation left a role, audit entry or outbox event",
  );
  const allowedRole = await expectStatus(
    `/organizations/${supplier.identity.organizationId}/roles`,
    {
      method: "POST",
      identity: supplier.identity,
      body: {
        code: "r1a_catalog_viewer",
        name: "Catalog viewer",
        permissionCodes: ["catalog.product.view"],
      },
    },
    201,
  );
  fixture.roleIds.push(allowedRole.id);

  await expectStatus(
    `/organizations/${supplier.identity.organizationId}/memberships/${supplier.membershipId}/roles`,
    {
      method: "POST",
      identity: supplier.identity,
      body: { roleId: globalRole.id },
    },
    403,
  );
  assert(
    (await prisma.membershipRole.count({
      where: {
        membershipId: supplier.membershipId,
        roleId: globalRole.id,
      },
    })) === 0,
    "Denied global role assignment was persisted",
  );
  await expectStatus(
    `/organizations/${supplier.identity.organizationId}/invitations`,
    {
      method: "POST",
      identity: supplier.identity,
      body: {
        email: `invite-${runId}@marketplace.local`,
        roleIds: [globalRole.id],
        expiresInHours: 24,
      },
    },
    403,
  );
  assert(
    (await prisma.membershipInvitation.count({
      where: { organizationId: supplier.identity.organizationId },
    })) === 0,
    "Denied global role invitation was persisted",
  );

  await prisma.membershipRole.create({
    data: {
      membershipId: supplier.membershipId,
      roleId: globalRole.id,
    },
  });
  const legacyPermissions = await expectStatus(
    "/access-control/permissions",
    { identity: supplier.identity },
    200,
  );
  assert(
    Array.isArray(legacyPermissions) &&
      !legacyPermissions.includes("security.event.view"),
    "Legacy global role still contributed effective permissions",
  );
  await prisma.membershipRole.delete({
    where: {
      membershipId_roleId: {
        membershipId: supplier.membershipId,
        roleId: globalRole.id,
      },
    },
  });

  const legacyInvitationToken = randomBytes(32).toString("base64url");
  const legacyInvitationEmail = `legacy-invite-${runId}@marketplace.local`;
  const legacyInvitation = await prisma.membershipInvitation.create({
    data: {
      organizationId: supplier.identity.organizationId,
      email: legacyInvitationEmail,
      tokenHash: createHash("sha256")
        .update(legacyInvitationToken)
        .digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      roles: { create: { roleId: globalRole.id } },
    },
  });
  fixture.invitationIds.push(legacyInvitation.id);
  await expectStatus(
    "/invitations/accept",
    {
      method: "POST",
      body: {
        token: legacyInvitationToken,
        displayName: "Legacy invitation user",
      },
    },
    403,
  );
  const [legacyInvitationAfter, legacyInvitationUser] = await Promise.all([
    prisma.membershipInvitation.findUnique({
      where: { id: legacyInvitation.id },
    }),
    prisma.user.findUnique({ where: { email: legacyInvitationEmail } }),
  ]);
  assert(
    legacyInvitationAfter?.status === "PENDING" && !legacyInvitationUser,
    "Denied legacy invitation mutated invitation or user state",
  );

  const tenantInvitationEmail = `tenant-invite-${runId}@marketplace.local`;
  const tenantInvitation = await expectStatus(
    `/organizations/${supplier.identity.organizationId}/invitations`,
    {
      method: "POST",
      identity: supplier.identity,
      body: {
        email: tenantInvitationEmail,
        roleIds: [allowedRole.id],
        expiresInHours: 24,
      },
    },
    201,
  );
  fixture.invitationIds.push(tenantInvitation.invitationId);
  const acceptedInvitation = await expectStatus(
    "/invitations/accept",
    {
      method: "POST",
      body: {
        token: tenantInvitation.token,
        displayName: "Tenant invitation user",
      },
    },
    201,
  );
  fixture.userIds.push(acceptedInvitation.user.id);
  fixture.membershipIds.push(acceptedInvitation.membership.id);
  assert(
    acceptedInvitation.membership.roles.some(
      ({ roleId }) => roleId === allowedRole.id,
    ),
    "Tenant-owned invitation role was not assigned",
  );

  const productSlug = `${slugRunId}-canonical-product`;
  const productBody = {
    canonicalName: `R1A canonical product ${runId}`,
    slug: productSlug,
    productType: "MATERIAL",
    industryIds: [industry.id],
    categoryIds: [category.id],
  };
  const catalogAuditBefore = await prisma.auditLog.count({
    where: {
      organizationId: supplier.identity.organizationId,
      action: "catalog.product.created",
    },
  });
  const catalogOutboxBefore = await prisma.outboxEvent.count();
  await expectStatus(
    "/catalog/products",
    { method: "POST", identity: supplier.identity, body: productBody },
    403,
  );
  const [deniedProductCount, catalogAuditAfter, catalogOutboxAfter] =
    await Promise.all([
      prisma.product.count({ where: { slug: productSlug } }),
      prisma.auditLog.count({
        where: {
          organizationId: supplier.identity.organizationId,
          action: "catalog.product.created",
        },
      }),
      prisma.outboxEvent.count(),
    ]);
  assert(
    deniedProductCount === 0 &&
      catalogAuditAfter === catalogAuditBefore &&
      catalogOutboxAfter === catalogOutboxBefore,
    "Denied canonical catalog write left product, audit or outbox state",
  );
  const operatorProduct = await expectStatus(
    "/catalog/products",
    { method: "POST", identity: operator.identity, body: productBody },
    201,
  );
  assert(operatorProduct.slug === productSlug, "Operator product flow failed");
  fixture.productIds.push(operatorProduct.id);
  const operatorVariant = await expectStatus(
    `/catalog/products/${operatorProduct.id}/variants`,
    { method: "POST", identity: operator.identity, body: {} },
    201,
  );
  fixture.variantIds.push(operatorVariant.id);

  const catalogMutationAuditBefore = await prisma.auditLog.count({
    where: { organizationId: supplier.identity.organizationId },
  });
  const catalogMutationOutboxBefore = await prisma.outboxEvent.count();
  await expectStatus(
    `/catalog/products/${operatorProduct.id}`,
    {
      method: "PATCH",
      identity: supplier.identity,
      body: {
        version: operatorProduct.version,
        canonicalName: "R1A forbidden update",
      },
    },
    403,
  );
  await expectStatus(
    `/catalog/products/${operatorProduct.id}/variants`,
    { method: "POST", identity: supplier.identity, body: {} },
    403,
  );
  await expectStatus(
    `/catalog/products/${operatorProduct.id}/attributes`,
    {
      method: "PUT",
      identity: supplier.identity,
      body: { attributeId: attribute.id, value: "forbidden" },
    },
    403,
  );
  await expectStatus(
    `/catalog/variants/${operatorVariant.id}/attributes`,
    {
      method: "PUT",
      identity: supplier.identity,
      body: { attributeId: attribute.id, value: "forbidden" },
    },
    403,
  );
  await expectStatus(
    `/catalog/variants/${operatorVariant.id}/packagings`,
    {
      method: "POST",
      identity: supplier.identity,
      body: {
        unitId: unit.id,
        code: `r1a-pack-${process.pid}`,
        name: "R1A forbidden packaging",
        level: "SALE",
        quantityInBaseUnit: 1,
      },
    },
    403,
  );
  const [catalogMutationAuditAfter, catalogMutationOutboxAfter] =
    await Promise.all([
      prisma.auditLog.count({
        where: { organizationId: supplier.identity.organizationId },
      }),
      prisma.outboxEvent.count(),
    ]);
  assert(
    catalogMutationAuditAfter === catalogMutationAuditBefore &&
      catalogMutationOutboxAfter === catalogMutationOutboxBefore,
    "Denied catalog child mutations left audit or outbox state",
  );

  const supplierConversation = await expectStatus(
    "/ai/conversations",
    {
      method: "POST",
      identity: supplier.identity,
      body: { role: "SUPPLIER", title: "R1A supplier conversation" },
    },
    201,
  );
  fixture.conversationIds.push(supplierConversation.id);
  await expectStatus(
    "/ai/conversations",
    {
      method: "POST",
      identity: supplier.identity,
      body: { role: "OPERATOR", title: "R1A forbidden operator" },
    },
    403,
  );
  assert(
    (await prisma.aiConversation.count({
      where: {
        organizationId: supplier.identity.organizationId,
        role: "OPERATOR",
      },
    })) === 0,
    "Denied operator AI conversation was persisted",
  );
  const legacyConversation = await prisma.aiConversation.create({
    data: {
      organizationId: supplier.identity.organizationId,
      userId: supplier.identity.userId,
      role: "OPERATOR",
      title: "R1A legacy unauthorized operator",
    },
  });
  fixture.conversationIds.push(legacyConversation.id);
  await expectStatus(
    `/ai/conversations/${legacyConversation.id}/messages`,
    {
      method: "POST",
      identity: supplier.identity,
      body: { content: "Покажи support queue и SLA" },
    },
    403,
  );
  const [legacyMessages, legacyExecutions] = await Promise.all([
    prisma.aiMessage.count({
      where: { conversationId: legacyConversation.id },
    }),
    prisma.aiToolExecution.count({
      where: { conversationId: legacyConversation.id },
    }),
  ]);
  assert(
    legacyMessages === 0 && legacyExecutions === 0,
    "Legacy unauthorized AI conversation produced messages or tool executions",
  );
  const operatorConversation = await expectStatus(
    "/ai/conversations",
    {
      method: "POST",
      identity: operator.identity,
      body: { role: "OPERATOR", title: "R1A operator conversation" },
    },
    201,
  );
  fixture.conversationIds.push(operatorConversation.id);

  console.log(
    JSON.stringify(
      {
        status: "passed",
        database: parsedDatabaseUrl.pathname.slice(1),
        scenarios: {
          rolePermissionEscalation: "denied_without_side_effects",
          globalRoleAssignment:
            "denied_direct_new_and_filtered_from_legacy_membership",
          legacyInvitation:
            "global_role_rejected_before_side_effects_tenant_role_accepted",
          canonicalCatalogWrite:
            "supplier_denied_for_product_variant_attributes_and_packaging_operator_allowed",
          aiRoleSelection: "capability_bound",
          legacyAiConversation: "revalidated_before_tool_execution",
          organizationEnumeration: "tenant_denied_operator_allowed",
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  if (logs.length) console.error(`API log tail:\n${logs.join("\n")}`);
  process.exitCode = 1;
} finally {
  await stopApi();
  await cleanupFixtures().catch((error) => {
    console.error(
      `Platform-authority fixture cleanup failed: ${error instanceof Error ? error.stack : error}`,
    );
    process.exitCode = 1;
  });
  await prisma.$disconnect().catch(() => undefined);
  await rm(storageRoot, { recursive: true, force: true });
}
