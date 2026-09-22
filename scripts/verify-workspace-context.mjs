import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { startLocalAuthFixture } from './lib/local-auth-fixture.mjs';
const { workspaceContextSchema, errorResponseSchema } = createRequire(import.meta.url)('../packages/schemas/dist/index.js');
const serve = process.argv.includes('--serve');
const fixture = await startLocalAuthFixture({ web: serve, operator: false, webApps: ['landing', 'buyer', 'supplier'] });
const { db, apiUrl, runId, request, account } = fixture;
async function ownedUser(email) {
  assert.ok(email.startsWith(runId) && email.endsWith('@example.invalid'));
  return db.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
}
async function readback(email) {
  const user = await ownedUser(email);
  return { sessions: await db.authSession.count({ where: { userId: user.id } }), consumedHandoffs: await db.idempotencyRecord.count({ where: { scope: 'session-handoff', responseCode: 410, responseBody: { path: ['userId'], equals: user.id } } }) };
}
if (serve) {
  process.on('message', async message => {
    try {
      let value;
      if (message.type === 'account') { assert.ok(['BUYER','SUPPLIER'].includes(message.capability)); const result = await account(message.index, message.capability); value = { email: result.email, password: result.password, organizationId: result.organizationId }; }
      else if (message.type === 'readback') value = await readback(message.email);
      else if (message.type === 'block-membership') { const user = await ownedUser(message.email); await db.organizationMembership.updateMany({ where: { userId: user.id }, data: { status: 'BLOCKED' } }); value = true; }
      else throw Error('Unsupported private fixture operation');
      process.send?.({ id: message.id, value });
    } catch { process.send?.({ id: message.id, error: 'Owned fixture operation failed' }); }
  });
  process.once('disconnect', async () => { await fixture.stop(); process.exit(0); });
  process.send?.({ type: 'ready', apiUrl, runId });
} else {
  try {
    const buyer = await account(31, 'BUYER'), supplier = await account(32, 'SUPPLIER');
    const operator = await account(33, 'MARKETPLACE_OPERATOR');
    const login = entry => request('/auth/login', { email: entry.email, password: entry.password });
    const buyerSession = await login(buyer), supplierSession = await login(supplier), operatorSession = await login(operator);
    // Own workspace metadata must not require the operator directory permission.
    await db.rolePermission.deleteMany({ where: { role: { organizationId: buyer.organizationId }, permission: { code: 'organization.view' } } });
    const before = await readback(buyer.email);
    async function context(session, expectedStatus = 200, extraHeaders = {}) {
      const response = await fetch(`${apiUrl}/auth/workspace-context`, { headers: { ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}), ...extraHeaders } });
      assert.equal(response.status, expectedStatus, 'Workspace context status; response body omitted');
      if (response.ok) { assert.equal(response.headers.get('cache-control'), 'no-store'); return workspaceContextSchema.parse(await response.json()); }
      // JWT middleware can reject before the HTTP logger assigns requestId.
      // Validate the published envelope (requestId is optional), not a stricter invented contract.
      const error = errorResponseSchema.parse(await response.json());
      assert.equal(error.statusCode, expectedStatus); assert.equal(error.path, '/api/auth/workspace-context');
      const requestId = response.headers.get('x-request-id'); if (requestId) assert.equal(error.requestId, requestId);
    }
    assert.deepEqual(await context(buyerSession), { organizationId: buyer.organizationId, organizationDisplayName: runId, capabilities: ['BUYER'] });
    assert.deepEqual(await context(supplierSession), { organizationId: supplier.organizationId, organizationDisplayName: runId, capabilities: ['SUPPLIER'] });
    assert.deepEqual((await context(operatorSession)).capabilities, []);
    assert.deepEqual(await readback(buyer.email), before, 'Context read creates neither session nor handoff');
    await context(null, 401, { 'x-user-id': buyer.userId, 'x-organization-id': buyer.organizationId });
    await context(buyerSession, 401, { 'x-user-id': supplier.userId, 'x-organization-id': supplier.organizationId });
    assert.equal((await context(buyerSession, 200, { 'x-user-id': supplier.userId })).organizationId, buyer.organizationId);
    await request('/organizations', undefined, 403, buyerSession.accessToken);
    await request('/auth/handoff', { capability: 'SUPPLIER' }, 401, buyerSession.accessToken);
    for (const [entry, session, capability] of [[buyer,buyerSession,'BUYER'],[supplier,supplierSession,'SUPPLIER']]) {
      const handoff = await request('/auth/handoff', { capability }, 201, session.accessToken);
      const exchangeResponse = await fetch(apiUrl + '/auth/handoff/exchange', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handoffCode: handoff.handoffCode }) });
      assert.equal(exchangeResponse.status, 201);
      const exchanged = await exchangeResponse.json();
      assert.equal(exchanged.organizationId, entry.organizationId); assert.equal(exchanged.capability, capability);
      assert.notEqual(exchanged.sessionId, session.sessionId); assert.ok(exchanged.accessToken); assert.equal(exchanged.refreshToken, undefined);
      await request('/auth/handoff/exchange', { handoffCode: handoff.handoffCode }, 401);
      const record = await db.idempotencyRecord.findUniqueOrThrow({ where: { scope_key: { scope: 'session-handoff', key: createHash('sha256').update(handoff.handoffCode).digest('hex') } } });
      assert.equal(record.responseCode, 410);
      const cookieName = 'mp_refresh_' + capability.toLowerCase();
      assert.ok(exchangeResponse.headers.getSetCookie().some(value => value.startsWith(cookieName + '=') && value.includes('HttpOnly')), 'Destination gets a role-specific HttpOnly refresh cookie');
      const cookie = exchangeResponse.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      assert.ok(exchangeResponse.headers.getSetCookie().some(value => value.startsWith('mp_csrf_' + capability.toLowerCase() + '=') && value.includes('Path=/;')));
      const refresh = (csrfToken, expectedSessionId, sentCookie = cookie) => fetch(apiUrl + '/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json', cookie: sentCookie, ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) }, body: JSON.stringify({ workspace: capability, expectedSessionId }) });
      assert.equal((await refresh(undefined, exchanged.sessionId)).status, 401, 'CSRF remains required');
      assert.equal((await refresh(exchanged.csrfToken, session.sessionId)).status, 401, 'Another login cannot rotate this session');
      const rotatedResponse = await refresh(exchanged.csrfToken, exchanged.sessionId);
      assert.equal(rotatedResponse.status, 201);
      const rotated = await rotatedResponse.json();
      assert.equal(rotated.sessionId, exchanged.sessionId); assert.equal(rotated.activeOrganizationId, entry.organizationId);
      await context(rotated, 200);
      await request('/auth/sessions/' + exchanged.sessionId + '/revoke', { reason: 'audit_workspace_complete' }, 201, rotated.accessToken);
      await context(rotated, 401);
      assert.equal((await refresh(exchanged.csrfToken, exchanged.sessionId)).status, 401, 'Old cookie is consumed');
      const rotatedCookie = rotatedResponse.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      assert.equal((await refresh(rotated.csrfToken, exchanged.sessionId, rotatedCookie)).status, 401, 'Revoked refresh is denied');
      await context(session, 200); // The issuer's separate login is not this cabinet's session.
    }
    const membership = await db.organizationMembership.findUniqueOrThrow({ where: { userId_organizationId: { userId: buyer.userId, organizationId: buyer.organizationId } } });
    await db.organizationMembership.update({ where: { id: membership.id }, data: { status: 'BLOCKED' } });
    await context(buyerSession, 403);
    await request('/auth/handoff', { capability: 'BUYER' }, 401, buyerSession.accessToken);
    await db.organizationMembership.update({ where: { id: membership.id }, data: { status: 'ACTIVE' } });
    await db.organization.update({ where: { id: buyer.organizationId }, data: { status: 'INACTIVE' } });
    await context(buyerSession, 403);
    await db.organization.update({ where: { id: buyer.organizationId }, data: { status: 'ACTIVE' } });
    await db.user.update({ where: { id: buyer.userId }, data: { status: 'INACTIVE' } });
    await context(buyerSession, 403);
    await db.user.update({ where: { id: buyer.userId }, data: { status: 'ACTIVE' } });
    await request(`/auth/sessions/${buyerSession.sessionId}/revoke`, { reason: 'audit_workspace_complete' }, 201, buyerSession.accessToken);
    await context(buyerSession, 401);
    const openapi = await (await fetch(apiUrl.replace(/\/api$/, '') + '/docs-json')).json();
    assert.ok(openapi.paths['/api/auth/workspace-context']?.get);
    assert.deepEqual(openapi.paths['/api/auth/workspace-context'].get.security, [{ 'access-token': [] }]);
    assert.ok(openapi.components.schemas.WorkspaceContextResponse);
    console.log(JSON.stringify({ status: 'PASS', database: 'dentmarket_audit_20260914', runId, scenarios: ['buyer-current-context','supplier-current-context','operator-no-purchasing-workspace','no-directory-permission-needed','read-no-session-handoff-writes','anonymous-spoof-denied','foreign-tenant-header-denied','actor-header-not-authority','operator-directory-still-denied','wrong-capability-denied','buyer-handoff-consumed-once','supplier-handoff-consumed-once','blocked-membership-context-handoff-denied','inactive-organization-denied','inactive-user-denied','revoked-session-denied','live-openapi'], cleanup: 'Owned fixture only; sessions revoked and own mail removed; synthetic DB rows retained' }, null, 2));
  } finally { await fixture.stop(); }
}
