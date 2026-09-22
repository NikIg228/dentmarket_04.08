import { randomUUID } from "node:crypto";

const API = process.env.API_URL ?? "http://127.0.0.1:4012/api";
const OPERATOR = {
  actorId: "00000000-0000-4000-8000-000000000002",
  organizationId: "00000000-0000-4000-8000-000000000001",
  bin: "000000000001",
};
const identityHeaders = ({ actorId, organizationId }) => ({
  "x-user-id": actorId,
  "x-organization-id": organizationId,
});

async function request(
  path,
  { method = "GET", body, identity, expected = 200, headers = {} } = {},
) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(identity ? identityHeaders(identity) : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : text : null;
  if (response.status !== expected)
    throw new Error(
      `${method} ${path}: expected ${expected}, received ${response.status}: ${text}`,
    );
  return payload;
}

const suffix = `${Date.now()}`.slice(-12);
const email = `supplier.${suffix}@example.kz`;
const created = await request("/onboarding/registrations", {
  method: "POST",
  expected: 201,
  body: {
    email,
    ownerDisplayName: "Сквозной тест",
    legalName: `ТОО Сквозной тест ${suffix}`,
    organizationDisplayName: `Test Supplier ${suffix}`,
    bin: suffix,
    capability: "SUPPLIER",
    termsAccepted: true,
    privacyAccepted: true,
    marketingConsent: false,
    consentVersion: "2026-07-17",
    source: "verification",
    idempotencyKey: randomUUID(),
  },
});
if (!created.registrationToken)
  throw new Error("Registration token was not issued");
const completed = await request(
  "/onboarding/registrations/complete-development",
  {
    method: "POST",
    expected: 201,
    body: { registrationToken: created.registrationToken },
  },
);
const supplier = {
  actorId: completed.actorId,
  organizationId: completed.organizationId,
};
if (!supplier.actorId || !supplier.organizationId)
  throw new Error("Registration did not create an owner and organization");

const state = await request("/supplier-terms/current", { identity: supplier });
if (state.contractAccepted || state.admitted || state.acceptance) throw new Error("Registration must not grant supplier acceptance/admission");
if (state.bundle.documents.length !== 4) throw new Error("All supplier legal documents must be listed");
await request("/marketplace-agreements", { method: "POST", expected: 410, identity: supplier, body: {} });
const acceptance = {
  organizationVersion: state.organization.version,
  bundleHash: state.bundle.hash,
  reviewedDocuments: state.bundle.documents.map(({code, hash}) => ({code, hash})),
  acknowledged: true,
  actsForOrganization: true,
  representativeAuthority: "Synthetic verification representative",
};
await request("/supplier-terms/operator/acceptances", { identity: supplier, expected: 403 });
if (!state.bundle.available) {
  await request("/supplier-terms/acceptances", { method: "POST", expected: 409, identity: supplier, body: acceptance });
  const blocked = await request("/supplier-terms/current", { identity: supplier });
  if (blocked.acceptance || blocked.admitted) throw new Error("Draft documents must not grant acceptance or admission");
  console.log(JSON.stringify({ verified: true, mode: "draft_documents_fail_closed", supplierOrganizationId: supplier.organizationId, documents: state.bundle.documents.length, salesAllowed: false }));
} else {
  const accepted = await request("/supplier-terms/acceptances", { method: "POST", expected: 201, identity: supplier, body: acceptance });
  const repeated = await request("/supplier-terms/acceptances", { method: "POST", expected: 201, identity: supplier, body: acceptance });
  if (accepted.id !== repeated.id || accepted.admissionStatus !== "PENDING") throw new Error("Acceptance must be idempotent and pending review");
  const pending = await request("/supplier-terms/current", { identity: supplier });
  if (!pending.contractAccepted || pending.admitted) throw new Error("Acceptance cannot grant sales");
  const review = { expectedVersion: accepted.version, status: "APPROVED", organizationVerified: true, representativeVerified: true, reason: "Synthetic operator verification" };
  await request(`/supplier-terms/operator/acceptances/${accepted.id}/review`, { method: "POST", expected: 403, identity: supplier, body: review });
  await request(`/supplier-terms/operator/acceptances/${accepted.id}/review`, { method: "POST", expected: 400, identity: OPERATOR, body: {...review, representativeVerified: false} });
  await request(`/supplier-terms/operator/acceptances/${accepted.id}/review`, { method: "POST", expected: 201, identity: OPERATOR, body: review });
  const admitted = await request("/supplier-terms/current", { identity: supplier });
  if (!admitted.contractAccepted || !admitted.admitted) throw new Error("Verified operator decision did not grant admission");
  const download = await request(`/supplier-terms/acceptances/${accepted.id}/download`, { identity: supplier });
  if (!state.bundle.documents.every(document => download.includes(document.content))) throw new Error("Accepted texts are missing from the download");
  console.log(JSON.stringify({ verified: true, mode: "common_terms_and_operator_admission", acceptanceId: accepted.id, supplierOrganizationId: supplier.organizationId }));
}
