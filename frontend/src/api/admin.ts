/** Administrator: parameters (RF026), themes (RF027), re-indexing (RF028). The server re-checks the role. */
import { api } from './client';

export type Parameter = {
  key: string; label: string; value: number; default: number; minimum: number; maximum: number; step: number;
  unit: string; group: string; help: string; integer: boolean;
};
export type ParameterChange = { at: string; key: string; label: string; previous: number; new: number; by: string };
export type Parameters = { items: Parameter[]; model: { version: string; vector_dim: number }; history: ParameterChange[] };

export const getParameters = () => api<Parameters>('/admin/parameters');
export const saveParameters = (values: Record<string, number>, ack: boolean) =>
  api<Parameters & { changed: string[] }>('/admin/parameters', { method: 'PUT', body: { values, threshold_warning_acknowledged: ack } });
export const retentionImpact = (months: number) =>
  api<{ events_changed: number; held_by_notice: number; notice_days: number }>(`/admin/parameters/retention-impact?months=${months}`);

export type ThemeRow = { id: number; name: string; active: boolean; events: number };
export const listAdminThemes = () => api<ThemeRow[]>('/admin/themes');
export const createTheme = (name: string) => api<ThemeRow>('/admin/themes', { body: { name } });
export const renameTheme = (id: number, name: string) => api<ThemeRow>(`/admin/themes/${id}`, { method: 'PUT', body: { name } });
export const setThemeActive = (id: number, active: boolean) => api<ThemeRow>(`/admin/themes/${id}/status`, { body: { active } });
export const deleteTheme = (id: number) => api<void>(`/admin/themes/${id}`, { method: 'DELETE' });

export type ReindexScope = 'event' | 'model_version' | 'all';
export type ReindexJob = {
  id: string; scope: ReindexScope; event_name: string | null; from_version: string | null; to_version: string;
  requested_by: string; created_at: string; finished_at: string | null; total: number; pending: number; done: number;
  failed: number; skipped: number; percent: number;
};
export type ReindexOverview = {
  model: { version: string; vector_dim: number }; versions: string[]; events: { id: string; name: string }[]; jobs: ReindexJob[];
};
export const getReindex = () => api<ReindexOverview>('/admin/reindex');
export const requestReindex = (body: { scope: ReindexScope; event_id?: string | null; from_version?: string | null }) =>
  api<ReindexJob>('/admin/reindex', { body });
export const getReindexJob = (id: string) =>
  api<{ job: ReindexJob; events: { event_id: string; name: string; total: number; finished: number; percent: number }[] }>(`/admin/reindex/${id}`);
