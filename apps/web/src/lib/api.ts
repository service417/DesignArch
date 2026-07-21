/**
 * The API client.
 *
 * Two things it takes care of so no caller has to:
 *
 * 1. Token refresh. A 401 on any call triggers one refresh attempt and a replay
 *    of the original request. Concurrent 401s share a single in-flight refresh —
 *    the API rotates refresh tokens and revokes the whole family on reuse, so
 *    firing several refreshes at once would log the admin out.
 *
 * 2. Error shape. The API returns { code, message } for domain refusals and
 *    { message: string[] } for validation failures. Both become an ApiError with
 *    a message worth showing a user.
 */

const ACCESS_KEY = 'designarc.access';
const REFRESH_KEY = 'designarc.refresh';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = tokens.refresh;
  if (!refreshToken) return false;

  const response = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    tokens.clear();
    return false;
  }

  const data = (await response.json()) as { accessToken: string; refreshToken: string };
  tokens.set(data.accessToken, data.refreshToken);
  return true;
}

async function readError(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiError(response.status, response.statusText || 'Request failed.');
  }

  const payload = body as { message?: string | string[]; code?: string };
  const message = Array.isArray(payload.message)
    ? payload.message.join('. ')
    : (payload.message ?? 'Request failed.');

  return new ApiError(response.status, message, payload.code);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Internal: prevents a refreshed request from refreshing again. */
  retry?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, retry = true } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const access = tokens.access;
  if (access) headers.Authorization = `Bearer ${access}`;

  const response = await fetch(`/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && retry && tokens.refresh) {
    refreshInFlight ??= refreshTokens().finally(() => {
      refreshInFlight = null;
    });

    if (await refreshInFlight) {
      return request<T>(path, { ...options, retry: false });
    }
    // Refresh failed: the session is genuinely over.
    window.dispatchEvent(new CustomEvent('designarc:signed-out'));
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  if (!response.ok) throw await readError(response);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
};
