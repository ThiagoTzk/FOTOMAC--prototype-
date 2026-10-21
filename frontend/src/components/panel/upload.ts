/**
 * Upload queue of the "Enviar imagens" screen (RF007, RF008).
 * One HTTP request per file: a failure affects only that file, which can be re-sent alone,
 * and an interrupted batch resumes without re-sending what is already done (RF007 note 5).
 */
import { API_URL, api } from '@/api/client';
import type { UploadRules } from '@/api/images';

export const MAX_FILES_PER_BATCH = 500;  // RF007 (300 until 17/10/2026)
const PARALLEL = 3;

export type EntryStatus = 'checking' | 'valid' | 'invalid' | 'duplicate' | 'waiting' | 'sending' | 'done' | 'failed';

/** jpeg/png/webp: the browser draws a preview; heic and raw usually not (the server makes the JPEG copy). */
export type Kind = 'jpeg' | 'png' | 'webp' | 'heic' | 'raw';

export type Entry = {
  key: string;
  file: File;
  previewUrl: string;
  kind?: Kind;
  status: EntryStatus;
  progress: number;
  message?: string;
  sha256?: string;
};

/** RF008 note 4: the cause in plain Portuguese. */
const REASONS: Record<string, string> = {
  format: 'Formato não permitido: envie fotografias em JPEG, PNG, HEIC ou WebP.',
  too_large: 'O arquivo ultrapassa o limite de 25 MB por imagem.',
  raw_too_large: 'O arquivo RAW ultrapassa o limite definido pela administração.',
  raw_disabled: 'Formatos brutos (RAW) não estão habilitados. Envie a fotografia exportada em JPEG.',
  format_unavailable: 'Este formato ainda não pode ser recebido. Envie a fotografia em JPEG.',
  corrupted: 'O arquivo está corrompido e não pôde ser lido.',
  event_limit: 'O evento atingiu o limite de 1.000 imagens.',
  duplicate: 'Esta imagem já está no acervo do evento e não será enviada novamente.',
  network: 'Falha de transmissão. Verifique a conexão e tente novamente.',
};

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const HEIF_BRANDS = ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx'];
const TIFF_STARTS = ['II*\0', 'MM\0*', 'IIRO', 'IIRS', 'IIU\0'];

/** By the binary signature, not the extension — the same rules as the server, which checks again
 *  (RF007 note 2; backend/app/images/formats.py). The name only separates the RAW formats that share
 *  the TIFF signature (DNG, NEF...). */
async function detect(file: File, rawExtensions: string[]): Promise<Kind | null> {
  const b = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const text = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (text(0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'webp';
  if (text(4, 8) === 'ftyp') {
    const major = text(8, 12);
    if (major === 'crx ') return 'raw';
    const compatible = Array.from({ length: 12 }, (_, i) => text(16 + 4 * i, 20 + 4 * i));
    if (HEIF_BRANDS.includes(major) || (['mif1', 'msf1'].includes(major) && compatible.some((c) => HEIF_BRANDS.includes(c)))) return 'heic';
  }
  if (text(0, 16) === 'FUJIFILMCCD-RAW ') return 'raw';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (TIFF_STARTS.includes(text(0, 4)) && rawExtensions.includes(ext)) return 'raw';
  return null;
}

/** The browser can draw these; HEIC and RAW get a placeholder in the list. */
export const previewable = (kind?: Kind) => kind === 'jpeg' || kind === 'png' || kind === 'webp';

export function newEntries(files: File[]): Entry[] {
  return files.map((file) => ({
    key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    file, previewUrl: URL.createObjectURL(file), status: 'checking', progress: 0,
  }));
}

/** Checks format, size and duplicates (in the event and inside the selection) before sending. */
export async function validate(eventId: string, entries: Entry[], rules: UploadRules): Promise<Entry[]> {
  const checked: Entry[] = [];
  for (const e of entries) {
    const kind = await detect(e.file, rules.raw_extensions);
    if (!kind) checked.push({ ...e, status: 'invalid', message: REASONS.format });
    else if (kind === 'raw' && !rules.raw_enabled) checked.push({ ...e, kind, status: 'invalid', message: REASONS.raw_disabled });
    else if (kind === 'raw' && e.file.size > (rules.max_raw_bytes ?? 0)) {
      checked.push({ ...e, kind, status: 'invalid',
                     message: `O arquivo RAW ultrapassa o limite de ${Math.round((rules.max_raw_bytes ?? 0) / 1024 ** 2)} MB.` });
    } else if (kind !== 'raw' && e.file.size > rules.max_photo_bytes) checked.push({ ...e, kind, status: 'invalid', message: REASONS.too_large });
    else checked.push({ ...e, kind, sha256: await sha256(e.file), status: 'valid' });
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
