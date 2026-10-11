/**
 * Visitor area (no account): /api/v1/public/*. The visitor's anonymous session is an HttpOnly
 * cookie created by the "Estou ciente" — JavaScript never sees it.
 */
import { api, API_URL, ApiError } from './client';

export type Theme = { id: number; name: string };

export type PublicEvent = {
  id: string;
  name: string;
  date_label: string;
  date_start: string;
  date_end: string;
  date_precision: 'day' | 'month' | 'month_range';
  location: string;
  description: string;
  themes: Theme[];
  photos: number;
  credits: string[];
  expires_on: string;
};

export type PublicFilters = {
  q?: string;
  theme_ids?: number[];
  day?: string | null;          // ISO yyyy-mm-dd
  period_start?: string | null; // ISO, first day of the first month
  period_end?: string | null;   // ISO, last day of the last month
  page?: number;
};

export type Consent = { version: string; title: string; paragraphs: string[]; retention: string };
export type ResultItem = { id: string; captured_at: string | null; credit: string };

export function listPublicEvents(f: PublicFilters) {
  const params = new URLSearchParams();
  if (f.q?.trim()) params.set('q', f.q.trim());
  for (const id of f.theme_ids ?? []) params.append('theme_id', String(id));
  if (f.day) params.set('day', f.day);
  if (f.period_start) params.set('period_start', f.period_start);
  if (f.period_end) params.set('period_end', f.period_end);
  params.set('page', String(f.page ?? 1));
  return api<{ items: PublicEvent[]; total: number; page: number; page_size: number }>(`/public/events?${params}`);
}

export const listPublicThemes = () => api<Theme[]>('/public/themes');
export const getPublicEvent = (id: string) => api<PublicEvent>(`/public/events/${id}`);
export const publicCoverUrl = (id: string) => `${API_URL}/api/v1/public/events/${id}/cover`;
export const getConsentText = () => api<Consent>('/public/consent');
export const giveConsent = (eventId: string) => api<void>(`/public/events/${eventId}/consent`, { method: 'POST' });
/**
 * Ends the visit on the server (result + consent erased). Called when entering and leaving the
 * event page. "keepalive" lets the request finish even while the tab is closing.
 */
export function endVisit() {
  fetch(`${API_URL}/api/v1/public/session/end`, { method: 'POST', credentials: 'include', keepalive: true }).catch(() => undefined);
}
export const getPrivacy = () => api<{ retention: string; consent_version: string; controller: string; dpo: string | null }>('/public/privacy');

/** Camera capture and gallery upload arrive here the same way (RF016 note 2). */
export function searchFaces(eventId: string, selfie: Blob) {
  const form = new FormData();
  form.append('selfie', selfie, 'autorretrato.jpg');
  return api<{ items: ResultItem[] }>(`/public/events/${eventId}/search`, { body: form });
}

/** Why a search failed, as the server says it ("no_face", "low_quality", "limit", ...). */
export const failureReason = (err: unknown) =>
  err instanceof ApiError && err.detail && typeof err.detail === 'object' ? (err.detail as { reason?: string }).reason : undefined;

export const resultImageUrl = (id: string, variant: 'thumb' | 'preview') => `${API_URL}/api/v1/public/images/${id}/${variant}`;

/** RF019: signed download address — 15 minutes, this session and this image only. */
export async function downloadUrl(id: string) {
  const { url } = await api<{ url: string }>(`/public/images/${id}/download-link`, { method: 'POST' });
  return `${API_URL}${url}`;
}

export const requestRemoval = (imageId: string, contact_email: string, reason: string) =>
  api<{ deadline: string }>(`/public/images/${imageId}/removal`, { body: { contact_email, reason: reason || null } });

export function requestRemovalByFile(file: Blob, contact_email: string, reason: string) {
  const form = new FormData();
  form.append('file', file, 'foto.jpg');
  form.append('contact_email', contact_email);
  if (reason) form.append('reason', reason);
  return api<{ deadline: string }>('/public/removal', { body: form });
}
