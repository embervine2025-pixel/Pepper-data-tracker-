import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';

let server;
let baseUrl;

export async function startServer() {
  if (server) return baseUrl;
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}

export async function stopServer() {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
  await pool.end();
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { status: res.status, body: json };
}

let handleCounter = 0;

/** Registers a breeder and returns their token plus profile. */
export async function createBreeder(overrides = {}) {
  handleCounter += 1;
  const handle = overrides.handle ?? `breeder${handleCounter}${Date.now().toString(36).slice(-4)}`;
  const res = await api('/api/auth/register', {
    method: 'POST',
    body: {
      email: overrides.email ?? `${handle}@example.test`,
      handle,
      password: overrides.password ?? 'a-long-enough-password',
      displayName: overrides.displayName ?? `Breeder ${handleCounter}`,
      ...overrides.extra,
    },
  });
  if (res.status !== 201) {
    throw new Error(`registration failed: ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token, user: res.body.user };
}

let accessionCounter = 0;

export async function createPlant(token, overrides = {}) {
  accessionCounter += 1;
  const res = await api('/api/plants', {
    method: 'POST',
    token,
    body: {
      accessionCode: `ACC-${accessionCounter}`,
      name: `Plant ${accessionCounter}`,
      species: 'chinense',
      ...overrides,
    },
  });
  if (res.status !== 201) {
    throw new Error(`plant creation failed: ${JSON.stringify(res.body)}`);
  }
  return res.body.plant;
}
