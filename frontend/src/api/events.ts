import { API_URL, api } from '@/api/client';
import type { EventStatus } from '@/components/panel/ui';

export type Theme = { id: number; name: string; icon: string };
export type DatePrecision = 'day' | 'month' | 'month_range';

export type EventItem = {
  id: string;
  name: string;
  date_precision: DatePrecision;
  date_start: string;
  date_end: string;
  date_label: string;
  location: string;
  description: string;
  themes: Theme[];
  status: EventStatus;
  collaboration_open: boolean;
  expires_on: string;
  owner: { id: string; full_name: string; team: string | null };
  /** viewer: the marketing team on someone else's published event — published photos only (RF030). */
  relation: 'owner' | 'collaborator' | 'admin' | 'contractor' | 'viewer';
  can_manage: boolean;
  photos: number;
  published: number;
  collaborators: { signature: string; photos: number }[];
  /** Photos of a hired photographer awaiting the administrator's approval (RF031). */
  approvals_pending: number;
  /** "Excluir evento": out of the site now, eliminated at this moment unless undone. */
  deletion_due_at: string | null;
  deletion_grace_days: number;
};

export type EventPage = { items: EventItem[]; total: number; page: number; page_size: number };

export type Dashboard = {
  events_owned: number;
  processing: number;
  attention: number;
  photos_published: number;
  indexing_failures: number;
  removal_requests: number;
  oldest_removal_request: string | null;
  /** Administrator: events where photos of a hired photographer wait for approval (RF031). */
  approvals_pending: { event_id: string; event_name: string; photos: number }[];
  /** Administrator only (D2): the whole system, not "my events". */
  active_events: number | null;
  approvals_total: number | null;
};

/** What needs this account's attention (the bell), computed by the server on every call. */
export type PanelNotice = {
  kind: string; tone: 'danger' | 'warning' | 'info'; urgent: boolean; title: string; description: string; href: string;
};

export type EventFilters = {
  q?: string; theme_id?: number | null; status?: EventStatus | null;
  period_start?: string | null; period_end?: string | null; scope?: 'all' | 'mine' | 'collaborations'; page?: number;
};

export function listEvents(f: EventFilters): Promise<EventPage> {
  const params = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') params.set(k, String(v)); });
  return api<EventPage>(`/events?${params}`);
}

export const getEvent = (id: string) => api<EventItem>(`/events/${id}`);
/** Leaves the public area and erases the face data now; the photos wait the grace period. */
export const requestDeletion = (id: string) => api<EventItem>(`/events/${id}/deletion`, { method: 'POST' });
export const cancelDeletion = (id: string) => api<EventItem>(`/events/${id}/deletion`, { method: 'DELETE' });
export const listThemes = () => api<Theme[]>('/themes');
/** A new theme (tag) created while filling in an event; the creator owns it. */
export const createEventTheme = (name: string, icon: string) => api<Theme>('/themes', { body: { name, icon } });
export const getDashboard = () => api<Dashboard>('/dashboard');
export const getNotifications = () => api<{ items: PanelNotice[]; urgent: number }>('/notifications');
export const setCollaboration = (id: string, open: boolean) =>
  api<EventItem>(`/events/${id}/collaboration`, { method: 'PUT', body: { open } });

/** The cover is served through the API (session checked) and then a short signed link. */
export const coverUrl = (id: string, version?: string) => `${API_URL}/api/v1/events/${id}/cover${version ? `?v=${version}` : ''}`;

/** "2026-09-18" → "18/09/2026" without time-zone surprises. */
/** Who sends images to the event: responsible/admin always; others while collaboration is open; the hired
 *  photographer on its own event (RF025, RF031). Nobody while it expired or is being deleted. */
export const canUploadTo = (e: EventItem) =>
  e.status !== 'expired' && !e.deletion_due_at && (e.can_manage || e.collaboration_open || e.relation === 'contractor');
export const isoToBr = (iso: string) => iso.split('-').reverse().join('/');
