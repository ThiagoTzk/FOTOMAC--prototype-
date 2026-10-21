import { useEffect, useState } from 'react';

import { api } from '@/api/client';

/**
 * Asks the server whether a single-use link is still valid BEFORE the person types a new
 * password — so an expired link is explained up front, not after filling the form.
 */
export function useLinkCheck(checkPath: string, token: string | undefined) {
  return useLinkInfo<{ valid: boolean }>(checkPath, token).state;
}

/** Same check, also returning what the server said about the link (e.g. the hired photographer
 *  must identify themselves on the first access — RF031). */
export function useLinkInfo<T extends { valid: boolean }>(checkPath: string, token: string | undefined) {
  const [state, setState] = useState<'checking' | 'valid' | 'invalid'>(token ? 'checking' : 'invalid');
  const [info, setInfo] = useState<T | null>(null);

  useEffect(() => {
    if (!token) return;
    api<T>(checkPath, { body: { token } })
      .then((r) => { setInfo(r); setState(r.valid ? 'valid' : 'invalid'); })
      .catch(() => setState('invalid'));
  }, [checkPath, token]);

  return { state, info };
}
