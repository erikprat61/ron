import type { SourceHealthSnapshot, SourceHealthStatus, UpstreamSourceKind } from "@ron/contract";

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string, url: string) {
    super(message, 404, url);
    this.name = "NotFoundError";
  }
}

type HealthState = {
  status: SourceHealthStatus;
  lastAttemptedRefreshUtc?: string;
  lastSuccessfulRefreshUtc?: string;
  eventCount: number;
  errorMessage?: string;
};

export class UpstreamHealthMonitor {
  private readonly states = new Map<UpstreamSourceKind, HealthState>();

  constructor(sources: UpstreamSourceKind[] = []) {
    for (const source of sources) {
      this.states.set(source, {
        status: "healthy",
        eventCount: 0
      });
    }
  }

  recordSuccess(source: UpstreamSourceKind, eventCount = 0): void {
    const now = new Date().toISOString();
    this.states.set(source, {
      status: "healthy",
      lastAttemptedRefreshUtc: now,
      lastSuccessfulRefreshUtc: now,
      eventCount
    });
  }

  recordFailure(source: UpstreamSourceKind, error: unknown, degraded = false, eventCount = 0): void {
    const now = new Date().toISOString();
    const previous = this.states.get(source);
    this.states.set(source, {
      status: degraded ? "degraded" : "unhealthy",
      lastAttemptedRefreshUtc: now,
      lastSuccessfulRefreshUtc: previous?.lastSuccessfulRefreshUtc,
      eventCount,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }

  recordDegraded(source: UpstreamSourceKind, error: unknown, eventCount: number): void {
    const now = new Date().toISOString();
    const previous = this.states.get(source);
    this.states.set(source, {
      status: "degraded",
      lastAttemptedRefreshUtc: now,
      lastSuccessfulRefreshUtc: previous?.lastSuccessfulRefreshUtc ?? now,
      eventCount,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }

  snapshot(sources?: UpstreamSourceKind[]): SourceHealthSnapshot[] {
    const keys = sources ?? [...this.states.keys()];
    return keys.map((source) => ({
      source,
      status: this.states.get(source)?.status ?? "healthy",
      lastAttemptedRefreshUtc: this.states.get(source)?.lastAttemptedRefreshUtc,
      lastSuccessfulRefreshUtc: this.states.get(source)?.lastSuccessfulRefreshUtc,
      eventCount: this.states.get(source)?.eventCount ?? 0,
      errorMessage: this.states.get(source)?.errorMessage
    }));
  }
}

export interface JsonClientOptions {
  baseUrl: string;
  timeoutMs: number;
  headers?: HeadersInit;
}

export class JsonHttpClient {
  constructor(private readonly options: JsonClientOptions) {}

  async getJson<T>(path: string, init?: RequestInit): Promise<T> {
    const url = new URL(path, this.options.baseUrl).toString();
    const timeoutSignal = AbortSignal.timeout(this.options.timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    const response = await fetch(url, {
      ...init,
      method: "GET",
      headers: {
        Accept: "application/json",
        ...headersToObject(this.options.headers),
        ...headersToObject(init?.headers)
      },
      signal
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundError(`Request to ${url} returned 404.`, url);
      }

      throw new HttpError(`Request to ${url} failed with status ${response.status}.`, response.status, url);
    }

    return (await response.json()) as T;
  }
}

function headersToObject(headers?: HeadersInit): Record<string, string> {
  const mapped: Record<string, string> = {};
  if (!headers) {
    return mapped;
  }

  new Headers(headers).forEach((value, key) => {
    mapped[key] = value;
  });

  return mapped;
}
