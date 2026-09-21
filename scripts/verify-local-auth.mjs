import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
import { startLocalAuthFixture } from './lib/local-auth-fixture.mjs';
const { generateTotp } = createRequire(import.meta.url)('../apps/api/dist/src/platform/security/totp.js');
const serve = process.argv.includes('--serve');
const fixture = await startLocalAuthFixture({ web: serve });
const { db, apiUrl, runId, request, account, mail } = fixture;
if (serve) {
  process.on('message', async message => {
    try {
      let value;
      if (message.type === 'account') value = await account(message.index, message.capability);
      else if (message.type === 'mail') value = await mail(message.email, message.pathname);
      else if (message.type === 'readback') {
        assert.ok(message.email.startsWith(runId) && message.email.endsWith('@example.invalid'));
        const user = await db.user.findUnique({ where: { email: message.email }, select: { id: true, emailVerifiedAt: true } });
        value = { userCount: user ? 1 : 0, verified: Boolean(user?.emailVerifiedAt) };
      } else throw Error('Unsupported fixture request');
      process.send?.({ id: message.id, value });
    } catch { process.send?.({ id: message.id, error: 'Owned fixture request failed' }); }
  });
  process.once('disconnect', async () => { await fixture.stop(); process.exit(0); });
  process.send?.({ type: 'ready', apiUrl, runId });
} else {
  try {
    assert.deepEqual(await request('/auth/client-options', undefined, 200), { localOperatorPasswordEnabled: true, emailDelivery: 'LOCAL_FILE' });
    const operator = await account(1), tenant = await account(2, 'BUYER');
    const openapi = await (await fetch(apiUrl.replace(/\/api$/, '') + '/docs-json')).json();
    assert.ok(Object.keys(openapi.paths).some(p => p.endsWith('/auth/local-operator/login')));
    await request('/auth/email/verify', { token: operator.verificationToken }, 401);
    await request('/auth/local-operator/login', { email: tenant.email, password: tenant.password }, 401);
    await request('/auth/local-operator/login', { email: operator.email, password: operator.password + 'wrong' }, 401);
    const login = await request('/auth/local-operator/login', { email: operator.email, password: operator.password });
    assert.equal(login.activeOrganizationId, operator.organizationId);
    assert.equal(login.refreshToken, undefined);
    await request('/organizations', undefined, 401);
    await request('/organizations', undefined, 401, login.accessToken);
    const enrollment = await request('/identity/mfa/totp/enroll', {}, 201, login.accessToken);
    const elevated = await request('/identity/mfa/totp/verify', { code: generateTotp(enrollment.secret) }, 201, login.accessToken);
    assert.ok(elevated.authenticationMethods.includes('totp'));
    const visibleOrganizations = await request('/organizations', undefined, 200, elevated.accessToken);
    assert.ok(visibleOrganizations.some(item => item.id === operator.organizationId && item.capabilities.some(entry => entry.capability === 'MARKETPLACE_OPERATOR')));
    const relogin = await request('/auth/local-operator/login', { email: operator.email, password: operator.password });
    assert.equal((await request('/identity/mfa', undefined, 200, relogin.accessToken)).enabled, true);
    const invalidCode = enrollment.recoveryCodes[0].replace(/[A-F0-9]/g, 'X');
    await request('/identity/mfa/challenge', { code: invalidCode }, 401, relogin.accessToken);
    await request('/identity/mfa/challenge', { code: generateTotp(enrollment.secret) }, 201, relogin.accessToken);
    const known = await request('/auth/password/forgot', { email: operator.email });
    const unknown = await request('/auth/password/forgot', { email: `${runId}-absent@example.invalid` }); assert.deepEqual(unknown, known);
    const link = await mail(operator.email, '/reset-password'); assert.ok(link);
    const token = new URL(link).searchParams.get('token'), password = randomBytes(24).toString('base64url');
    await request('/auth/password/reset', { token, password });
    await request('/auth/password/reset', { token, password }, 401);
    await request('/organizations', undefined, 401, elevated.accessToken);
    await request('/auth/local-operator/login', { email: operator.email, password: operator.password }, 401);
    await request('/auth/local-operator/login', { email: operator.email, password });
    const expired = await account(3);
    await request('/auth/password/forgot', { email: expired.email });
    const expiredToken = new URL(await mail(expired.email, '/reset-password')).searchParams.get('token');
    // Explicit time-state fixture, never obtaining a token from DB.
    await db.emailAuthToken.update({ where: { tokenHash: createHash('sha256').update(expiredToken).digest('hex') }, data: { expiresAt: new Date(0) } });
    await request('/auth/password/reset', { token: expiredToken, password }, 401);
    assert.equal(await db.authSession.count({ where: { userId: tenant.userId } }), 1, 'Only pre-membership verification session exists for denied tenant');
    console.log(JSON.stringify({ status: 'PASS', runId, database: 'dentmarket_audit_20260914', scenarios: ['local-file-verification','sequential-verification-replay-denied','live-openapi','tenant-password-denied-before-session','wrong-password-denied','anonymous-denied','primary-without-mfa-denied','totp-enrollment-and-elevation','mfa-relogin-challenge','bad-mfa-denied','nonenumerating-reset-ack','local-file-reset','reset-replay-expiry-denied','old-sessions-revoked','new-password-valid'], cleanup: 'Owned processes stopped, sessions revoked, actual secret-bearing test mails removed; synthetic DB records retained' }, null, 2));
  } finally { await fixture.stop(); }
}
