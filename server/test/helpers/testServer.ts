import { createApp } from '../../src/app.js';
import { switchDatabase } from '../../src/db/database.js';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface TestServerInstance {
  baseUrl: string;
  close: () => Promise<void>;
  request: (path: string, options?: RequestInit) => Promise<Response>;
}

/**
 * Spawns an isolated HTTP server on an ephemeral port (port 0) for testing.
 * Uses native fetch for Zero-Dependency, high-speed API integration tests.
 */
export async function startTestServer(): Promise<TestServerInstance> {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-chars-for-safety-2026';
  }
  if (process.env.DB_PATH) {
    switchDatabase(process.env.DB_PATH);
  }
  const app = createApp();

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const request = async (path: string, options?: RequestInit): Promise<Response> => {
    const url = `${baseUrl}${path.startsWith('/') ? path : '/' + path}`;
    return fetch(url, options);
  };

  const close = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return {
    baseUrl,
    close,
    request
  };
}
