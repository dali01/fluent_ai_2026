/**
 * Shared HTTP helper for connectors and enrichment providers: retries
 * only on 429/5xx/network errors, honours Retry-After, exponential
 * backoff with jitter, per-attempt timeout composed with the run signal.
 * Injected fetch/clock for tests. docs/prospecting.md §8.
 */

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly bodySnippet: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export type FetchJsonOptions = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  retries?: number; // default 3
  attemptTimeoutMs?: number; // default 15000
  fetchImpl?: typeof fetch; // injected for tests
  sleepImpl?: (ms: number) => Promise<void>; // injected for tests
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryDelayMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 60_000);
    }
  }
  const backoff = Math.min(1000 * 2 ** attempt, 30_000);
  return backoff / 2 + Math.random() * (backoff / 2); // jitter
}

export async function fetchJson<T = unknown>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<T> {
  const {
    retries = 3,
    attemptTimeoutMs = 15_000,
    fetchImpl = fetch,
    sleepImpl = defaultSleep,
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const signals = [AbortSignal.timeout(attemptTimeoutMs)];
    if (options.signal) signals.push(options.signal);

    try {
      const res = await fetchImpl(url, {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body,
        signal: AbortSignal.any(signals),
      });

      if (res.ok) return (await res.json()) as T;

      const snippet = (await res.text().catch(() => "")).slice(0, 300);
      const retryable = res.status === 429 || res.status >= 500;
      lastError = new HttpError(
        `HTTP ${res.status} from ${new URL(url).host}`,
        res.status,
        snippet,
      );
      if (!retryable || attempt === retries) throw lastError;
      await sleepImpl(retryDelayMs(attempt, res.headers.get("retry-after")));
    } catch (error) {
      if (error instanceof HttpError) {
        if (attempt === retries) throw error;
        lastError = error;
        continue;
      }
      // The run's own abort must propagate immediately, not retry
      if (options.signal?.aborted) throw error;
      // Network / per-attempt timeout: retryable
      lastError = error;
      if (attempt === retries) throw error;
      await sleepImpl(retryDelayMs(attempt, null));
    }
  }
  throw lastError;
}
