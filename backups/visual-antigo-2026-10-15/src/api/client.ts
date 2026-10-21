/**
 * The ONLY door from the screens to the server. Every screen calls the Python API through
 * here — the same contract the mobile app will use (RNF19).
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

const NETWORK_ERROR = 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  // Forms with files (event cover, photos) go as multipart; the browser sets the boundary.
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      // "include": send the HttpOnly session cookie. JavaScript never sees the token itself.
      credentials: 'include',
      headers: options.body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: isForm ? (options.body as FormData) : options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // The API sends user-safe Portuguese messages in "detail" (string or {message, ...}).
    const detail = data?.detail;
    const message = typeof detail === 'string' ? detail : detail?.message ?? 'Algo deu errado. Tente novamente.';
    throw new ApiError(response.status, message, detail);
  }
  return data as T;
}
