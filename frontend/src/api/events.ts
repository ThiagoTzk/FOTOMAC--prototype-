import { API_URL, api } from '@/api/client';
import type { EventStatus } from '@/components/panel/ui';

export type Theme = { id: number; name: string };
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
  owner: { id: string; full_name: string };
  relation: 'owner' | 'collaborator' | 'admin';
  can_manage: boolean;
  photos: number;
  published: number;
  collaborators: { signature: string; photos: number }[];
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
export const listThemes = () => api<Theme[]>('/themes');
export const getDashboard = () => api<Dashboard>('/dashboard');
export const setCollaboration = (id: string, open: boolean) =>
  api<EventItem>(`/events/${id}/collaboration`, { method: 'PUT', body: { open } });

/** The cover is served through the API (session checked) and then a short signed link. */
export const coverUrl = (id: string, version?: string) => `${API_URL}/api/v1/events/${id}/cover${version ? `?v=${version}` : ''}`;

/** "2026-09-18" → "18/09/2026" without time-zone surprises. */
export const isoToBr = (iso: string) => iso.split('-').reverse().join('/');
