import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startResumeFixture } from './lib/registration-resume-fixture.mjs';
const serve = process.argv.includes('--serve');
const fixture = await startResumeFixture({ web: serve }).catch(error => {
  // Startup errors contain only owned runtime identity/status, never provider bodies/tokens.
  const safe = /^Owned (?:application exited: \d+|(?:landing|API) readiness timeout \(20s; status (?:unreachable|\d{3})\))$/.test(error.message) ? error.message : 'Isolated fixture startup failed';
  if (serve) process.send?.({ type: 'startup-error', error: safe });
  throw error;
});
const { db, runId, apiUrl, mails } = fixture;
const hash = value => createHash('sha256').update(value).digest('hex');
const proofPath = '/auth/registration/resume';
const password = randomBytes(24).toString('base64url');
let trigger;
async function post(path, body, status = 200, headers = {}) {
  const response = await fetch(apiUrl + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal(response.status, status, `${path} status (response body intentionally omitted)`);
  return response.json();
}
async function pending(index, capability = 'BUYER') {
  const input = { email: `${runId}-${index}@example.invalid`, bin: `96${String(Date.now()).slice(-8)}${index.toString().padStart(2,'0')}`, capability };
  await post('/onboarding/registrations', { ...input, ownerDisplayName: 'Audit resume owner', legalName: 'Audit resume company', organizationDisplayName: 'Audit resume company', termsAccepted: true, privacyAccepted: true, idempotencyKey: `${runId}-${index}` }, 201);
  return input;
}
async function link(input) {
  assert.deepEqual(await post(`${proofPath}/request`, input), { status: 'ACCEPTED' });
  const link = mails.get(input.email); assert.ok(link, 'Only a delivered test email provides proof');
  return new URLSearchParams(new URL(link).hash.slice(1)).get('token');
}
if (serve) {
  // Browser runner talks over inherited IPC, never a public token/test endpoint.
  process.on('message', async message => {
    try {
      const value = message.type === 'mail' ? mails.get(message.email) : message.type === 'readback' ? await fixture.readback(message.email) : null;
      process.send?.({ id: message.id, value });
    } catch { process.send?.({ id: message.id, error: 'Fixture request rejected' }); }
  });
  process.once('disconnect', async () => { await fixture.stop(); process.exit(0); });
  process.send?.({ type: 'ready', apiUrl, runId });
} else {
  try {
    const buyer = await pending(1); const token = await link(buyer);
    assert.equal((await fixture.readback(buyer.email)).userCount, 0);
    const openapi = await (await fetch(apiUrl.replace(/\/api$/, '') + '/docs-json')).json();
    assert.ok(openapi.paths?.['/api/auth/registration/resume/complete'] || openapi.paths?.['/auth/registration/resume/complete'], 'Live OpenAPI includes completion');
    assert.equal((await post(`${proofPath}/inspect`, { token })).status, 'READY');
    for (const changes of [{ email: 'foreign@example.invalid' }, { bin: '999999999999' }, { capability: 'SUPPLIER' }]) await post(`${proofPath}/complete`, { ...buyer, ...changes, token, password }, 401);
    const complete = { ...buyer, token, password };
    assert.deepEqual(await Promise.all([post(`${proofPath}/complete`, complete), post(`${proofPath}/complete`, complete)]), [{ status: 'COMPLETED', next: 'LOGIN' }, { status: 'COMPLETED', next: 'LOGIN' }]);
    assert.equal((await post(`${proofPath}/inspect`, { token })).status, 'COMPLETED');
    assert.deepEqual(await fixture.readback(buyer.email), { intentCount: 1, userCount: 1, verified: true, status: 'CLAIMED', organizationCount: 1, membershipCount: 1, auditCount: 1, outboxCount: 1 });
    const login = await post('/auth/login', { email: buyer.email, password }, 201);
    await post(`/auth/sessions/${login.sessionId}/revoke`, { reason: 'audit_resume_finished' }, 201, { authorization: `Bearer ${login.accessToken}` });

    const supplier = await pending(2, 'SUPPLIER');
    await post('/auth/register', { email: supplier.email, displayName: 'Existing audit owner', password }, 201);
    const supplierToken = await link(supplier);
    assert.equal((await post(`${proofPath}/inspect`, { token: supplierToken })).passwordMode, 'EXISTING');
    await post(`${proofPath}/complete`, { ...supplier, token: supplierToken, password: password + 'wrong' }, 401);
    assert.equal((await fixture.readback(supplier.email)).organizationCount, 0);
    await post(`${proofPath}/complete`, { ...supplier, token: supplierToken, password });
    const supplierState = await fixture.readback(supplier.email); assert.equal(supplierState.userCount, 1); assert.equal(supplierState.organizationCount, 1);
    const organization = await db.organization.findUnique({ where: { bin: supplier.bin }, include: { capabilities: true } });
    assert.deepEqual(organization.capabilities.map(item => item.capability), ['SUPPLIER']);
    assert.equal(await db.marketplaceAgreement.count({ where: { supplierOrganizationId: organization.id } }), 0, 'Resume must not fabricate publication agreement');

    const expired = await pending(3); const expiredToken = await link(expired);
    await db.idempotencyRecord.update({ where: { scope_key: { scope: 'registration-resume', key: hash(expiredToken) } }, data: { expiresAt: new Date(0) } });
    await post(`${proofPath}/complete`, { ...expired, token: expiredToken, password }, 401);
    assert.equal((await fixture.readback(expired.email)).userCount, 0);

    const rollback = await pending(4); const rollbackToken = await link(rollback);
    trigger = `resume_reject_${process.pid}`;
    // Synthetic fault scoped to one owned registration, after account creation.
    await db.$executeRawUnsafe(`CREATE FUNCTION "${trigger}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."bin" = '${rollback.bin}' THEN RAISE EXCEPTION 'audit_resume_transaction_fault'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "Organization" FOR EACH ROW EXECUTE FUNCTION "${trigger}"()`);
    await post(`${proofPath}/complete`, { ...rollback, token: rollbackToken, password }, 500);
    assert.equal((await fixture.readback(rollback.email)).userCount, 0); assert.equal((await fixture.readback(rollback.email)).status, 'PENDING');
    assert.equal((await post(`${proofPath}/inspect`, { token: rollbackToken })).status, 'READY');
    await db.$executeRawUnsafe(`DROP TRIGGER "${trigger}" ON "Organization"`); await db.$executeRawUnsafe(`DROP FUNCTION "${trigger}"()`); trigger = undefined;
    await post(`${proofPath}/complete`, { ...rollback, token: rollbackToken, password });
    assert.equal((await fixture.readback(rollback.email)).organizationCount, 1);
    console.log(JSON.stringify({ status: 'PASS', runId, database: 'dentmarket_audit_20260914', scenarios: ['live-openapi','pending-without-account','foreign-email-bin-capability-denied','concurrent-single-claim','consumed-receipt','normal-login-revoke','existing-password-not-reset','supplier-authority-no-agreement','expired-proof-denied','transaction-rollback-proof-retry'], fixtures: 'Retained in isolated audit DB for readback; no working/demo data changed' }, null, 2));
  } finally {
    if (trigger) { await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "Organization"`); await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${trigger}"()`); }
    await fixture.stop();
  }
}
