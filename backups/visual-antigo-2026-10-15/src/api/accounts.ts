/** Administrator: accounts (RF001, RF002 note 7, RF003). The server re-checks the role. */
import { api } from './client';

export type Role = 'admin' | 'photographer';
export type AccountStatus = 'pending' | 'active' | 'inactive' | 'suspended';

export type AccountRow = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  role_label: string;
  status: AccountStatus;
  status_label: string;
  photographer_signature: string | null;
  locked: boolean;
  activation_link: 'valid' | 'expired' | null;
  created_at: string;
};
export type AccountDetail = AccountRow & {
  owned_events: number;
  is_me: boolean;
  dev_link_available: boolean; // TEMPORÁRIO — remover antes da implantação (só em desenvolvimento)
};
export type AccountInput = { full_name: string; email?: string; role: Role; photographer_signature: string | null };

export function listAccounts(f: { q?: string; role?: Role | null; status?: AccountStatus | null }) {
  const p = new URLSearchParams();
  if (f.q?.trim()) p.set('q', f.q.trim());
  if (f.role) p.set('role', f.role);
  if (f.status) p.set('status', f.status);
  return api<{ items: AccountRow[]; counts: Record<AccountStatus, number>; institutional_domain: string }>(`/admin/accounts?${p}`);
}
export const getAccount = (id: string) => api<AccountDetail>(`/admin/accounts/${id}`);
export const createAccount = (body: AccountInput) => api<AccountDetail>('/admin/accounts', { body });
export const updateAccount = (id: string, body: AccountInput) => api<AccountDetail>(`/admin/accounts/${id}`, { method: 'PUT', body });
export const changeStatus = (id: string, status: AccountStatus) => api<AccountDetail>(`/admin/accounts/${id}/status`, { body: { status } });
export const resendLink = (id: string) => api<void>(`/admin/accounts/${id}/activation-link`, { method: 'POST' });
export const unlockAccount = (id: string) => api<AccountDetail>(`/admin/accounts/${id}/unlock`, { method: 'POST' });

// TEMPORÁRIO — REMOVER ANTES DA IMPLANTAÇÃO. Mostra o link de definição de senha ao administrador, só para
// demonstração; o servidor só atende em desenvolvimento (e-mails viram arquivo). Em produção o link vai
// apenas ao e-mail do titular (RF001 nota 5).
export const devActivationLink = (id: string) =>
  api<{ url: string }>(`/admin/accounts/${id}/activation-link/dev`, { method: 'POST' });
