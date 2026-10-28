"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Loader2,
  RefreshCw,
  Route as RouteIcon,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { RoutePointPicker } from "./route-point-picker";
import {
  formatClock,
  formatDuration,
  formatMiles,
  postJson,
  readJson,
  type City,
  type ComputedRoute,
  type DropLocation,
  type PlannedStop,
  type RoutePointValue,
  type RouteTemplate,
  type Unroutable,
} from "./types";

export const MAX_ROUTE_STOPS = 25;

export type Plan = {
  stops: PlannedStop[];
  start: RoutePointValue | null;
  finish: { returnToStart: boolean; point: RoutePointValue | null };
  optimize: boolean;
  departure: string; // datetime-local value, "" = not set
  defaultStopMinutes: number;
  /* Fixed first / last stop when optimizing — Google orders the rest. */
  firstStopId: string | null;
  lastStopId: string | null;
};

export type RunTarget = { editionId: string; editionName: string };

/* Anything that changes the road path. Quantities and stop minutes don't. */
export function routeSignature(plan: Plan) {
  const p = (x: RoutePointValue | null) => (x ? `${x.type}:${x.locationId ?? ""}:${x.lat},${x.lng}` : "");
  return JSON.stringify([
    plan.stops.map((s) => s.locationId),
    p(plan.start),
    plan.finish.returnToStart ? "return" : p(plan.finish.point),
    plan.optimize,
    plan.optimize ? [plan.firstStopId, plan.lastStopId] : null,
    plan.departure,
  ]);
}

type Props = {
  city: City;
  plan: Plan;
  setPlan: (update: (plan: Plan) => Plan) => void;
  computed: { route: ComputedRoute; signature: string } | null;
  setComputed: (value: { route: ComputedRoute; signature: string } | null) => void;
  locationsById: Map<string, DropLocation>;
  locations: DropLocation[];
  savedRoutes: RouteTemplate[];
  activeRouteId: string | null;
  onRouteSaved: (route: RouteTemplate) => void;
  onLoadRoute: (route: RouteTemplate) => void;
  onNewRoute: () => void;
  onCityUpdated: (city: City) => void;
  onFocusLocation: (id: string) => void;
  /* Set when planning a run for an edition (Editions & runs → Plan a custom run). */
  runTarget?: RunTarget | null;
  drivers?: { clerkUserId: string; name: string; role: string }[];
  onRunCreated?: (editionId: string, message: string) => void;
  onCancelRun?: () => void;
};

export function RoutePlanner({
  city,
  plan,
  setPlan,
  computed,
  setComputed,
  locationsById,
  locations,
  savedRoutes,
  activeRouteId,
  onRouteSaved,
  onLoadRoute,
  onNewRoute,
  onCityUpdated,
  onFocusLocation,
  runTarget = null,
  drivers = [],
  onRunCreated,
  onCancelRun,
}: Props) {
  const [runName, setRunName] = useState("");
  const [driverId, setDriverId] = useState("");
  const [saveAsRoute, setSaveAsRoute] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [creatingRun, setCreatingRun] = useState(false);
  const [runDuplicates, setRunDuplicates] = useState<{ label: string; runs: string[] }[]>([]);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState("");
  const [unroutable, setUnroutable] = useState<Unroutable[]>([]);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const activeRoute = savedRoutes.find((r) => r.id === activeRouteId) || null;
  const selectedIds = new Set(plan.stops.map((s) => s.locationId));
  const pinnedFirst = plan.firstStopId && selectedIds.has(plan.firstStopId) ? plan.firstStopId : null;
  const pinnedLast =
    plan.lastStopId && selectedIds.has(plan.lastStopId) && plan.lastStopId !== pinnedFirst ? plan.lastStopId : null;
  const stale = Boolean(computed && computed.signature !== routeSignature(plan));
  const route = computed && !stale ? computed.route : null;

  const quantityOf = (s: PlannedStop) => s.quantity ?? locationsById.get(s.locationId)?.defaultQuantity ?? 0;
  const minutesOf = (s: PlannedStop) => s.stopMinutes ?? plan.defaultStopMinutes;

  const totals = useMemo(() => {
    const papers = plan.stops.reduce((sum, s) => sum + quantityOf(s), 0);
    const unloadingSeconds = plan.stops.reduce((sum, s) => sum + minutesOf(s) * 60, 0);
    return { papers, unloadingSeconds };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, locationsById]);

  // Arrival time at each stop, when a departure time is set and the route is current.
  const arrivals = useMemo(() => {
    if (!route || !plan.departure) return null;
    const departure = new Date(plan.departure);
    if (Number.isNaN(departure.getTime())) return null;
    let t = departure.getTime();
    const times = plan.stops.map((s, i) => {
      t += (route.legs[i]?.durationSeconds ?? 0) * 1000;
      const arrive = new Date(t);
      t += minutesOf(s) * 60 * 1000;
      return arrive;
    });
    const finish = new Date(t + (route.legs[plan.stops.length]?.durationSeconds ?? 0) * 1000);
    return { times, finish };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, plan]);

  function moveStop(from: number, to: number) {
    if (to < 0 || to >= plan.stops.length || from === to) return;
    setPlan((p) => {
      const stops = [...p.stops];
      const [moved] = stops.splice(from, 1);
      stops.splice(to, 0, moved);
      // A manual order would be thrown away by re-optimizing.
      return { ...p, stops, optimize: false };
    });
  }

  function updateStop(index: number, patch: Partial<PlannedStop>) {
    setPlan((p) => ({ ...p, stops: p.stops.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  }

  function removeStop(locationId: string) {
    setPlan((p) => ({
      ...p,
      stops: p.stops.filter((s) => s.locationId !== locationId),
      firstStopId: p.firstStopId === locationId ? null : p.firstStopId,
      lastStopId: p.lastStopId === locationId ? null : p.lastStopId,
    }));
    setUnroutable((u) => u.filter((x) => x.locationId !== locationId));
  }

  async function compute() {
    setComputing(true);
    setError("");
    setUnroutable([]);
    try {
      const data = await readJson<ComputedRoute>(
        await postJson("/api/paper/route/compute", {
          cityId: city.id,
          start: plan.start,
          finish: plan.finish,
          stops: plan.stops.map((s) => s.locationId),
          optimize: plan.optimize,
          firstStopId: plan.optimize ? pinnedFirst : null,
          lastStopId: plan.optimize ? pinnedLast : null,
          departureTime: plan.departure ? new Date(plan.departure).toISOString() : null,
        }),
      );

      // Show stops in the order the route visits them.
      const byId = new Map(plan.stops.map((s) => [s.locationId, s]));
      const ordered = data.orderedLocationIds.map((id) => byId.get(id)!).filter(Boolean);
      const nextPlan = { ...plan, stops: ordered };
      setPlan(() => nextPlan);
      setComputed({ route: data, signature: routeSignature(nextPlan) });
    } catch (err: any) {
      if (err.data?.code === "unroutable") setUnroutable(err.data.unroutable);
      setError(err.message);
    } finally {
      setComputing(false);
    }
  }

  function payload() {
    return {
      stops: plan.stops.map((s) => ({ locationId: s.locationId, quantity: s.quantity, stopMinutes: s.stopMinutes })),
      start: plan.start,
      finish: plan.finish,
      optimize: plan.optimize,
      firstLocationId: plan.optimize ? pinnedFirst : null,
      lastLocationId: plan.optimize ? pinnedLast : null,
      defaultStopMinutes: plan.defaultStopMinutes,
      lastSummary: route ? { distanceMeters: route.distanceMeters, driveSeconds: route.driveSeconds } : null,
    };
  }

  async function save(asNew: boolean) {
    setSaving(true);
    setError("");
    try {
      const data = asNew
        ? await readJson<{ route: RouteTemplate }>(
            await postJson("/api/paper/route-templates", { cityId: city.id, name: newName, ...payload() }),
          )
        : await readJson<{ route: RouteTemplate }>(
            await postJson(`/api/paper/route-templates/${activeRouteId}`, payload(), "PATCH"),
          );
      onRouteSaved(data.route);
      setNewName("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function createRun(confirmDuplicates: boolean) {
    if (!runTarget || !route) return;
    setCreatingRun(true);
    setError("");
    try {
      const data = await readJson<{ run: { name: string }; savedRoute: RouteTemplate | { id: string; name: string } | null }>(
        await postJson("/api/paper/runs", {
          editionId: runTarget.editionId,
          name: runName.trim() || activeRoute?.name || "",
          routeTemplateId: activeRouteId,
          driverId: driverId || null,
          confirmDuplicates,
          saveAsRoute: saveAsRoute ? { name: routeName.trim() } : null,
          ...payload(),
        }),
      );
      setRunDuplicates([]);
      onRunCreated?.(
        runTarget.editionId,
        `Created “${data.run.name}” with ${plan.stops.length} stops${data.savedRoute ? ` and saved route “${data.savedRoute.name}”` : ""}.`,
      );
    } catch (err: any) {
      if (err.data?.code === "duplicates") setRunDuplicates(err.data.duplicates);
      if (err.data?.code === "unroutable") setUnroutable(err.data.unroutable);
      setError(err.message);
    } finally {
      setCreatingRun(false);
    }
  }

  async function routeAction(r: RouteTemplate, action: "rename" | "duplicate" | "archive" | "restore") {
    setError("");
    try {
      let data: { route: RouteTemplate };
      if (action === "duplicate") {
        data = await readJson(await postJson("/api/paper/route-templates", { duplicateOf: r.id }));
      } else if (action === "rename") {
        const name = window.prompt("Route name", r.name)?.trim();
        if (!name || name === r.name) return;
        data = await readJson(await postJson(`/api/paper/route-templates/${r.id}`, { name }, "PATCH"));
      } else {
        data = await readJson(
          await postJson(
            `/api/paper/route-templates/${r.id}`,
            { status: action === "archive" ? "archived" : "active" },
            "PATCH",
          ),
        );
      }
      onRouteSaved(data.route);
    } catch (err: any) {
      setError(err.message);
    }
  }

  const tooMany = plan.stops.length > MAX_ROUTE_STOPS;
  const canCompute =
    plan.stops.length > 0 && !tooMany && plan.start && (plan.finish.returnToStart || plan.finish.point) && !computing;
  const activeSaved = savedRoutes.filter((r) => r.status === "active");
  const archivedSaved = savedRoutes.filter((r) => r.status === "archived");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Saved routes */}
      <div className="space-y-2 border-b p-3">
        <div className="flex items-center gap-2">
          <select
            value={activeRouteId ?? ""}
            onChange={(e) => {
              const r = savedRoutes.find((x) => x.id === e.target.value);
              if (r) onLoadRoute(r);
              else onNewRoute();
            }}
            className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">New route (unsaved)</option>
            {activeSaved.length > 0 && (
              <optgroup label="Saved routes">
                {activeSaved.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.stops.length} stops
                  </option>
                ))}
              </optgroup>
            )}
            {showArchived && archivedSaved.length > 0 && (
              <optgroup label="Archived">
                {archivedSaved.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} (archived)
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {archivedSaved.length > 0 && (
            <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Archived
            </label>
          )}
        </div>
        {activeRoute && (
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="mr-1 text-muted-foreground">
              {activeRoute.updatedBy ? `Saved by ${activeRoute.updatedBy}` : "Saved"}
            </span>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => routeAction(activeRoute, "rename")}>
              Rename
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => routeAction(activeRoute, "duplicate")}>
              Duplicate
            </Button>
            {activeRoute.status === "active" ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-red-700"
                onClick={() => routeAction(activeRoute, "archive")}
              >
                Archive
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => routeAction(activeRoute, "restore")}>
                Restore
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {/* Settings */}
        <RoutePointPicker
          label="Start"
          city={city}
          value={plan.start}
          locations={locations}
          onChange={(start) => setPlan((p) => ({ ...p, start }))}
          onCityUpdated={onCityUpdated}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Finish</span>
            <select
              value={plan.finish.returnToStart ? "return" : "elsewhere"}
              onChange={(e) =>
                setPlan((p) => ({ ...p, finish: { returnToStart: e.target.value === "return", point: null } }))
              }
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="return">Return to start</option>
              <option value="elsewhere">Finish elsewhere</option>
            </select>
          </div>
          {!plan.finish.returnToStart && (
            <RoutePointPicker
              label="Finish at"
              city={city}
              value={plan.finish.point}
              locations={locations}
              onChange={(point) => setPlan((p) => ({ ...p, finish: { returnToStart: false, point } }))}
              onCityUpdated={onCityUpdated}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            <span>Stop order</span>
            <select
              value={plan.optimize ? "optimize" : "manual"}
              onChange={(e) => setPlan((p) => ({ ...p, optimize: e.target.value === "optimize" }))}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
            >
              <option value="optimize">Optimize (suggest order)</option>
              <option value="manual">Manual (as listed)</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            <span>Minutes per stop</span>
            <Input
              type="number"
              min={0}
              max={240}
              value={plan.defaultStopMinutes}
              onChange={(e) => setPlan((p) => ({ ...p, defaultStopMinutes: Math.max(0, Number(e.target.value) || 0) }))}
            />
          </label>
          {plan.optimize && plan.stops.length > 1 && (
            <>
              <PinSelect
                label="First stop"
                value={pinnedFirst}
                exclude={pinnedLast}
                plan={plan}
                locationsById={locationsById}
                onChange={(id) => setPlan((p) => ({ ...p, firstStopId: id }))}
              />
              <PinSelect
                label="Last stop"
                value={pinnedLast}
                exclude={pinnedFirst}
                plan={plan}
                locationsById={locationsById}
                onChange={(id) => setPlan((p) => ({ ...p, lastStopId: id }))}
              />
              <p className="col-span-2 -mt-1 text-[11px] text-muted-foreground">
                Google optimizes the order of the other stops
                {pinnedFirst || pinnedLast ? " between the fixed ones" : ""}.
              </p>
            </>
          )}
          <label className="col-span-2 space-y-1 text-xs font-medium text-muted-foreground">
            <span>Departure (optional — uses traffic for future times)</span>
            <Input
              type="datetime-local"
              value={plan.departure}
              onChange={(e) => setPlan((p) => ({ ...p, departure: e.target.value }))}
            />
          </label>
        </div>

        {/* Stops */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>
              Stops ({plan.stops.length}
              {tooMany ? ` — max ${MAX_ROUTE_STOPS}` : ""})
            </span>
            <span>Qty · min</span>
          </div>
          {plan.stops.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Tick locations in the list, or click a pin and choose “Add to route”.
            </div>
          ) : (
            <ol className="space-y-1">
              {plan.stops.map((s, i) => {
                const loc = locationsById.get(s.locationId);
                const problem = unroutable.find((u) => u.locationId === s.locationId);
                return (
                  <li
                    key={s.locationId}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null) moveStop(dragIndex, i);
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border bg-background px-1.5 py-1.5",
                      dragIndex === i && "opacity-50",
                      (problem || (loc && loc.status !== "active")) && "border-red-300 bg-red-50",
                    )}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                      {i + 1}
                    </span>
                    {plan.optimize && (s.locationId === pinnedFirst || s.locationId === pinnedLast) && (
                      <span className="shrink-0 rounded bg-blue-100 px-1 text-[10px] font-semibold uppercase text-blue-800">
                        {s.locationId === pinnedFirst ? "First" : "Last"}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onFocusLocation(s.locationId)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-sm">{loc?.label ?? "Unknown location"}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {problem
                          ? problem.reason
                          : loc && loc.status !== "active"
                            ? `Location is ${loc.status}`
                            : arrivals
                              ? `Arrive ${formatClock(arrivals.times[i])}`
                              : route
                                ? `${formatMiles(route.legs[i]?.distanceMeters ?? 0)} · ${formatDuration(route.legs[i]?.durationSeconds ?? 0)} drive`
                                : loc?.area || ""}
                      </div>
                    </button>
                    <Input
                      type="number"
                      min={0}
                      value={s.quantity ?? ""}
                      placeholder={String(loc?.defaultQuantity ?? 0)}
                      onChange={(e) => updateStop(i, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
                      className="h-7 w-14 px-1 text-center text-xs"
                      aria-label="Quantity for this route"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={s.stopMinutes ?? ""}
                      placeholder={String(plan.defaultStopMinutes)}
                      onChange={(e) => updateStop(i, { stopMinutes: e.target.value === "" ? null : Number(e.target.value) })}
                      className="h-7 w-12 px-1 text-center text-xs"
                      aria-label="Minutes at this stop"
                    />
                    <div className="flex shrink-0 flex-col">
                      <button type="button" onClick={() => moveStop(i, i - 1)} disabled={i === 0} aria-label="Move up" className="disabled:opacity-30">
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStop(i, i + 1)}
                        disabled={i === plan.stops.length - 1}
                        aria-label="Move down"
                        className="disabled:opacity-30"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                    <button type="button" onClick={() => removeStop(s.locationId)} aria-label="Remove stop">
                      <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {unroutable.length > 0 && (
          <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <div className="font-medium">These stops can&apos;t be routed:</div>
            {unroutable.map((u) => (
              <div key={u.locationId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {u.label} — {u.reason}
                </span>
                <Button size="sm" variant="outline" className="h-7" onClick={() => removeStop(u.locationId)}>
                  Exclude
                </Button>
              </div>
            ))}
          </div>
        )}

        {error && unroutable.length === 0 && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Totals */}
        <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 text-sm">
          <Stat label="Newspapers" value={totals.papers.toLocaleString()} />
          <Stat label="Unloading" value={formatDuration(totals.unloadingSeconds)} />
          <Stat label="Driving distance" value={route ? formatMiles(route.distanceMeters) : "—"} />
          <Stat label="Driving time" value={route ? formatDuration(route.driveSeconds) : "—"} />
          <Stat
            label="Total time"
            value={route ? formatDuration(route.driveSeconds + totals.unloadingSeconds) : "—"}
          />
          <Stat label="Back / finish" value={arrivals ? formatClock(arrivals.finish) : "—"} />
          {route?.trafficAware && (
            <div className="col-span-2 text-[11px] text-muted-foreground">Drive times include predicted traffic.</div>
          )}
        </div>

        {stale && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
            <TriangleAlert className="h-4 w-4 shrink-0" /> Stops or settings changed — the map shows the old route.
            Recalculate.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2 border-t p-3">
        <Button className="w-full" onClick={compute} disabled={!canCompute}>
          {computing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : stale ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <RouteIcon className="h-4 w-4" />
          )}
          {stale ? "Recalculate route" : computed ? "Recalculate route" : "Calculate route"}
        </Button>
        {!plan.start && <div className="text-center text-xs text-muted-foreground">Choose a start point first.</div>}

        {runTarget ? (
          <div className="space-y-2 rounded-lg border-2 border-blue-200 bg-blue-50/50 p-2">
            <div className="text-xs font-semibold text-blue-900">Create run for {runTarget.editionName}</div>
            <Input
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
              placeholder={activeRoute ? `Run name (default: ${activeRoute.name})` : "Run name, e.g. East – Tuesday"}
              maxLength={120}
            />
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">No driver yet</option>
              {drivers.map((d) => (
                <option key={d.clerkUserId} value={d.clerkUserId}>
                  {d.name}
                  {d.role !== "driver" ? ` (${d.role})` : ""}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={saveAsRoute} onChange={(e) => setSaveAsRoute(e.target.checked)} />
              Also save as a route for later
            </label>
            {saveAsRoute && (
              <Input value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder="Saved route name" maxLength={120} />
            )}
            {runDuplicates.length > 0 && (
              <div className="space-y-1 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                {runDuplicates.map((d) => (
                  <div key={d.label}>
                    {d.label} is already in {d.runs.join(", ")}
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => createRun(true)} disabled={creatingRun}>
                  Create anyway
                </Button>
              </div>
            )}
            {!route && plan.stops.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {stale ? "Recalculate" : "Calculate"} the route first so the run gets the right stop order.
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onCancelRun} disabled={creatingRun}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => createRun(false)}
                disabled={creatingRun || !route || (saveAsRoute && !routeName.trim())}
              >
                {creatingRun && <Loader2 className="h-4 w-4 animate-spin" />} Create run ({plan.stops.length} stops)
              </Button>
            </div>
          </div>
        ) : (
          <>
        {activeRoute && activeRoute.status === "active" && (
          <Button variant="outline" className="w-full" onClick={() => save(false)} disabled={saving || plan.stops.length === 0 || !plan.start}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Update “{activeRoute.name}”
          </Button>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(true);
          }}
          className="flex gap-2"
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={activeRoute ? "Save as a new route…" : "Route name, e.g. San Ramon East"}
            maxLength={120}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={saving || !newName.trim() || plan.stops.length === 0 || !plan.start || tooMany}
          >
            Save
          </Button>
        </form>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function PinSelect({
  label,
  value,
  exclude,
  plan,
  locationsById,
  onChange,
}: {
  label: string;
  value: string | null;
  exclude: string | null;
  plan: Plan;
  locationsById: Map<string, DropLocation>;
  onChange: (id: string | null) => void;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
      >
        <option value="">Google decides</option>
        {plan.stops
          .filter((s) => s.locationId !== exclude)
          .map((s) => (
            <option key={s.locationId} value={s.locationId}>
              {locationsById.get(s.locationId)?.label ?? "Unknown location"}
            </option>
          ))}
      </select>
    </label>
  );
}
