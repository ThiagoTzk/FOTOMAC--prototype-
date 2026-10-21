import { API_URL, api } from '@/api/client';

/** Institutional people (RF020) and the photos where they were found (RF021). */
export type InstitutionalStatus = 'awaiting' | 'active' | 'revoked';
export type MarkCounts = { pending: number; confirmed: number; rejected: number };

export type PersonRow = {
  id: string; full_name: string; position: string; unit: string | null; email: string;
  status: InstitutionalStatus; status_label: string; created_at: string; link_expires_at: string | null;
  authorized_at: string | null; revoked_at: string | null; marks: MarkCounts;
};
export type PersonDetail = PersonRow & {
  photos: { id: string; position: number; faces_found: number | null }[];
  term_version: string | null; document_sha256: string | null; authorized_ip: string | null;
  revoked_by: 'holder' | 'admin' | null; scan_status: 'idle' | 'pending' | 'done'; scanned_at: string | null;
  signed: boolean;
  dev_link_available: boolean;   // TEMPORÁRIO — remover antes da implantação
};

// ---------------------------------------------------------------- administrator
const ADMIN = '/admin/institutional';
export const listPeople = () => api<PersonRow[]>(ADMIN);
export const getPerson = (id: string) => api<PersonDetail>(`${ADMIN}/${id}`);
export const createPerson = (form: FormData) => api<PersonDetail>(ADMIN, { body: form });
export const resendLink = (id: string) => api<void>(`${ADMIN}/${id}/link`, { method: 'POST' });
/** TEMPORÁRIO — REMOVER ANTES DA IMPLANTAÇÃO: shows the link while e-mails are not really sent. */
export const devLink = (id: string) => api<{ url: string }>(`${ADMIN}/${id}/link/dev`, { method: 'POST' });
export const endAuthorization = (id: string) => api<PersonDetail>(`${ADMIN}/${id}/end`, { method: 'POST' });
export const rescan = (id: string) => api<void>(`${ADMIN}/${id}/rescan`, { method: 'POST' });
export const deletePerson = (id: string) => api<void>(`${ADMIN}/${id}`, { method: 'DELETE' });
export const personPhotoUrl = (id: string, photoId: string) => `${API_URL}/api/v1${ADMIN}/${id}/photos/${photoId}`;
export const signatureUrl = (id: string) => `${API_URL}/api/v1${ADMIN}/${id}/signature`;
export const formUrl = (id: string) => `${API_URL}/api/v1${ADMIN}/${id}/form.pdf`;

// ---------------------------------------------------------------- the person (public page, by link)
const PUBLIC = '/public/institutional';
export type AuthorizationPage = {
  full_name: string; position: string; unit: string | null; photos: string[]; expires_at: string;
  term: { version: string; title: string; paragraphs: string[] };
};
export const getAuthorization = (token: string) =>
  api<AuthorizationPage>(`${PUBLIC}/authorization?token=${encodeURIComponent(token)}`);
export const authorizationPhotoUrl = (token: string, photoId: string) =>
  `${API_URL}/api/v1${PUBLIC}/authorization/photos/${photoId}?token=${encodeURIComponent(token)}`;
export const sign = (token: string, signature: string) =>
  api<{ revoke_url: string }>(`${PUBLIC}/authorization`, { body: { token, signature } });
export const refuse = (token: string) => api<void>(`${PUBLIC}/refusal`, { body: { token } });
export const getRevocation = (token: string) =>
  api<{ full_name: string; status: InstitutionalStatus; authorized_at: string | null; revoked_at: string | null }>(
    `${PUBLIC}/revocation?token=${encodeURIComponent(token)}`);
export const revoke = (token: string) => api<{ revoked_at: string }>(`${PUBLIC}/revocation`, { body: { token } });

// ---------------------------------------------------------------- consultation (photographer, marketing, admin)
export type Person = { id: string; full_name: string; position: string; unit: string | null };
export type PersonEvent = { id: string; name: string; date_label: string; location: string; marked: number; total: number };
export type MarkedImage = {
  image_id: string; status: 'pending' | 'confirmed'; similarity: number; credit: string; signature: string;
  captured_at: string | null; version: string;
};
export const consultPeople = () => api<Person[]>('/institutional/people');
export function personEvents(id: string, f: { date_from?: string | null; theme_id?: number | null }) {
  const q = new URLSearchParams();
  if (f.date_from) q.set('date_from', f.date_from);
  if (f.theme_id) q.set('theme_id', String(f.theme_id));
  return api<{ person: Person; events: PersonEvent[] }>(`/institutional/people/${id}/events?${q}`);
}
export type EventMarks = {
  person: Person;
  event: { id: string; name: string; location: string; date_label: string; total: number; themes: string[] };
  images: MarkedImage[];
};
export const personEventImages = (id: string, eventId: string) =>
  api<EventMarks>(`/institutional/people/${id}/events/${eventId}/images`);
export const markedImageUrl = (id: string, imageId: string, variant: 'thumb' | 'preview', v?: string) =>
  `${API_URL}/api/v1/institutional/people/${id}/images/${imageId}/${variant}${v ? `?v=${v}` : ''}`;
export const decideMarks = (id: string, imageIds: string[], confirm: boolean) =>
  api<{ decided: number }>(`/institutional/people/${id}/marks`, { body: { image_ids: imageIds, confirm } });
