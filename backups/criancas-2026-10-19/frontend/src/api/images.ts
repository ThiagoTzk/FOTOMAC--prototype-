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
  minors_reviewed: boolean;   // checked for minors (faces blurred in the file, or none found)
  faces_blurred: number;
  /** Photos of a hired photographer: 'pending' until the administrator approves them (RF031). */
  approval: 'pending' | 'approved' | null;
  uploaded_by_name: string;          // who sent it (accountability)
  approved_by_name: string | null;   // who reviewed and approved it (RF031)
  approved_at: string | null;
};

export type ImageCounts = Record<'all' | 'mine' | 'in_review' | 'discarded' | 'published' | 'no_faces' | 'failed' | 'removal' | 'pending_approval' | 'ready', number>;
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
export type Box = [number, number, number, number];
/** Where the faces are (pixels of the original) — detection only, no biometric vector. */
export const locateFaces = (id: string) => api<{ width: number; height: number; faces: Box[] }>(`/images/${id}/faces`);
/** Blurs the chosen faces IN THE FILE (the original is replaced, RF009 note 7). */
export const blurFaces = (id: string, boxes: Box[]) => api<ImageItem>(`/images/${id}/blur`, { body: { boxes } });
export const setMinorsChecked = (id: string, reviewed: boolean) =>
  api<ImageItem>(`/images/${id}/minors-check`, { method: 'PUT', body: { reviewed } });
export const discardImage = (id: string) => api<ImageItem>(`/images/${id}/discard`, { method: 'POST' });
export const restoreImage = (id: string) => api<ImageItem>(`/images/${id}/restore`, { method: 'POST' });
export const deleteImage = (id: string) => api<void>(`/images/${id}`, { method: 'DELETE' });
export const reprocessImage = (id: string) => api<ImageItem>(`/images/${id}/reprocess`, { method: 'POST' });
/** Publishes every image ready for publication, or only `ids` (the ones selected in the Images tab). */
export const publishEvent = (eventId: string, ids?: string[]) =>
  api<{ sent: number; discarded: number; published: number }>(`/events/${eventId}/publish`,
                                                               { method: 'POST', body: ids ? { ids } : undefined });
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

/** Administrator: approve a hired photographer's photo (it may then be published) or reject it —
 *  a rejected photo is deleted without ever producing a biometric vector (RF031 note 3). */
export const decideApproval = (id: string, approve: boolean) =>
  api<{ image: ImageItem | null }>(`/images/${id}/approval`, { body: { approve } });

/** Administrator: approve or reject at once the selected photos of a hired photographer (RF031).
 *  Each approved photo keeps who approved it and when. */
export const decideApprovals = (eventId: string, imageIds: string[], approve: boolean) =>
  api<{ decided: number }>(`/events/${eventId}/images/approval`, { body: { image_ids: imageIds, approve } });
