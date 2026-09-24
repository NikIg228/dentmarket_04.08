import assert from 'node:assert/strict';
import test from 'node:test';
import { completeFixtureOrganization } from './organization-profile-fixture.mjs';

test('organization fixture supports the dedicated CI database variable and rejects a different target', async () => {
  const keys = ['DATABASE_URL', 'POSTGRES_TEST_DATABASE_URL', 'GITHUB_ACTIONS'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let reads = 0;
  const db = name => ({
    $queryRaw: async () => [{ name }],
    organizationProfile: { findUnique: async () => { reads++; return { organizationId: 'synthetic' }; } },
  });
  try {
    delete process.env.DATABASE_URL;
    process.env.GITHUB_ACTIONS = 'true';
    process.env.POSTGRES_TEST_DATABASE_URL = 'postgresql://localhost:5432/marketplace?schema=public';
    await completeFixtureOrganization(db('marketplace'), 'synthetic');
    assert.equal(reads, 1);
    await assert.rejects(completeFixtureOrganization(db('different_database'), 'synthetic'));
    assert.equal(reads, 1, 'The connected identity must be checked before profile access');
    process.env.POSTGRES_TEST_DATABASE_URL = 'postgresql://localhost:5432/unapproved_database';
    await assert.rejects(completeFixtureOrganization(db('unapproved_database'), 'synthetic'));
    assert.equal(reads, 1, 'An unapproved database must not be read or written');
  } finally {
    for (const key of keys) if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
  }
});
