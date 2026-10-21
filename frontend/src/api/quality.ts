/** Administrator: quality test of facial recognition (fotomac-lab's Test 1 inside the panel). */
import type { EngineOption } from './admin';
import { api, API_URL } from './client';

export type Point = {
  threshold: number; found: number; wrong: number; missed: number; precision: number | null; recall: number | null; f1: number;
};
export type Reading = {
  expected: number; lost_in_detection: number; f1_best: number; best: Point | null; at_threshold: Point; map: number | null;
  auc: number | null; intruders: number | null; separation: number | null; worst_hit: number | null; best_error: number | null;
  curve: Point[];
};
export type RunResult = {
  marked: number; present: number; wrong_face: number; score: number | null; score_product: number | null;
  model: Reading; product: Reading;
  distribution: { bins: number[]; present: number[]; wrong_face: number[]; absent: number[] };
};
/** In the list, the result comes without the curves. */
export type RunSummaryResult = Omit<RunResult, 'model' | 'product' | 'distribution'> & { best_threshold: number | null };
export type View = 'single' | 'max' | 'mean';
/** One row per run AND view: "id" is `${run_id}:${view}`. */
export type Run<R = RunResult> = {
  id: string; run_id: string; view: View; view_label: string; engine_key: string; engine_label: string; model_version: string | null;
  status: 'pending' | 'running' | 'done' | 'failed'; total: number; done: number; error: string | null;
  load_s: number | null; index_s_per_photo: number | null; query_ms: number | null; search_ms: number | null; faces: number | null;
  reference_only: boolean; lab_score: number | null; result: R | null;
};
export type Mark = 'present' | 'absent';
export type Item = {
  id: string; width: number; height: number; mark: Mark | null;
  scores: Record<string, { similarity: number; wrong_face: boolean; box: [number, number, number, number] }>;
};
export type TestDetail = {
  id: string; label: string; event_name: string; created_at: string; closed_at: string | null; threshold: number;
  active_engine: string; candidates: EngineOption[]; runs: Run[]; items: Item[]; query_poses: string[];
  query_liveness: Liveness | null;
};
/** Guided recording: did the head follow the order drawn for it? (movement in eye-distances / face ratio) */
export type Liveness = {
  passed: boolean; order?: string[]; inverted?: boolean; reason?: string;
  steps: { step: string; movement: number | null; against: number | null; limit: number; ok: boolean }[];
};
export type TestSummary = {
  id: string; label: string; event_name: string; created_at: string; closed_at: string | null; created_by: string;
  runs: Run<RunSummaryResult>[];
};
export type Overview = {
  tests: TestSummary[]; events: { id: string; name: string; photos: number }[]; candidates: EngineOption[]; active_engine: string;
};

const base = '/admin/quality-tests';
export const getOverview = () => api<Overview>(base);
/** One photo, several photos or the frames of a short video (extracted in the browser). */
export function createTest(eventId: string, label: string, photos: Blob[], consent: boolean, steps?: string[]) {
  const form = new FormData();
  form.append('event_id', eventId);
  form.append('label', label);
  form.append('consent', String(consent));
  photos.forEach((p, n) => form.append('photos', p, `consulta-${n}`));
  steps?.forEach((s) => form.append('steps', s));  // guided recording: the movement asked at each frame
  return api<{ id: string }>(base, { body: form });
}
export const getTest = (id: string) => api<TestDetail>(`${base}/${id}`);
export const addRun = (id: string, engine: string) => api<{ id: string }>(`${base}/${id}/runs`, { body: { engine } });
export const deleteRun = (id: string, runId: string) => api<void>(`${base}/${id}/runs/${runId}`, { method: 'DELETE' });
export const putMark = (id: string, imageId: string, mark: Mark | null) =>
  api<{ runs: Run[] }>(`${base}/${id}/marks/${imageId}`, { method: 'PUT', body: { mark } });
export const putWrongFace = (id: string, run: Run, imageId: string, wrong: boolean) =>
  api<{ runs: Run[] }>(`${base}/${id}/runs/${run.run_id}/wrong-face/${imageId}`, { method: 'PUT', body: { wrong, view: run.view } });
export const queryFrameUrl = (id: string, n: number) => `${API_URL}/api/v1${base}/${id}/query/${n}`;
export const closeTest = (id: string) => api<{ closed: boolean }>(`${base}/${id}/close`, { method: 'POST' });
export const discardTest = (id: string) => api<void>(`${base}/${id}`, { method: 'DELETE' });

/** Counts at an arbitrary threshold, read from the curve (a photo counts when similarity ≥ threshold). */
export function at(reading: Reading, threshold: number): Point {
  const point = [...reading.curve].reverse().find((p) => p.threshold >= threshold);
  if (point) return point;
  return { threshold, found: 0, wrong: 0, missed: reading.expected, precision: null, recall: reading.expected ? 0 : null, f1: 0 };
}
