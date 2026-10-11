import { useEffect, useState } from 'react';

import { api } from '@/api/client';

/**
 * Asks the server whether a single-use link is still valid BEFORE the person types a new
 * password — so an expired link is explained up front, not after filling the form.
 */
export function useLinkCheck(checkPath: string, token: string | undefined) {
  const [state, setState] = useState<'checking' | 'valid' | 'invalid'>(token ? 'checking' : 'invalid');

  useEffect(() => {
    if (!token) return;
    api<{ valid: boolean }>(checkPath, { body: { token } })
      .then((r) => setState(r.valid ? 'valid' : 'invalid'))
      .catch(() => setState('invalid'));
  }, [checkPath, token]);

  return state;
}
