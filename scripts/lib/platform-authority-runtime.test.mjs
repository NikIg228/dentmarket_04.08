import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformAuthorityRuntimeEnvironment } from './platform-authority-runtime.mjs';

for (const profile of ['pilot', 'go_live']) test(`authority ${profile} preserves isolated database and blocks external runtime settings`, () => {
  const base = { DATABASE_URL: 'postgresql://synthetic@127.0.0.1/audit', LOCAL_STORAGE_PATH: '/audit/owned',
    OPENAI_API_KEY: 'not-to-be-inherited', EMAIL_PROVIDER_URL: 'https://example.invalid', EMAIL_PROVIDER_TOKEN: 'not-to-be-inherited',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://example.invalid', SENTRY_DSN: 'https://example.invalid', REDIS_URL: 'redis://example.invalid',
    NODE_ENV: 'production', PROCESS_ROLE: 'worker', BACKGROUND_QUEUE_ENABLED: 'true', PATH: '/test/bin' };
  const env = platformAuthorityRuntimeEnvironment(base, profile);
  assert.deepEqual({ profile: env.DEPLOYMENT_PROFILE, node: env.NODE_ENV, role: env.PROCESS_ROLE, queues: env.BACKGROUND_QUEUE_ENABLED }, { profile, node: 'test', role: 'api', queues: 'false' });
  assert.equal(env.DATABASE_URL, base.DATABASE_URL); assert.equal(env.LOCAL_STORAGE_PATH, base.LOCAL_STORAGE_PATH); assert.equal(env.PATH, base.PATH);
  for (const key of ['OPENAI_API_KEY', 'EMAIL_PROVIDER_URL', 'EMAIL_PROVIDER_TOKEN', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'SENTRY_DSN', 'REDIS_URL']) assert.equal(env[key], undefined);
  assert.equal(base.NODE_ENV, 'production');
});
test('unknown profiles never silently change the test scope', () => {
  assert.throws(() => platformAuthorityRuntimeEnvironment({}, 'unknown'));
});
