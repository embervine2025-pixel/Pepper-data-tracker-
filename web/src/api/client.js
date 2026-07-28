const TOKEN_KEY = 'pepper.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details ?? [];
  }

  /** Field name -> message, for rendering errors next to the offending input. */
  get fieldErrors() {
    return Object.fromEntries(this.details.map((d) => [d.field, d.message]));
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const token = getToken();

  const res = await fetch(`/api${path}`, {
    method,
    signal,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return null;

  const text = await res.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(res.status, 'The server returned an unreadable response');
    }
  }

  if (!res.ok) {
    // An expired or revoked token should drop the session rather than leave
    // the app rendering half-loaded views.
    if (res.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event('pepper:signed-out'));
    }
    throw new ApiError(
      res.status,
      payload?.error?.message ?? `Request failed (${res.status})`,
      payload?.error?.details,
    );
  }

  return payload;
}

export const api = {
  get: (path, opts) => request(path, { ...opts }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  delete: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
};

/** Builds a query string, dropping empty values so the URL stays readable. */
export function qs(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}
