"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CloudOff,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  TriangleAlert,
  Wifi,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  QUICK_REASONS,
  RUN_STATUS_LABEL,
  RUN_STATUS_STYLE,
  STOP_STATUS_STYLE,
  formatDate,
  formatDateTime,
  n,
  type Edition,
  type RunDetail,
  type RunWithTotals,
  type StopRecord,
} from "@/components/paper-distribution/delivery-types";

import { cache, loadQueue, newId, saveQueue, sendItem, type QueueItem } from "./offline-queue";

type MyRun = RunWithTotals & { cityName: string; edition: Edition | null };

/* ---------------- queue + connectivity ---------------- */

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

/* Re-apply not-yet-synced changes on top of what the server returned. */
function applyPending(detail: RunDetail, queue: QueueItem[]): RunDetail {
  let next = detail;
  for (const item of queue) {
    if (item.runId !== detail.run.id) continue;
    next = applyOptimistic(next, item);
  }
  return next;
}

function applyOptimistic(detail: RunDetail, item: QueueItem): RunDetail {
  if (item.kind === "stop") {
    const b = item.body as any;
    return {
      ...detail,
      stops: detail.stops.map((s) =>
        s.locationId === item.locationId
          ? {
              ...s,
              status: b.status,
              deliveredQuantity: b.status === "skipped" ? 0 : b.deliveredQuantity ?? s.plannedQuantity,
              pickedUpQuantity: b.pickedUpQuantity ?? s.pickedUpQuantity,
              reason: b.reason ?? "",
              notes: b.notes ?? s.notes,
              recordedAt: b.recordedAt,
            }
          : s,
      ),
    };
  }
  const b = item.body as any;
  const run = { ...detail.run };
  if (b.action === "start") run.status = "in_progress";
  if (b.action === "interrupt") {
    run.status = "interrupted";
    run.interruptedReason = b.reason;
  }
  if (b.action === "load") run.loadedCopies = b.loadedCopies;
  if (b.action === "finish") {
    run.status = "completed";
    run.returnedCopies = b.returnedCopies;
    run.damagedCopies = b.damagedCopies;
    if (b.loadedCopies != null) run.loadedCopies = b.loadedCopies;
  }
  return { ...detail, run };
}

/* ---------------- page ---------------- */

export function DriverClient() {
  const router = useRouter();
  const params = useSearchParams();
  const runId = params.get("run");
  const online = useOnline();

  const [queue, setQueueState] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const flushingRef = useRef(false);
  const [detail, setDetailState] = useState<RunDetail | null>(null);
  const detailRef = useRef<RunDetail | null>(null);

  const setQueue = useCallback((items: QueueItem[]) => {
    queueRef.current = items;
    saveQueue(items);
    setQueueState(items);
  }, []);

  const setDetail = useCallback((d: RunDetail | null) => {
    detailRef.current = d;
    if (d) cache.setRun(d.run.id, d);
    setDetailState(d);
  }, []);

  useEffect(() => {
    const items = loadQueue();
    queueRef.current = items;
    setQueueState(items);
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    setSyncing(true);
    try {
      while (true) {
        const item = queueRef.current.find((q) => q.state === "pending");
        if (!item) break;
        const result = await sendItem(item);
        if (!result.ok && result.offline) break; // try again later, keep order
        const remaining = queueRef.current.filter((q) => q.id !== item.id);
        if (result.ok) {
          setQueue(remaining);
          // Fold the server's answer into the open run.
          const current = detailRef.current;
          if (current && current.run.id === item.runId) {
            if (item.kind === "stop" && result.data.stop) {
              const server: StopRecord = result.data.stop;
              setDetail(
                applyPending(
                  { ...current, stops: current.stops.map((s) => (s.locationId === server.locationId ? server : s)), totals: result.data.totals },
                  remaining,
                ),
              );
            } else if (result.data.run) {
              setDetail(applyPending(result.data as RunDetail, remaining));
            }
          }
        } else {
          // Rejected by the server: keep it visible so the driver can fix or discard it.
          setQueue(queueRef.current.map((q) => (q.id === item.id ? { ...q, state: "error", error: result.error } : q)));
        }
      }
    } finally {
      flushingRef.current = false;
      setSyncing(false);
    }
  }, [setDetail, setQueue]);

  // Sync when the connection comes back, on load, and every 20 s as a fallback.
  useEffect(() => {
    if (online) flush();
  }, [online, flush]);
  useEffect(() => {
    const timer = setInterval(() => navigator.onLine && flush(), 20_000);
    return () => clearInterval(timer);
  }, [flush]);

  const enqueue = useCallback(
    (item: Omit<QueueItem, "id" | "createdAt" | "state"> & { id?: string }) => {
      const full: QueueItem = { ...item, id: item.id ?? newId(), createdAt: new Date().toISOString(), state: "pending" };
      setQueue([...queueRef.current, full]);
      const current = detailRef.current;
      if (current && current.run.id === full.runId) setDetail(applyOptimistic(current, full));
      flush();
    },
    [flush, setDetail, setQueue],
  );

  const pendingCount = queue.filter((q) => q.state === "pending").length;
  const errorItems = queue.filter((q) => q.state === "error");

  const statusBar = (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-1.5 text-xs",
        online ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-900",
      )}
    >
      <span className="flex items-center gap-1.5">
        {online ? <Wifi className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
        {online ? "Online" : "Offline — changes are saved on this phone"}
      </span>
      <span className="flex items-center gap-1.5">
        {syncing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {pendingCount > 0 ? `${pendingCount} waiting to sync` : errorItems.length ? "" : "All synced"}
        {pendingCount > 0 && online && !syncing && (
          <button type="button" onClick={flush} className="underline">
            Retry
          </button>
        )}
      </span>
    </div>
  );

  const errorsBox = errorItems.length > 0 && (
    <div className="m-3 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <div className="font-medium">Not saved — the server rejected {errorItems.length} change(s):</div>
      {errorItems.map((q) => (
        <div key={q.id} className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            {q.kind === "stop" ? "Stop record" : `Run: ${(q.body as any).action}`} — {q.error}
          </span>
          <span className="flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => {
                setQueue(queueRef.current.map((x) => (x.id === q.id ? { ...x, state: "pending", error: undefined } : x)));
                flush();
              }}
            >
              Retry
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setQueue(queueRef.current.filter((x) => x.id !== q.id))}>
              Discard
            </Button>
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-xl flex-col">
      {statusBar}
      {errorsBox}
      {runId ? (
        <RunView
          key={runId}
          runId={runId}
          online={online}
          queue={queue}
          detail={detail?.run.id === runId ? detail : null}
          setDetail={setDetail}
          enqueue={enqueue}
          onBack={() => {
            setDetail(null);
            router.push("/driver");
          }}
        />
      ) : (
        <RunList online={online} queue={queue} onOpen={(id) => router.push(`/driver?run=${id}`)} />
      )}
    </div>
  );
}

/* ---------------- run list ---------------- */

function RunList({ online, queue, onOpen }: { online: boolean; queue: QueueItem[]; onOpen: (id: string) => void }) {
  const [runs, setRuns] = useState<MyRun[] | null>(null);
  const [error, setError] = useState("");
  const [fromCache, setFromCache] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/paper/my-runs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load runs");
      setRuns(data.runs);
      setFromCache(false);
      cache.setRuns(data.runs);
    } catch (err: any) {
      const cached = cache.getRuns<MyRun[]>();
      if (cached) {
        setRuns(cached);
        setFromCache(true);
      } else setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, online]);

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">My delivery runs</h1>
        <Button size="sm" variant="ghost" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      {fromCache && <div className="text-xs text-amber-700">Showing the last saved list (offline).</div>}
      {error && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      {!runs ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No runs assigned to you right now.
        </div>
      ) : (
        runs.map((r) => {
          const recorded = r.totals.deliveredStops + r.totals.partialStops + r.totals.skippedStops;
          const waiting = queue.filter((q) => q.runId === r.id && q.state === "pending").length;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpen(r.id)}
              className="block w-full rounded-xl border p-4 text-left shadow-sm transition hover:bg-accent"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{r.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {r.edition?.name} · {formatDate(r.edition?.publishDate)} · {r.cityName}
                  </div>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", RUN_STATUS_STYLE[r.status])}>
                  {RUN_STATUS_LABEL[r.status]}
                </span>
              </div>
              <div className="mt-2 text-sm">
                {r.totals.stops} stops · {n(r.totals.planned)} papers · {recorded}/{r.totals.stops} done
                {waiting > 0 && <span className="ml-1 text-amber-700">· {waiting} not synced</span>}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

/* ---------------- run view ---------------- */

function RunView({
  runId,
  online,
  queue,
  detail,
  setDetail,
  enqueue,
  onBack,
}: {
  runId: string;
  online: boolean;
  queue: QueueItem[];
  detail: RunDetail | null;
  setDetail: (d: RunDetail) => void;
  enqueue: (item: Omit<QueueItem, "id" | "createdAt" | "state"> & { id?: string }) => void;
  onBack: () => void;
}) {
  const [error, setError] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [openStop, setOpenStop] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/paper/runs/${runId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load run");
      setDetail(applyPending(data, loadQueue()));
      setFromCache(false);
    } catch (err: any) {
      const cached = cache.getRun<RunDetail>(runId);
      if (cached) {
        setDetail(applyPending(cached, loadQueue()));
        setFromCache(true);
      } else setError(err.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    const cached = cache.getRun<RunDetail>(runId);
    if (cached) setDetail(applyPending(cached, loadQueue()));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const stopsBySeq = useMemo(() => {
    if (!detail) return [];
    return detail.run.stops.map((s) => ({
      plan: s,
      record: detail.stops.find((r) => r.locationId === s.locationId),
    }));
  }, [detail]);

  if (!detail) {
    return (
      <div className="p-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> My runs
        </Button>
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          {error || (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Loading run…
            </>
          )}
        </div>
      </div>
    );
  }

  const { run, edition } = detail;
  const pendingFor = (locationId: string) =>
    queue.some((q) => q.runId === run.id && q.locationId === locationId && q.state === "pending");
  const recorded = stopsBySeq.filter((s) => s.record && s.record.status !== "pending").length;
  const nextStop = stopsBySeq.find((s) => !s.record || s.record.status === "pending");
  const current = stopsBySeq.find((s) => s.plan.locationId === (openStop ?? nextStop?.plan.locationId));
  const planned = run.stops.reduce((a, s) => a + s.plannedQuantity, 0);
  const dropped = detail.stops.reduce((a, s) => a + (s.deliveredQuantity ?? 0), 0);
  const pickedUp = detail.stops.reduce((a, s) => a + (s.pickedUpQuantity ?? 0), 0);

  const runAction = (body: Record<string, unknown>, expectStatus?: string) =>
    enqueue({ runId: run.id, kind: "run_action", url: `/api/paper/runs/${run.id}`, body, expectStatus });

  const live = run.status === "in_progress";

  return (
    <div className="flex-1 space-y-3 p-3 pb-10">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> My runs
        </Button>
        <Button variant="ghost" size="sm" onClick={load} disabled={!online}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-lg font-semibold">{run.name}</h1>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", RUN_STATUS_STYLE[run.status])}>
            {RUN_STATUS_LABEL[run.status]}
          </span>
        </div>
        <div className="text-sm text-muted-foreground">
          {edition?.name} · {formatDate(edition?.publishDate)}
        </div>
        {fromCache && <div className="mt-1 text-xs text-amber-700">Offline copy — may be out of date.</div>}
        {error && !fromCache && <div className="mt-1 text-sm text-red-700">{error}</div>}
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <MiniStat label="Stops" value={`${recorded}/${run.stops.length}`} />
        <MiniStat label="Planned" value={n(planned)} />
        <MiniStat label="Dropped" value={n(dropped)} />
        <MiniStat label="Old picked" value={n(pickedUp)} />
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(recorded / Math.max(1, run.stops.length)) * 100}%` }} />
      </div>

      {(run.status === "assigned" || run.status === "interrupted") && (
        <StartCard
          planned={planned}
          loaded={run.loadedCopies}
          interruptedReason={run.status === "interrupted" ? run.interruptedReason : ""}
          resume={run.status === "interrupted"}
          onLoad={(loadedCopies) => runAction({ action: "load", loadedCopies })}
          onStart={() => runAction({ action: "start" }, "in_progress")}
        />
      )}

      {live && current && (
        <StopCard
          key={current.plan.locationId}
          stop={current.plan}
          record={current.record}
          isNext={current.plan.locationId === nextStop?.plan.locationId}
          waitingSync={pendingFor(current.plan.locationId)}
          onSave={(fields) => {
            const id = newId();
            enqueue({
              id,
              runId: run.id,
              kind: "stop",
              locationId: current.plan.locationId,
              url: `/api/paper/runs/${run.id}/stops/${encodeURIComponent(current.plan.locationId)}`,
              body: { ...fields, clientUpdateId: id, recordedAt: new Date().toISOString() },
            });
            setOpenStop(null); // move on to the next stop
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {live && !nextStop && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          All stops recorded. Count what&apos;s left in the vehicle and finish the run below.
        </div>
      )}

      <section>
        <h2 className="mb-1 text-sm font-semibold">Stops</h2>
        <ol className="divide-y rounded-lg border">
          {stopsBySeq.map(({ plan, record }) => (
            <li key={plan.locationId}>
              <button
                type="button"
                onClick={() => live && setOpenStop(plan.locationId)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left",
                  current?.plan.locationId === plan.locationId && live && "bg-accent",
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                  {plan.sequence}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{plan.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {record && record.status !== "pending"
                      ? `${n(record.deliveredQuantity)} dropped · ${n(record.pickedUpQuantity)} picked up`
                      : `${plan.plannedQuantity} papers`}
                  </span>
                </span>
                {pendingFor(plan.locationId) && <CloudOff className="h-4 w-4 shrink-0 text-amber-600" aria-label="Saved on phone, not synced" />}
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", STOP_STATUS_STYLE[record?.status ?? "pending"])}>
                  {record?.status ?? "pending"}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      {(run.status === "in_progress" || run.status === "interrupted") && (
        <FinishCard
          loaded={run.loadedCopies}
          dropped={dropped}
          canInterrupt={run.status === "in_progress"}
          onFinish={(body) => runAction({ action: "finish", ...body }, "completed")}
          onInterrupt={(reason) => runAction({ action: "interrupt", reason }, "interrupted")}
        />
      )}

      {run.status === "completed" && (
        <div className="rounded-lg border p-3 text-sm">
          <div className="font-medium">Run completed {formatDateTime(run.completedAt)}</div>
          <div className="mt-1 text-muted-foreground">
            Loaded {n(run.loadedCopies)} · dropped {n(dropped)} · returned {n(run.returnedCopies)} · damaged{" "}
            {n(run.damagedCopies)} · old papers picked up {n(pickedUp)}
          </div>
          {run.loadedCopies != null && (
            <UnaccountedNote
              value={run.loadedCopies - dropped - (run.returnedCopies ?? 0) - (run.damagedCopies ?? 0)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function UnaccountedNote({ value }: { value: number }) {
  if (value === 0) return <div className="mt-1 text-emerald-700">All copies accounted for.</div>;
  return (
    <div className="mt-1 flex items-center gap-1 text-red-700">
      <TriangleAlert className="h-4 w-4" /> {Math.abs(value)} cop{Math.abs(value) === 1 ? "y" : "ies"}{" "}
      {value > 0 ? "unaccounted for" : "more than loaded"}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function StartCard({
  planned,
  loaded,
  interruptedReason,
  resume,
  onLoad,
  onStart,
}: {
  planned: number;
  loaded: number | null;
  interruptedReason: string;
  resume: boolean;
  onLoad: (n: number) => void;
  onStart: () => void;
}) {
  const [value, setValue] = useState(String(loaded ?? planned));
  const changed = Number(value) !== loaded;

  return (
    <div className="space-y-3 rounded-xl border p-4">
      {interruptedReason && (
        <div className="rounded-md bg-red-50 p-2 text-sm text-red-800">Stopped earlier: {interruptedReason}</div>
      )}
      <label className="block text-sm font-medium">
        Papers loaded into the vehicle
        <div className="mt-1 flex gap-2">
          <Input type="number" inputMode="numeric" min={0} value={value} onChange={(e) => setValue(e.target.value)} className="h-11 text-lg" />
          <Button variant="outline" className="h-11" disabled={!changed || value === ""} onClick={() => onLoad(Number(value))}>
            Save
          </Button>
        </div>
        <span className="text-xs font-normal text-muted-foreground">Planned for this run: {planned}</span>
      </label>
      <Button
        className="h-12 w-full text-base"
        onClick={() => {
          if (changed && value !== "") onLoad(Number(value));
          onStart();
        }}
      >
        {resume ? "Resume run" : "Start run"}
      </Button>
    </div>
  );
}

type StopFields = {
  status: "delivered" | "partial" | "skipped";
  deliveredQuantity: number | null;
  pickedUpQuantity: number | null;
  reason: string;
  notes: string;
};

function StopCard({
  stop,
  record,
  isNext,
  waitingSync,
  onSave,
}: {
  stop: RunDetail["run"]["stops"][number];
  record: StopRecord | undefined;
  isNext: boolean;
  waitingSync: boolean;
  onSave: (fields: StopFields) => void;
}) {
  const already = record && record.status !== "pending";
  const [status, setStatus] = useState<StopFields["status"]>(already ? (record!.status as StopFields["status"]) : "delivered");
  const [dropped, setDropped] = useState(String(already ? record!.deliveredQuantity ?? "" : stop.plannedQuantity));
  const [pickedUp, setPickedUp] = useState(already && record!.pickedUpQuantity != null ? String(record!.pickedUpQuantity) : "");
  const [reason, setReason] = useState(already ? record!.reason : "");
  const [notes, setNotes] = useState(already ? record!.notes : "");
  const [error, setError] = useState("");

  const needsReason = status !== "delivered";

  function save() {
    if (needsReason && !reason.trim()) {
      setError(`Choose a reason for a ${status} stop`);
      return;
    }
    if (status === "partial" && (dropped === "" || Number(dropped) >= stop.plannedQuantity)) {
      setError(`Partial means fewer than ${stop.plannedQuantity} papers — enter how many were dropped`);
      return;
    }
    setError("");
    onSave({
      status,
      deliveredQuantity: status === "skipped" ? 0 : dropped === "" ? stop.plannedQuantity : Number(dropped),
      pickedUpQuantity: pickedUp === "" ? 0 : Number(pickedUp),
      reason: reason.trim(),
      notes: notes.trim(),
    });
  }

  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`;

  return (
    <div className="space-y-3 rounded-xl border-2 border-blue-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase text-blue-700">
            {isNext ? "Next stop" : "Stop"} {stop.sequence}
            {already && " · recorded"}
            {waitingSync && " · saved on phone"}
          </div>
          <div className="text-lg font-semibold leading-tight">{stop.label}</div>
          <div className="mt-0.5 flex items-start gap-1 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {stop.address}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold tabular-nums">{stop.plannedQuantity}</div>
          <div className="text-[11px] text-muted-foreground">papers</div>
        </div>
      </div>

      {stop.instructions && <p className="whitespace-pre-wrap rounded-md bg-muted p-2 text-sm">{stop.instructions}</p>}

      <div className="flex gap-2">
        <Button asChild className="h-11 flex-1" variant="outline">
          <a href={navUrl} target="_blank" rel="noreferrer">
            <Navigation className="h-4 w-4" /> Navigate
          </a>
        </Button>
        {stop.contact?.phone && (
          <Button asChild className="h-11" variant="outline">
            <a href={`tel:${stop.contact.phone}`} aria-label={`Call ${stop.contact.name || "contact"}`}>
              <Phone className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(["delivered", "partial", "skipped"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(s);
              if (s === "delivered") setDropped(String(stop.plannedQuantity));
            }}
            className={cn(
              "h-11 rounded-lg border text-sm font-semibold capitalize",
              status === s
                ? s === "delivered"
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : s === "partial"
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-red-600 bg-red-600 text-white"
                : "bg-background",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm font-medium">
          New papers dropped
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={status === "skipped" ? "0" : dropped}
            onChange={(e) => setDropped(e.target.value)}
            disabled={status === "skipped"}
            className="mt-1 h-11 text-lg"
          />
        </label>
        <label className="text-sm font-medium">
          Old papers picked up
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={pickedUp}
            onChange={(e) => setPickedUp(e.target.value)}
            placeholder="0"
            className="mt-1 h-11 text-lg"
          />
        </label>
      </div>

      {needsReason && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={cn("rounded-full border px-3 py-1 text-xs", reason === r && "border-primary bg-primary text-primary-foreground")}
              >
                {r}
              </button>
            ))}
          </div>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" maxLength={500} />
        </div>
      )}

      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} maxLength={1000} />

      {error && <div className="text-sm text-red-700">{error}</div>}

      <Button className="h-12 w-full text-base" onClick={save}>
        <Check className="h-5 w-5" /> {already ? "Update stop" : "Save & next stop"}
      </Button>
    </div>
  );
}

function FinishCard({
  loaded,
  dropped,
  canInterrupt,
  onFinish,
  onInterrupt,
}: {
  loaded: number | null;
  dropped: number;
  canInterrupt: boolean;
  onFinish: (body: { returnedCopies: number; damagedCopies: number; loadedCopies?: number; notes: string }) => void;
  onInterrupt: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [returned, setReturned] = useState("");
  const [damaged, setDamaged] = useState("");
  const [loadedValue, setLoadedValue] = useState(loaded == null ? "" : String(loaded));
  const [notes, setNotes] = useState("");

  const loadedNum = loadedValue === "" ? null : Number(loadedValue);
  const unaccounted = loadedNum == null ? null : loadedNum - dropped - Number(returned || 0) - Number(damaged || 0);

  if (!open) {
    return (
      <div className="flex gap-2">
        <Button variant="outline" className="h-11 flex-1" onClick={() => setOpen(true)}>
          Finish run
        </Button>
        {canInterrupt && (
          <Button
            variant="ghost"
            className="h-11 text-red-700"
            onClick={() => {
              const reason = window.prompt("Why are you stopping the run early?")?.trim();
              if (reason) onInterrupt(reason);
            }}
          >
            Stop early
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="font-semibold">Finish run</div>
      <p className="text-xs text-muted-foreground">
        Stops not recorded will be marked as skipped. Old papers picked up are counted per stop, not here.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs font-medium">
          Loaded
          <Input type="number" inputMode="numeric" min={0} value={loadedValue} onChange={(e) => setLoadedValue(e.target.value)} className="mt-1 h-11" />
        </label>
        <label className="text-xs font-medium">
          Returned (today&apos;s)
          <Input type="number" inputMode="numeric" min={0} value={returned} onChange={(e) => setReturned(e.target.value)} placeholder="0" className="mt-1 h-11" />
        </label>
        <label className="text-xs font-medium">
          Damaged
          <Input type="number" inputMode="numeric" min={0} value={damaged} onChange={(e) => setDamaged(e.target.value)} placeholder="0" className="mt-1 h-11" />
        </label>
      </div>
      {unaccounted != null && <UnaccountedNote value={unaccounted} />}
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for the dispatcher (optional)" rows={2} />
      <div className="flex gap-2">
        <Button variant="ghost" className="h-11" onClick={() => setOpen(false)}>
          Back
        </Button>
        <Button
          className="h-11 flex-1"
          disabled={loadedNum == null}
          onClick={() =>
            onFinish({
              returnedCopies: Number(returned || 0),
              damagedCopies: Number(damaged || 0),
              ...(loadedNum != null && loadedNum !== loaded ? { loadedCopies: loadedNum } : {}),
              notes,
            })
          }
        >
          Complete run
        </Button>
      </div>
    </div>
  );
}
