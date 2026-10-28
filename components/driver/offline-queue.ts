"use client";

/*
 * Offline support for the driver screen.
 *
 * - Run details are cached on the phone so a run can be opened without signal.
 * - Every change (stop record or run action) goes into a queue in localStorage
 *   and is sent to the server IN ORDER (start → stops → finish).
 * - Stop records carry clientUpdateId + recordedAt, so a retry or a late
 *   arrival can never create a duplicate or overwrite a newer value.
 *
 * localStorage is per device; a queue only syncs from the phone that made it.
 */

export type QueueItem = {
  id: string; // also the clientUpdateId for stop records
  runId: string;
  kind: "stop" | "run_action";
  locationId?: string;
  url: string;
  body: Record<string, unknown>;
  /* For run actions: a 409 where the run already has this status means "already done". */
  expectStatus?: string;
  createdAt: string;
  state: "pending" | "error";
  error?: string;
};

const QUEUE_KEY = "paperDriver.queue.v1";
const RUN_KEY = (id: string) => `paperDriver.run.v1.${id}`;
const RUNS_KEY = "paperDriver.myRuns.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the in-memory state still works while the page is open.
  }
}

export const cache = {
  getRun: <T>(id: string) => read<T | null>(RUN_KEY(id), null),
  setRun: (id: string, value: unknown) => write(RUN_KEY(id), value),
  getRuns: <T>() => read<T | null>(RUNS_KEY, null),
  setRuns: (value: unknown) => write(RUNS_KEY, value),
};

export function loadQueue(): QueueItem[] {
  return read<QueueItem[]>(QUEUE_KEY, []);
}

export function saveQueue(items: QueueItem[]) {
  write(QUEUE_KEY, items);
}

export function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type FlushResult =
  | { item: QueueItem; ok: true; data: any }
  | { item: QueueItem; ok: false; offline: boolean; error: string };

/* Send one item. Network failure → offline (keep it); server rejection → error. */
export async function sendItem(item: QueueItem): Promise<FlushResult> {
  let res: Response;
  try {
    res = await fetch(item.url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item.body),
    });
  } catch {
    return { item, ok: false, offline: true, error: "Offline" };
  }

  const data = await res.json().catch(() => ({}));

  if (res.ok) return { item, ok: true, data };

  // Already applied earlier (e.g. the response to a first attempt was lost).
  if (res.status === 409 && item.expectStatus && data?.run?.status === item.expectStatus) {
    return { item, ok: true, data };
  }

  // 401 usually means the sign-in expired; keep it for after signing in again.
  if (res.status === 401 || res.status >= 500) {
    return { item, ok: false, offline: true, error: data?.error || `Server error ${res.status}` };
  }

  return { item, ok: false, offline: false, error: data?.error || `Rejected (${res.status})` };
}
