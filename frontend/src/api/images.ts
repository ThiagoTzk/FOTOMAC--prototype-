import { API_URL, api } from '@/api/client';

export type ReviewStatus = 'in_review' | 'discarded' | 'published';
export type IndexingStatus = 'not_queued' | 'pending' | 'processed' | 'no_faces' | 'failed';

export type ImageItem = {
  id: string;
  event_id: string;
  review_status: ReviewStatus;
  indexing_status: IndexingStatus;
  faces_count: number | null;
  credit: string;
  signature: string;
  uploaded_at: string;
  captured_at: string | null;
  size_bytes: number;
  width: number;
  height: number;
  mine: boolean;
  can_manage: boolean;
  removal_deadline: string | null;
  version: string;
};

export type ImageCounts = Record<'all' | 'mine' | 'in_review' | 'discarded' | 'published' | 'no_faces' | 'failed' | 'removal', number>;
export type ImageFilter = keyof ImageCounts;

export type Processing = {
  total: number; processed: number; pending: number; no_faces: number; failed: number; faces: number;
  percent: number; event_status: string;
};

export type PackageJob = {
  id: string; status: 'pending' | 'running' | 'ready' | 'failed' | 'expired'; file_name: string;
  image_count: number; size_bytes: number; progress: number; only_own: boolean;
};

export function listImages(eventId: string, filter: ImageFilter = 'all') {
  const mine = filter === 'mine';
  return api<{ items: ImageItem[]; counts: ImageCounts }>(
    `/events/${eventId}/images?filter=${mine ? 'all' : filter}${mine ? '&mine=true' : ''}`);
}

export const getImage = (id: string) => api<ImageItem>(`/images/${id}`);
export const discardImage = (id: string) => api<ImageItem>(`/images/${id}/discard`, { method: 'POST' });
export const restoreImage = (id: string) => api<ImageItem>(`/images/${id}/restore`, { method: 'POST' });
export const deleteImage = (id: string) => api<void>(`/images/${id}`, { method: 'DELETE' });
export const reprocessImage = (id: string) => api<ImageItem>(`/images/${id}/reprocess`, { method: 'POST' });
export const publishEvent = (eventId: string) =>
  api<{ sent: number; discarded: number; published: number }>(`/events/${eventId}/publish`, { method: 'POST' });
export const getProcessing = (eventId: string) => api<Processing>(`/events/${eventId}/processing`);

/** Reduced copies for the screens; the original stays in the storage untouched. */
// `v` changes only when the file is replaced, so the browser cache is reused while scrolling.
export const thumbUrl = (id: string, v?: string) => `${API_URL}/api/v1/images/${id}/thumb${v ? `?v=${v}` : ''}`;
export const previewUrl = (id: string, v?: string) => `${API_URL}/api/v1/images/${id}/preview${v ? `?v=${v}` : ''}`;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const formatDate = (iso: string) => formatDateTime(iso).slice(0, 10);
