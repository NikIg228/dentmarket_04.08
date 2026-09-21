// Audit/test harness only. Never imported by application runtime.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as portProbe } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

export const root = path.resolve(import.meta.dirname, '../..');
export function auditEnvironment() {
  const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;
  if (!databaseUrl) throw Error('Explicit approved POSTGRES_TEST_DATABASE_URL is required');
  const target = new URL(databaseUrl);
  if (target.hostname !== '127.0.0.1' || target.port !== '5432' || target.pathname !== '/dentmarket_audit_20260914') throw Error('Only the explicitly approved isolated audit DB is supported');
  const env = {};
  for (const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','ComSpec','COMSPEC','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)','PATHEXT']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, { DATABASE_URL: databaseUrl, POSTGRES_TEST_DATABASE_URL: databaseUrl, NODE_ENV: 'test', DEPLOYMENT_PROFILE: 'pilot', NEXT_PUBLIC_DEPLOYMENT_PROFILE: 'pilot', AUTH_MODE: 'jwt', JWT_SECRET: randomBytes(48).toString('hex'), APP_SECURITY_ENCRYPTION_KEY: randomBytes(32).toString('base64'), INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString('base64'), MEDIA_SIGNING_SECRET: randomBytes(48).toString('hex'), METRICS_BEARER_TOKEN: randomBytes(48).toString('hex'), PROCESS_ROLE: 'api', BACKGROUND_QUEUE_ENABLED: 'false', OBJECT_STORAGE_DRIVER: 'local', SOCIAL_AUTH_ENABLED: 'false', PUBLIC_DEMO_MODE: 'false', PAYMENT_PROVIDER_MODE: 'mock', LOG_LEVEL: 'warn', NEXT_TELEMETRY_DISABLED: '1' });
  return env;
}
async function free(port) {
  const server = portProbe();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const chosen = server.address().port;
  await new Promise(resolve => server.close(resolve)); return chosen;
}
export async function startResumeFixture({ web = false } = {}) {
  const env = auditEnvironment();
  const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  const [identity] = await db.$queryRaw`SELECT current_database() AS database`;
  if (identity.database !== 'dentmarket_audit_20260914') throw Error('Unexpected DB identity');
  const runId = `audit_resume_${Date.now()}_${process.pid}`;
  env.LOCAL_STORAGE_PATH = path.join(root, '.tmp', 'registration-resume', runId);
  const mails = new Map();
  const children = [];
  const mailSecret = randomBytes(32).toString('hex');
  const mail = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/send' || req.headers.authorization !== `Bearer ${mailSecret}`) { res.writeHead(403).end(); return; }
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 32_768) { res.writeHead(413).end(); return; } chunks.push(chunk); }
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString());
      if (!String(payload.to).startsWith(runId) || !String(payload.to).endsWith('@example.invalid')) { res.writeHead(403).end(); return; }
      const match = String(payload.text).match(/http:\/\/127\.0\.0\.1:\d+\/register\/resume#token=[A-Za-z0-9_-]{64}/);
      if (match) mails.set(payload.to, match[0]);
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    } catch { res.writeHead(400).end(); }
  });
  await new Promise(resolve => mail.listen(0, '127.0.0.1', resolve));
  env.EMAIL_PROVIDER_URL = `http://127.0.0.1:${mail.address().port}/send`; env.EMAIL_PROVIDER_TOKEN = mailSecret;
  const port = await free(web ? 4112 : 0);
  if (web) await free(3103);
  env.API_HOST = '127.0.0.1'; env.API_PORT = String(port); env.AUTH_EMAIL_BASE_URL = 'http://127.0.0.1:3103'; env.CORS_ORIGINS = 'http://127.0.0.1:3103';
  const apiUrl = `http://127.0.0.1:${port}/api`;
  function launch(args, cwd, extra = {}) {
    const child = spawn(process.execPath, args, { cwd, env: { ...env, ...extra }, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    // No raw application output, mail, tokens or credentials in artifacts.
    child.stdout.resume(); child.stderr.resume(); children.push(child); return child;
  }
  async function stop() {
    for (const child of children.reverse()) if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await Promise.race([exited, delay(5_000)]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    mail.closeAllConnections(); await new Promise(resolve => mail.close(resolve)); mails.clear(); await db.$disconnect();
  }
  async function ready(url, child) {
    const deadline = Date.now() + 20_000;
    let status = 'unreachable';
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw Error(`Owned application exited: ${child.exitCode}`);
      try { const response = await fetch(url, { signal: AbortSignal.timeout(2_000) }); status = String(response.status); if (response.ok) return; } catch {}
      await delay(400);
    }
    throw Error(`Owned ${new URL(url).port === '3103' ? 'landing' : 'API'} readiness timeout (20s; status ${status})`);
  }
  try {
    const api = launch([path.join(root, 'apps/api/dist/src/main.js')], path.join(root, 'apps/api'));
    await ready(`${apiUrl}/health/ready`, api);
    if (web) {
      const landing = launch([path.join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3103'], path.join(root, 'apps/landing-web'), { NODE_ENV: 'production' });
      await ready('http://127.0.0.1:3103/register/resume', landing);
    }
    async function readback(email) {
      if (!email.startsWith(runId) || !email.endsWith('@example.invalid')) throw Error('Foreign fixture read denied');
      const intent = await db.registrationIntent.findFirst({ where: { email }, select: { id: true, bin: true, status: true, organizationId: true } });
      const user = await db.user.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true } });
      return { intentCount: await db.registrationIntent.count({ where: { email } }), userCount: user ? 1 : 0, verified: Boolean(user?.emailVerifiedAt), status: intent?.status,
        organizationCount: intent ? await db.organization.count({ where: { bin: intent.bin } }) : 0,
        membershipCount: user ? await db.organizationMembership.count({ where: { userId: user.id } }) : 0,
        auditCount: intent?.organizationId ? await db.auditLog.count({ where: { organizationId: intent.organizationId, action: 'onboarding.registration.completed' } }) : 0,
        outboxCount: intent?.organizationId ? await db.outboxEvent.count({ where: { aggregateId: intent.organizationId, eventType: 'OrganizationSelfRegistered' } }) : 0 };
    }
    return { db, runId, apiUrl, mails, stop, readback };
  } catch (error) { await stop(); throw error; }
}
