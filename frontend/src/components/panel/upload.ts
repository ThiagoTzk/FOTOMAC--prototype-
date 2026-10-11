/**
 * Upload queue of the "Enviar imagens" screen (RF007, RF008).
 * One HTTP request per file: a failure affects only that file, which can be re-sent alone,
 * and an interrupted batch resumes without re-sending what is already done (RF007 note 5).
 */
import { API_URL, api } from '@/api/client';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_BATCH = 300;
const PARALLEL = 3;

export type EntryStatus = 'checking' | 'valid' | 'invalid' | 'duplicate' | 'waiting' | 'sending' | 'done' | 'failed';

export type Entry = {
  key: string;
  file: File;
  previewUrl: string;
  status: EntryStatus;
  progress: number;
  message?: string;
  sha256?: string;
};

/** RF008 note 4: the cause in plain Portuguese. */
const REASONS: Record<string, string> = {
  format: 'Formato não permitido: envie apenas imagens JPEG.',
  too_large: 'O arquivo ultrapassa o limite de 25 MB por imagem.',
  corrupted: 'O arquivo está corrompido e não pôde ser lido.',
  event_limit: 'O evento atingiu o limite de 1.000 imagens.',
  duplicate: 'Esta imagem já está no acervo do evento e não será enviada novamente.',
  network: 'Falha de transmissão. Verifique a conexão e tente novamente.',
};

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function isJpeg(file: File): Promise<boolean> {
  // By the binary signature (FF D8 FF), not the extension — the server checks again (RF007 note 2).
  const head = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}

export function newEntries(files: File[]): Entry[] {
  return files.map((file) => ({
    key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    file, previewUrl: URL.createObjectURL(file), status: 'checking', progress: 0,
  }));
}

/** Checks format, size and duplicates (in the event and inside the selection) before sending. */
export async function validate(eventId: string, entries: Entry[]): Promise<Entry[]> {
  const checked: Entry[] = [];
  for (const e of entries) {
    if (!(await isJpeg(e.file))) checked.push({ ...e, status: 'invalid', message: REASONS.format });
    else if (e.file.size > MAX_FILE_BYTES) checked.push({ ...e, status: 'invalid', message: REASONS.too_large });
    else checked.push({ ...e, sha256: await sha256(e.file), status: 'valid' });
  }
  const sums = checked.filter((e) => e.sha256).map((e) => e.sha256!);
  const { existing } = sums.length
    ? await api<{ existing: string[] }>(`/events/${eventId}/images/check`, { body: { checksums: sums } })
    : { existing: [] as string[] };
  const seen = new Set<string>();
  return checked.map((e) => {
    if (!e.sha256) return e;
    if (existing.includes(e.sha256) || seen.has(e.sha256)) return { ...e, status: 'duplicate', message: REASONS.duplicate };
    seen.add(e.sha256);
    return e;
  });
}

/** XMLHttpRequest (not fetch) because only it reports upload progress per file (RF008 note 2). */
function send(eventId: string, file: File, onProgress: (p: number) => void): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/v1/events/${eventId}/images`);
    xhr.withCredentials = true; // the HttpOnly session cookie
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) onProgress(Math.round((100 * ev.loaded) / ev.total)); };
    xhr.onload = () => {
      if (xhr.status === 201) return resolve({ ok: true });
      let reason = 'network';
      try { reason = JSON.parse(xhr.responseText).detail?.reason ?? reason; } catch { /* keep generic */ }
      resolve({ ok: false, message: REASONS[reason] ?? REASONS.network });
    };
    xhr.onerror = () => resolve({ ok: false, message: REASONS.network });
    const form = new FormData();
    form.append('file', file, file.name);
    xhr.send(form);
  });
}

/** Sends the given entries, a few at a time; one failure never stops the others (RF008 note 2). */
export async function runQueue(eventId: string, keys: string[], update: (key: string, patch: Partial<Entry>) => void,
                               getFile: (key: string) => File | undefined, isCancelled: () => boolean): Promise<void> {
  const queue = [...keys];
  async function lane() {
    while (queue.length && !isCancelled()) {
      const key = queue.shift()!;
      const file = getFile(key);
      if (!file) continue;
      update(key, { status: 'sending', progress: 0 });
      const r = await send(eventId, file, (p) => update(key, { progress: p }));
      update(key, r.ok ? { status: 'done', progress: 100 } : { status: 'failed', message: r.message });
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, lane));
}
