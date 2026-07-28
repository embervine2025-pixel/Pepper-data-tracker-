import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

/**
 * Fetches `path` and re-fetches when it changes. Returns a `reload` so views
 * can refresh after a mutation without remounting.
 *
 * Pass `path = null` to skip the request entirely (for dependent loads).
 */
export function useApi(path, { skip = false } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!skip && path !== null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (skip || path === null) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);

    api
      .get(path, { signal: controller.signal })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        // An aborted request is a superseded one, not a failure to report.
        if (err.name === 'AbortError' || !active) return;
        setError(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [path, skip, reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  return { data, error, loading, reload, setData };
}

/**
 * Wraps a mutating call with pending/error state, so forms don't each
 * reimplement it. `run` resolves with the result and re-throws nothing.
 */
export function useMutation(fn) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(
    async (...args) => {
      setPending(true);
      setError(null);
      try {
        return { ok: true, data: await fn(...args) };
      } catch (err) {
        setError(err);
        return { ok: false, error: err };
      } finally {
        setPending(false);
      }
    },
    [fn],
  );

  return { run, pending, error, setError };
}
