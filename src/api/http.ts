export class ApiError extends Error {
  readonly status?: number;
  readonly code: string;
  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code ?? 'API_ERROR';
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function abortError(): Error {
  const error = new Error('The request was cancelled.');
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); cleanup(); reject(abortError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface RequestOptions {
  accept?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  beforeAttempt?: (signal?: AbortSignal) => Promise<void>;
}

function serverMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('message' in body)) return;
  const value = body.message;
  return typeof value === 'string' && value.length <= 240 ? value : undefined;
}

/** Reads may retry once. Writes never retry: a lost response may hide a successful write. */
export async function requestJson(url: string, options: RequestOptions = {}): Promise<unknown> {
  const method = options.method ?? 'GET';
  const maxRetries = method === 'GET' ? options.retries ?? 1 : 0;

  for (let attempt = 0; ; attempt += 1) {
    if (options.signal?.aborted) throw abortError();
    await options.beforeAttempt?.(options.signal);
    if (options.signal?.aborted) throw abortError();

    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 15000);
    let retryDelay = 1200 * (attempt + 1);

    try {
      const response = await fetch(url, {
        method,
        headers: { Accept: options.accept ?? 'application/json', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      const raw = await response.text();
      let data: unknown;
      try { data = raw.trim() ? JSON.parse(raw) : undefined; }
      catch {
        if (response.ok) throw new ApiError('The API returned invalid JSON. Check that both CRUD resources exist.', { code: 'INVALID_RESPONSE' });
      }
      if (!response.ok) {
        const retryAfter = response.headers.get('retry-after');
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const until = retryAfter ? Date.parse(retryAfter) : NaN;
        const delay = Number.isFinite(seconds) ? seconds * 1000 : until - Date.now();
        if (Number.isFinite(delay)) retryDelay = Math.max(retryDelay, Math.min(delay, 30000));
        const message = response.status === 429
          ? 'This API has reached its request limit. Please wait before trying again.'
          : serverMessage(data) ?? 'The API request failed (HTTP ' + response.status + ').';
        throw new ApiError(message, { status: response.status });
      }
      if (data === undefined && method !== 'DELETE') {
        throw new ApiError('The API returned an empty response instead of JSON.', { code: 'INVALID_RESPONSE' });
      }
      return data;
    } catch (error) {
      if (options.signal?.aborted) throw abortError();
      const failure = timedOut
        ? new ApiError(method === 'GET' ? 'The request timed out. Please try again.' : 'The request timed out. Refresh your library before retrying; the change may have been saved.', { code: 'TIMEOUT' })
        : error instanceof ApiError ? error
        : new ApiError(method === 'GET' ? 'Could not reach the API. Check your connection and API address.' : 'The API connection was interrupted. Refresh your library before retrying; the change may have been saved.', { code: 'NETWORK' });
      const retryable = failure.code === 'NETWORK' || failure.code === 'TIMEOUT' ||
        failure.status === 429 || (failure.status !== undefined && failure.status >= 500);
      if (attempt >= maxRetries || !retryable) throw failure;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
    await wait(retryDelay, options.signal);
  }
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(label + ' has an unexpected shape.', { code: 'INVALID_RESPONSE' });
  }
  return value as Record<string, unknown>;
}

export function invalidResponse(label: string): never {
  throw new ApiError(label + ' has missing or invalid fields. Check the API resource schema.', { code: 'INVALID_RESPONSE' });
}


