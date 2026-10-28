import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupIsolatedTestDb, teardownIsolatedTestDb, TestFixtureData } from './helpers/testDb.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { closeDatabase } from '../src/db/database.js';

describe('1. API Health Endpoint Smoke Test', () => {
  let fixtures: TestFixtureData;
  let server: TestServerInstance;

  before(async () => {
    fixtures = setupIsolatedTestDb();
    process.env.DB_PATH = fixtures.dbPath;
    process.env.NODE_ENV = 'test';
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
    closeDatabase();
    teardownIsolatedTestDb(fixtures.dbPath);
  });

  it('GET /api/health returns 200 OK with healthy status and metadata', async () => {
    const res = await server.request('/api/health');
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'healthy');
    assert.ok(body.system.includes('SkoolSys'));
    assert.ok(body.timestamp);
    assert.doesNotThrow(() => new Date(body.timestamp));
  });
});
