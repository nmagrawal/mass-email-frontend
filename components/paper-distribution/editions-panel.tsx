"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Plus, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  QUICK_REASONS,
  RUN_STATUS_LABEL,
  RUN_STATUS_STYLE,
  STOP_STATUS_STYLE,
  formatDate,
  formatDateTime,
  n,
  toDateInput,
  type Driver,
  type Edition,
  type EditionDetail,
  type RunWithTotals,
  type StopRecord,
} from "./delivery-types";
import { postJson, readJson, type City, type RouteTemplate } from "./types";

type Props = {
  city: City;
  savedRoutes: RouteTemplate[];
  /* Select (and reload) this edition, e.g. after a custom run was created. */
  focus?: { editionId: string; nonce: number } | null;
  onPlanRun?: (edition: Edition) => void;
};

export function EditionsPanel({ city, savedRoutes, focus, onPlanRun }: Props) {
  const [editions, setEditions] = useState<Edition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  const loadEditions = useCallback(async () => {
    try {
      const data = await readJson<{ editions: Edition[] }>(
        await fetch(`/api/paper/editions?cityId=${encodeURIComponent(city.id)}`),
      );
      setEditions(data.editions);
      setSelectedId((id) => id ?? data.editions[0]?.id ?? null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [city.id]);

  useEffect(() => {
    setLoading(true);
    setSelectedId(null);
    loadEditions();
  }, [loadEditions]);

  useEffect(() => {
    if (focus) setSelectedId(focus.editionId);
  }, [focus]);

  useEffect(() => {
    fetch("/api/paper/drivers")
      .then((r) => readJson<{ drivers: Driver[] }>(r))
      .then((d) => setDrivers(d.drivers))
      .catch(() => setDrivers([]));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="w-full shrink-0 border-b lg:w-80 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Editions · {city.name}</span>
          <Button size="sm" variant="ghost" onClick={() => setCreating((c) => !c)}>
            <Plus className="h-4 w-4" /> New
          </Button>
        </div>
        {creating && (
          <NewEditionForm
            cityId={city.id}
            onCreated={(e) => {
              setEditions((prev) => [e, ...prev].sort((a, b) => b.publishDate.localeCompare(a.publishDate)));
              setSelectedId(e.id);
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        )}
        {error && <div className="m-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div className="max-h-64 overflow-y-auto lg:max-h-none">
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : editions.length === 0 && !creating ? (
            <div className="p-4 text-sm text-muted-foreground">
              No editions yet. Create one for this week&apos;s round.
            </div>
          ) : (
            <ul className="divide-y">
              {editions.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(e.id)}
                    className={cn("w-full px-3 py-2.5 text-left hover:bg-accent", selectedId === e.id && "bg-accent")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{e.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{e.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(e.publishDate)} · {n(e.summary?.allocated)}/{n(e.copiesAvailable)} allocated ·{" "}
                      {n(e.summary?.delivered)} dropped · {n(e.summary?.pickedUp)} picked up
                    </div>
                    {!!e.summary?.unassignedRuns && (
                      <div className="text-xs text-amber-700">{e.summary.unassignedRuns} run(s) without a driver</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className="min-h-0 flex-1 overflow-y-auto">
        {selectedId ? (
          <EditionDetailView
            key={`${selectedId}:${focus?.editionId === selectedId ? focus.nonce : 0}`}
            onPlanRun={onPlanRun}
            editionId={selectedId}
            savedRoutes={savedRoutes.filter((r) => r.status === "active")}
            drivers={drivers}
            onEditionChanged={(e) =>
              setEditions((prev) => prev.map((x) => (x.id === e.id ? { ...x, ...e, summary: e.summary ?? x.summary } : x)))
            }
          />
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">Select or create an edition.</div>
        )}
      </section>
    </div>
  );
}

function NewEditionForm({
  cityId,
  onCreated,
  onCancel,
}: {
  cityId: string;
  onCreated: (e: Edition) => void;
  onCancel: () => void;
}) {
  const today = new Date();
  const [date, setDate] = useState(toDateInput(today));
  const [name, setName] = useState(`Week of ${today.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`);
  const [copies, setCopies] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data = await readJson<{ edition: Edition }>(
        await postJson("/api/paper/editions", {
          cityId,
          name,
          // Noon local time so the date doesn't shift across time zones.
          publishDate: new Date(`${date}T12:00:00`).toISOString(),
          copiesAvailable: Number(copies || 0),
        }),
      );
      onCreated(data.edition);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 border-b bg-muted/40 p-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Edition name" required maxLength={120} />
      <div className="flex gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Input
          type="number"
          min={0}
          value={copies}
          onChange={(e) => setCopies(e.target.value)}
          placeholder="Copies available"
          inputMode="numeric"
        />
      </div>
      {error && <div className="text-xs text-red-700">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create
        </Button>
      </div>
    </form>
  );
}

function EditionDetailView({
  editionId,
  savedRoutes,
  drivers,
  onEditionChanged,
  onPlanRun,
}: {
  onPlanRun?: (edition: Edition) => void;
  editionId: string;
  savedRoutes: RouteTemplate[];
  drivers: Driver[];
  onEditionChanged: (e: Edition) => void;
}) {
  const [detail, setDetail] = useState<EditionDetail | null>(null);
  const [error, setError] = useState("");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await readJson<EditionDetail>(await fetch(`/api/paper/editions/${editionId}`));
      setDetail(data);
      onEditionChanged({
        ...data.edition,
        summary: {
          runs: data.totals.runs,
          unassignedRuns: data.totals.unassignedRuns,
          completedRuns: data.totals.completedRuns,
          allocated: data.totals.allocated,
          delivered: data.totals.delivered,
          pickedUp: data.totals.pickedUp,
        },
      });
    } catch (err: any) {
      setError(err.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Live-ish updates while drivers are out.
  const anyLive = detail?.runs.some((r) => r.status === "in_progress" || r.status === "interrupted");
  useEffect(() => {
    if (!anyLive) return;
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [anyLive, load]);

  async function patchEdition(body: Record<string, unknown>) {
    setError("");
    try {
      await readJson(await postJson(`/api/paper/editions/${editionId}`, body, "PATCH"));
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (!detail) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        {error || (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading edition…
          </>
        )}
      </div>
    );
  }

  const { edition, totals, runs, stops, duplicates } = detail;
  const stopsByRun = new Map<string, StopRecord[]>();
  for (const s of stops) stopsByRun.set(s.runId, [...(stopsByRun.get(s.runId) ?? []), s]);

  return (
    <div className="space-y-4 p-3 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{edition.name}</h2>
          <div className="text-sm text-muted-foreground">{formatDate(edition.publishDate)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Copies available
            <Input
              type="number"
              min={0}
              defaultValue={edition.copiesAvailable}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (Number.isInteger(v) && v !== edition.copiesAvailable) patchEdition({ copiesAvailable: v });
              }}
              className="h-8 w-24"
            />
          </label>
          <select
            value={edition.status}
            onChange={(e) => patchEdition({ status: e.target.value })}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            <option value="planning">Planning</option>
            <option value="distributing">Distributing</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Stat label="Available" value={n(totals.copiesAvailable)} />
        <Stat label="Allocated" value={n(totals.allocated)} />
        <Stat
          label="Unallocated"
          value={n(totals.unallocated)}
          tone={totals.unallocated < 0 ? "bad" : undefined}
        />
        <Stat label="Loaded" value={n(totals.loaded)} />
        <Stat label="Dropped" value={n(totals.delivered)} tone="good" />
        <Stat label="Old picked up" value={n(totals.pickedUp)} />
        <Stat label="Returned / damaged" value={`${n(totals.returned)} / ${n(totals.damaged)}`} />
        <Stat
          label="Unaccounted"
          value={n(totals.unaccounted)}
          tone={totals.unaccounted !== 0 ? "bad" : undefined}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        {totals.runs} run(s) · {totals.unassignedRuns} without driver · {totals.inProgressRuns} in progress ·{" "}
        {totals.completedRuns} completed
      </div>

      {duplicates.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <TriangleAlert className="h-4 w-4" /> Locations in more than one run
          </div>
          <ul className="mt-1 list-disc pl-5">
            {duplicates.map((d) => (
              <li key={d.locationId}>
                {d.label}: {d.runs.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {edition.status !== "closed" && (
        <AddRunForm
          editionId={edition.id}
          savedRoutes={savedRoutes}
          drivers={drivers}
          onCreated={load}
          onPlanCustom={onPlanRun ? () => onPlanRun(edition) : undefined}
        />
      )}

      <div className="space-y-2">
        {runs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No runs yet. Add one from a saved route above.
          </div>
        ) : (
          runs.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              stops={stopsByRun.get(run.id) ?? []}
              drivers={drivers}
              expanded={expandedRun === run.id}
              onToggle={() => setExpandedRun((id) => (id === run.id ? null : run.id))}
              onChanged={load}
            />
          ))
        )}
      </div>
    </div>
  );
}

function AddRunForm({
  editionId,
  savedRoutes,
  drivers,
  onCreated,
  onPlanCustom,
}: {
  onPlanCustom?: () => void;
  editionId: string;
  savedRoutes: RouteTemplate[];
  drivers: Driver[];
  onCreated: () => void;
}) {
  const [routeId, setRouteId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<{ label: string; runs: string[] }[]>([]);
  const [notice, setNotice] = useState("");

  async function submit(confirmDuplicates = false) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = await readJson<{ excluded: { label: string; reason: string }[] }>(
        await postJson("/api/paper/runs", { editionId, routeTemplateId: routeId, driverId: driverId || null, confirmDuplicates }),
      );
      setDuplicates([]);
      setRouteId("");
      setDriverId("");
      if (data.excluded.length) {
        setNotice(`Left out: ${data.excluded.map((x) => `${x.label} (${x.reason})`).join(", ")}`);
      }
      onCreated();
    } catch (err: any) {
      if (err.data?.code === "duplicates") setDuplicates(err.data.duplicates);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">Add a run</div>
        {onPlanCustom && (
          <Button size="sm" variant="outline" onClick={onPlanCustom}>
            Plan a custom run (pick stops, first/last, current location)…
          </Button>
        )}
      </div>
      <div className="text-xs text-muted-foreground">Or use a saved route exactly as it is:</div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={routeId}
          onChange={(e) => {
            setRouteId(e.target.value);
            setDuplicates([]);
          }}
          className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Saved route…</option>
          {savedRoutes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.stops.length} stops
            </option>
          ))}
        </select>
        <DriverSelect drivers={drivers} value={driverId} onChange={setDriverId} />
        <Button onClick={() => submit(false)} disabled={!routeId || saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create run
        </Button>
      </div>
      {savedRoutes.length === 0 && (
        <div className="text-xs text-muted-foreground">Save a route in the Plan tab first.</div>
      )}
      {duplicates.length > 0 && (
        <div className="space-y-1 rounded-md bg-amber-50 p-2 text-sm text-amber-900">
          {duplicates.map((d) => (
            <div key={d.label}>
              {d.label} is already in {d.runs.join(", ")}
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => submit(true)} disabled={saving}>
            Create anyway
          </Button>
        </div>
      )}
      {error && duplicates.length === 0 && <div className="text-sm text-red-700">{error}</div>}
      {notice && <div className="text-xs text-amber-700">{notice}</div>}
    </div>
  );
}

function DriverSelect({
  drivers,
  value,
  onChange,
  disabled,
}: {
  drivers: Driver[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="h-9 rounded-md border bg-background px-2 text-sm"
    >
      <option value="">No driver yet</option>
      {drivers.map((d) => (
        <option key={d.clerkUserId} value={d.clerkUserId}>
          {d.name}
          {d.role !== "driver" ? ` (${d.role})` : ""}
        </option>
      ))}
    </select>
  );
}

function RunCard({
  run,
  stops,
  drivers,
  expanded,
  onToggle,
  onChanged,
}: {
  run: RunWithTotals;
  stops: StopRecord[];
  drivers: Driver[];
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [correcting, setCorrecting] = useState<string | null>(null);

  const editable = run.status === "planned" || run.status === "assigned";
  const t = run.totals;
  const recorded = t.deliveredStops + t.partialStops + t.skippedStops;
  const driverOptions = useMemo(() => {
    // Keep the current driver selectable even if their role changed.
    if (run.driver && !drivers.some((d) => d.clerkUserId === run.driver!.clerkUserId)) {
      return [...drivers, { clerkUserId: run.driver.clerkUserId, name: run.driver.name, role: "driver", email: "" }];
    }
    return drivers;
  }, [drivers, run.driver]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError("");
    try {
      await readJson(await postJson(`/api/paper/runs/${run.id}`, { action, ...extra }, "PATCH"));
      setQuantities({});
      onChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const qtyChanges = Object.entries(quantities)
    .filter(([id, v]) => v !== "" && Number(v) !== run.stops.find((s) => s.locationId === id)?.plannedQuantity)
    .map(([locationId, v]) => ({ locationId, quantity: Number(v) }));

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="min-w-0">
            <span className="block truncate font-medium">{run.name}</span>
            <span className="block text-xs text-muted-foreground">
              {t.stops} stops · {recorded}/{t.stops} recorded · {n(t.planned)} planned · {n(t.delivered)} dropped ·{" "}
              {n(t.pickedUp)} picked up
              {t.unaccounted ? ` · ${t.unaccounted} unaccounted` : ""}
            </span>
          </span>
        </button>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", RUN_STATUS_STYLE[run.status])}>
          {RUN_STATUS_LABEL[run.status]}
        </span>
        {run.status !== "completed" && run.status !== "cancelled" ? (
          <DriverSelect
            drivers={driverOptions}
            value={run.driver?.clerkUserId ?? ""}
            onChange={(id) => act("assign", { driverId: id || null })}
            disabled={Boolean(busy)}
          />
        ) : (
          <span className="text-sm text-muted-foreground">{run.driver?.name ?? "—"}</span>
        )}
      </div>

      {run.interruptedReason && run.status === "interrupted" && (
        <div className="mx-3 mb-2 rounded-md bg-red-50 p-2 text-sm text-red-800">Stopped: {run.interruptedReason}</div>
      )}
      {error && <div className="mx-3 mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>}

      {expanded && (
        <div className="border-t p-3">
          <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Loaded {n(t.loaded)}</span>·<span>Returned {n(t.returned)}</span>·<span>Damaged {n(t.damaged)}</span>
            {run.startedAt && <>· <span>Started {formatDateTime(run.startedAt)}</span></>}
            {run.completedAt && <>· <span>Finished {formatDateTime(run.completedAt)}</span></>}
            <span>· Snapshot {formatDateTime(run.snapshotAt)}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">Location</th>
                  <th className="py-1 pr-2 text-right">Planned</th>
                  <th className="py-1 pr-2">Status</th>
                  <th className="py-1 pr-2 text-right">Dropped</th>
                  <th className="py-1 pr-2 text-right">Old picked up</th>
                  <th className="py-1 pr-2">Reason / notes</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {run.stops.map((s) => {
                  const rec = stops.find((x) => x.locationId === s.locationId);
                  return (
                    <tr key={s.locationId} className="align-top">
                      <td className="py-1.5 pr-2 tabular-nums">{s.sequence}</td>
                      <td className="py-1.5 pr-2">
                        <div className="font-medium">{s.label}</div>
                        {rec?.recordedBy && (
                          <div className="text-[11px] text-muted-foreground">
                            {rec.recordedBy} · {formatDateTime(rec.recordedAt)}
                            {rec.corrections.length ? ` · ${rec.corrections.length} correction(s)` : ""}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        {editable ? (
                          <Input
                            type="number"
                            min={0}
                            value={quantities[s.locationId] ?? String(s.plannedQuantity)}
                            onChange={(e) => setQuantities((q) => ({ ...q, [s.locationId]: e.target.value }))}
                            className="ml-auto h-7 w-16 px-1 text-right"
                          />
                        ) : (
                          s.plannedQuantity
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs", STOP_STATUS_STYLE[rec?.status ?? "pending"])}>
                          {rec?.status ?? "pending"}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{n(rec?.deliveredQuantity)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{n(rec?.pickedUpQuantity)}</td>
                      <td className="py-1.5 pr-2 text-xs">
                        {rec?.reason}
                        {rec?.notes ? <div className="text-muted-foreground">{rec.notes}</div> : null}
                      </td>
                      <td className="py-1.5 text-right">
                        {editable ? (
                          <button
                            type="button"
                            onClick={() => act("remove_stop", { locationId: s.locationId })}
                            disabled={Boolean(busy)}
                            aria-label="Remove stop"
                          >
                            <X className="h-4 w-4 text-muted-foreground" />
                          </button>
                        ) : rec && rec.status !== "pending" ? (
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setCorrecting(rec.locationId)}>
                            Correct
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {correcting && (
            <CorrectionForm
              runId={run.id}
              record={stops.find((x) => x.locationId === correcting)!}
              onClose={() => setCorrecting(null)}
              onSaved={() => {
                setCorrecting(null);
                onChanged();
              }}
            />
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {editable && qtyChanges.length > 0 && (
              <Button size="sm" onClick={() => act("set_quantities", { quantities: qtyChanges })} disabled={Boolean(busy)}>
                {busy === "set_quantities" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save quantities
              </Button>
            )}
            <Button size="sm" variant="outline" asChild>
              <a href={`/driver?run=${run.id}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Driver view
              </a>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const name = window.prompt("Run name", run.name)?.trim();
                if (name && name !== run.name) act("rename", { name });
              }}
            >
              Rename
            </Button>
            {editable && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-700"
                onClick={() => window.confirm(`Cancel “${run.name}”?`) && act("cancel")}
                disabled={Boolean(busy)}
              >
                Cancel run
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CorrectionForm({
  runId,
  record,
  onClose,
  onSaved,
}: {
  runId: string;
  record: StopRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState(record.status === "pending" ? "delivered" : record.status);
  const [dropped, setDropped] = useState(String(record.deliveredQuantity ?? record.plannedQuantity));
  const [pickedUp, setPickedUp] = useState(String(record.pickedUpQuantity ?? 0));
  const [stopReason, setStopReason] = useState(record.reason);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await readJson(
        await postJson(
          `/api/paper/runs/${runId}/stops/${record.locationId}`,
          {
            correction: true,
            reason,
            status,
            deliveredQuantity: status === "skipped" ? 0 : Number(dropped),
            pickedUpQuantity: Number(pickedUp),
            stopReason,
          },
          "PATCH",
        ),
      );
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
      <div className="font-medium">Correct “{record.locationLabel}”</div>
      <div className="text-xs text-muted-foreground">
        The original values are kept in the correction history.
        {record.corrections.length > 0 &&
          ` Previous: ${record.corrections
            .map((c) => `${c.by} ${formatDateTime(c.at)} — ${c.reason}`)
            .join("; ")}`}
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-9 rounded-md border bg-background px-2">
          <option value="delivered">Delivered</option>
          <option value="partial">Partial</option>
          <option value="skipped">Skipped</option>
        </select>
        <Input type="number" min={0} value={dropped} onChange={(e) => setDropped(e.target.value)} disabled={status === "skipped"} placeholder="Dropped" />
        <Input type="number" min={0} value={pickedUp} onChange={(e) => setPickedUp(e.target.value)} placeholder="Old picked up" />
        <Input value={stopReason} onChange={(e) => setStopReason(e.target.value)} placeholder="Stop reason" list="quick-reasons" />
        <datalist id="quick-reasons">
          {QUICK_REASONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </div>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being corrected?" required />
      {error && <div className="text-red-700">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving || !reason.trim()}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save correction
        </Button>
      </div>
    </form>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-semibold tabular-nums",
          tone === "bad" && "text-red-700",
          tone === "good" && "text-emerald-700",
        )}
      >
        {value}
      </div>
    </div>
  );
}
