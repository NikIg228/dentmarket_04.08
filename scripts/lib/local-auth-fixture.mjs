// Test harness only: approved isolated DB, owned processes, actual local mail files.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { auditEnvironment, root } from './registration-resume-fixture.mjs';

export async function startLocalAuthFixture({ web = false, operator = true, webApps = ['landing', 'admin'], publicCatalog = false } = {}) {
  const webPorts = { landing: 3103, admin: 3100, buyer: 3101, supplier: 3102 };
  assert.ok(webApps.every(name => Object.hasOwn(webPorts, name)) && new Set(webApps).size === webApps.length, 'Known distinct owned applications only');
  const env = auditEnvironment();
  const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  const [identity] = await db.$queryRaw`SELECT current_database() AS database`;
  assert.equal(identity.database, 'dentmarket_audit_20260914');
  if (publicCatalog) {
    // Match the existing pilot verification setup, without changing DB rights/data.
    const buyer = await db.organization.findUniqueOrThrow({ where: { bin: '970000000001' }, include: { capabilities: true } });
    assert.ok(buyer.capabilities.some(({ capability }) => capability === 'BUYER'), 'Pilot public catalog context must be a buyer');
    env.PUBLIC_CATALOG_ORGANIZATION_ID = buyer.id;
  }
  const runId = `audit_local_auth_${Date.now()}_${process.pid}`;
  const runtime = path.resolve(root, '.tmp/local-auth', runId);
  const directory = path.join(runtime, '.tmp/auth-mail');
  await mkdir(runtime, { recursive: true });
  const children = [];
  let startupOutput = '';
  const issuedUsers = [];
  let cleaned = false;
  async function free(port) {
    const probe = createServer();
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
    const chosen = probe.address().port;
    await new Promise(resolve => probe.close(resolve)); return chosen;
  }
  const port = await free(web ? 4112 : 0);
  if (web) for (const name of webApps) await free(webPorts[name]);
  Object.assign(env, { API_HOST: '127.0.0.1', API_PORT: String(port), AUTH_LOCAL_MAIL_ENABLED: 'true', LOCAL_OPERATOR_PASSWORD_LOGIN_ENABLED: String(operator), JWT_REQUIRE_MFA: String(operator), AUTH_EMAIL_BASE_URL: 'http://127.0.0.1:3103', CORS_ORIGINS: webApps.map(name => `http://127.0.0.1:${webPorts[name]}`).join(','), LOCAL_STORAGE_PATH: path.join(runtime, 'storage') });
  const apiUrl = `http://127.0.0.1:${port}/api`;
  // One bounded setup budget for API + selected web apps, not a fresh timeout
  // per process. This is readiness orchestration, never an HTTP/business SLA.
  const startupDeadline = Date.now() + 60_000;
  function launch(args, cwd, extra = {}) {
    const child = spawn(process.execPath, args, { cwd, env: { ...env, ...extra }, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    // Keep only bounded startup diagnostics in memory; mail/account operations start later.
    const collect = data => { startupOutput = (startupOutput + data.toString()).slice(-12000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect); children.push(child); return child;
  }
  async function ready(url, child) {
    let status = 'unreachable';
    while (Date.now() < startupDeadline) {
      if (child.exitCode !== null) throw Error(`Owned runtime exited: ${child.exitCode}`);
      try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); status = String(response.status); if (response.ok) { startupOutput = ''; return; } } catch {}
      await delay(300);
    }
    const diagnostic = startupOutput.replace(/postgres(?:ql)?:\/\/[^\s"']+/g, '[AUDIT_DB]').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[JWT]').replace(/([#?&](?:token|code)=)[^\s"']+/g, '$1[REDACTED]');
    const failure = { phase: 'startup-only', port: new URL(url).port, status, setupBudgetMs: 60_000, diagnostic };
    if (process.send) process.send({ type: 'startup-diagnostics', value: failure });
    else console.error(JSON.stringify(failure));
    throw Error('Owned local-auth readiness timeout');
  }
  async function mail(email, pathname) {
    assert.ok(email.startsWith(runId) && email.endsWith('@example.invalid'), 'Only owned synthetic addresses');
    const files = await readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    const found = [];
    for (const file of files.filter(name => /^[a-f0-9-]{36}\.json$/.test(name))) {
      const payload = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
      if (payload.to !== email) continue;
      assert.equal(payload.delivery, 'LOCAL_FILE'); assert.equal(payload.externalDelivery, false);
      const link = String(payload.text).match(/http:\/\/127\.0\.0\.1:3103\/[^\s]+/)?.[0];
      if (link && new URL(link).pathname === pathname) found.push({ link, createdAt: payload.createdAt });
    }
    return found.sort((a,b) => a.createdAt.localeCompare(b.createdAt)).at(-1)?.link;
  }
  async function request(route, body, status = 201, accessToken) {
    const response = await fetch(apiUrl + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(response.status, status, `${route}: expected ${status}, got ${response.status}; body omitted`);
    return response.json();
  }
  async function account(index, capability = 'MARKETPLACE_OPERATOR') {
    const email = `${runId}-${index}@example.invalid`, password = randomBytes(24).toString('base64url');
    const registration = await request('/auth/register', { email, displayName: 'Synthetic audit operator', password });
    assert.equal(registration.delivery, 'LOCAL_FILE');
    const verification = await mail(email, '/verify-email'); assert.ok(verification, 'Actual delivered verification required');
    const token = new URL(verification).searchParams.get('token');
    await request('/auth/email/verify', { token });
    const user = await db.user.findUniqueOrThrow({ where: { email } }); issuedUsers.push(user.id);
    assert.ok(user.emailVerifiedAt);
    const organization = await db.organization.create({ data: { bin: `95${String(Date.now()).slice(-8)}${String(index).padStart(2,'0')}`, legalName: runId, displayName: runId, capabilities: { create: { capability } } } });
    const permissions = capability === 'BUYER' ? ['organization.view','order.create','document.view','notification.view','catalog.product.view']
      : capability === 'SUPPLIER' ? ['organization.view','catalog.product.view','inventory.view','order.confirm','integration.view','import.manage','compliance.view','document.view','notification.view']
      : ['organization.view','security.event.view'];
    if (capability === 'SUPPLIER') await db.supplierProfile.create({ data: { organizationId: organization.id } });
    const role = await db.role.create({ data: { organizationId: organization.id, code: 'audit_local_auth', name: 'Audit workspace user', permissions: { create: permissions.map(code => ({ permission: { connect: { code } } })) } } });
    await db.organizationMembership.create({ data: { userId: user.id, organizationId: organization.id, status: 'ACTIVE', acceptedAt: new Date(), isPrimary: true, roles: { create: { roleId: role.id } } } });
    return { email, password, userId: user.id, organizationId: organization.id, verificationToken: token };
  }
  async function stop() {
    if (cleaned) return; cleaned = true;
    for (const child of children.reverse()) if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await Promise.race([exited, delay(3000)]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    // Revoke only this run's synthetic users. Retain DB fixtures for safe readback.
    const users = await db.user.findMany({ where: { email: { startsWith: runId, endsWith: '@example.invalid' } }, select: { id: true } });
    await db.authSession.updateMany({ where: { userId: { in: users.map(user => user.id) }, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: 'audit_local_auth_finished' } });
    for (const file of await readdir(directory).catch(() => [])) {
      const target = path.resolve(directory, file);
      assert.ok(target.startsWith(directory + path.sep) && /^[a-f0-9-]{36}\.json$/.test(file), 'Exact owned mail target');
      const payload = JSON.parse(await readFile(target, 'utf8'));
      assert.ok(payload.to.startsWith(runId) && payload.to.endsWith('@example.invalid'), 'Never remove foreign mail');
      await unlink(target);
    }
    await db.$disconnect();
  }
  try {
    const api = launch([path.join(root,'apps/api/dist/src/main.js')], runtime);
    await ready(apiUrl + '/health/ready', api);
    if (web) {
      for (const name of webApps) {
        const port = webPorts[name];
        const child = launch([path.join(root,'node_modules/next/dist/bin/next'), 'start', '--hostname','127.0.0.1','--port',String(port)], path.join(root,`apps/${name}-web`), { NODE_ENV: 'production' });
        await ready(`http://127.0.0.1:${port}${name === 'landing' || name === 'admin' ? '/login' : '/'}`, child);
      }
    }
    return { db, apiUrl, runId, runtime, mail, request, account, stop };
  } catch (error) { await stop(); throw error; }
}
