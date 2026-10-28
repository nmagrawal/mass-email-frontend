"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { DistributionMap } from "./distribution-map";
import { EditionsPanel } from "./editions-panel";
import { LocationDetails } from "./location-details";
import { LocationDialog } from "./location-dialog";
import { DepotCard } from "./depot-card";
import { LocationList } from "./location-list";
import { MapFinder } from "./map-finder";
import { PlaceSearch } from "./place-search";
import { ReportsPanel } from "./reports-panel";
import { MAX_ROUTE_STOPS, RoutePlanner, routeSignature, type Plan, type RunTarget } from "./route-planner";
import {
  postJson,
  readJson,
  type City,
  type ComputedRoute,
  type DropLocation,
  type LocationStatusFilter,
  type RouteTemplate,
} from "./types";

const CITY_STORAGE_KEY = "paperDistribution.cityId";

type MobileTab = "list" | "map" | "route";
type Section = "locations" | "plan" | "editions" | "reports";

const SECTION_LABELS: Record<Section, string> = {
  locations: "Locations",
  plan: "Plan",
  editions: "Editions & runs",
  reports: "Reports",
};
const SECTION_STORAGE_KEY = "paperDistribution.section";

function emptyPlan(city: City | null): Plan {
  return {
    stops: [],
    start: city?.depot ? { ...city.depot, type: "depot" } : null,
    finish: { returnToStart: true, point: null },
    optimize: true,
    departure: "",
    defaultStopMinutes: 3,
    firstStopId: null,
    lastStopId: null,
  };
}

function planFromRoute(route: RouteTemplate): Plan {
  return {
    stops: route.stops.map((s) => ({ ...s })),
    start: route.start,
    finish: { returnToStart: route.finish.returnToStart, point: route.finish.point },
    optimize: route.optimize,
    departure: "",
    defaultStopMinutes: route.defaultStopMinutes,
    firstStopId: route.firstLocationId,
    lastStopId: route.lastLocationId,
  };
}

export function PaperDistributionClient() {
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [cityId, setCityId] = useState("");
  const [addCityOpen, setAddCityOpen] = useState(false);
  const [addingCity, setAddingCity] = useState(false);

  const [locations, setLocations] = useState<DropLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LocationStatusFilter>("current");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; location: DropLocation | null }>({
    open: false,
    location: null,
  });

  const [plan, setPlanState] = useState<Plan>(emptyPlan(null));
  const [computed, setComputed] = useState<{ route: ComputedRoute; signature: string } | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<RouteTemplate[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);

  const [mobileTab, setMobileTab] = useState<MobileTab>("map");
  const [section, setSectionState] = useState<Section>("locations");

  // Planning a custom run for an edition reuses the Plan tab.
  const [runTarget, setRunTarget] = useState<RunTarget | null>(null);
  const [drivers, setDrivers] = useState<{ clerkUserId: string; name: string; role: string }[]>([]);
  const [editionFocus, setEditionFocus] = useState<{ editionId: string; nonce: number } | null>(null);
  const stashedPlan = useRef<{ plan: Plan; activeRouteId: string | null } | null>(null);

  function startRunPlanning(target: RunTarget) {
    stashedPlan.current = { plan, activeRouteId };
    setRunTarget(target);
    setActiveRouteId(null);
    setPlanState(emptyPlan(city));
    setComputed(null);
    setSectionState("plan");
    setMobileTab("map");
    if (!drivers.length) {
      fetch("/api/paper/drivers")
        .then((r) => readJson<{ drivers: typeof drivers }>(r))
        .then((d) => setDrivers(d.drivers))
        .catch(() => {});
    }
  }

  function endRunPlanning(created?: { editionId: string; message: string }) {
    const target = runTarget;
    setRunTarget(null);
    // Give back whatever was being planned before.
    if (stashedPlan.current) {
      setPlanState(stashedPlan.current.plan);
      setActiveRouteId(stashedPlan.current.activeRouteId);
      stashedPlan.current = null;
    }
    setComputed(null);
    setSection("editions");
    if (created) {
      setNotice(created.message);
      setEditionFocus({ editionId: created.editionId, nonce: Date.now() });
    } else if (target) {
      setEditionFocus({ editionId: target.editionId, nonce: Date.now() });
    }
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SECTION_STORAGE_KEY) as Section | null;
      if (saved && saved in SECTION_LABELS) {
        setSectionState(saved);
        setMobileTab(saved === "locations" ? "list" : "map");
      }
    } catch {}
  }, []);

  function setSection(next: Section) {
    setSectionState(next);
    setMobileTab(next === "locations" ? "list" : "map");
    setFocusedId(null);
    try {
      localStorage.setItem(SECTION_STORAGE_KEY, next);
    } catch {}
  }

  const city = cities.find((c) => c.id === cityId) || null;
  const setPlan = useCallback((update: (p: Plan) => Plan) => setPlanState(update), []);

  /* ---------- loading ---------- */

  useEffect(() => {
    fetch("/api/paper/cities")
      .then((res) => readJson<{ cities: City[] }>(res))
      .then((data) => {
        setCities(data.cities);
        let remembered = "";
        try {
          remembered = localStorage.getItem(CITY_STORAGE_KEY) || "";
        } catch {}
        const initial = data.cities.find((c) => c.id === remembered) || data.cities[0];
        if (initial) setCityId(initial.id);
      })
      .catch((err) => setError(err.message))
      .finally(() => setCitiesLoading(false));
  }, []);

  useEffect(() => {
    if (!cityId) return;
    try {
      localStorage.setItem(CITY_STORAGE_KEY, cityId);
    } catch {}

    let cancelled = false;
    setLocationsLoading(true);
    setError("");
    setFocusedId(null);
    setComputed(null);
    setActiveRouteId(null);

    // All statuses are loaded; filtering happens here so selected stops stay
    // visible on the map even when the list filter hides them.
    Promise.all([
      fetch(`/api/paper/locations?cityId=${encodeURIComponent(cityId)}&status=all`).then((r) =>
        readJson<{ locations: DropLocation[] }>(r),
      ),
      fetch(`/api/paper/route-templates?cityId=${encodeURIComponent(cityId)}&includeArchived=true`).then((r) =>
        readJson<{ routes: RouteTemplate[] }>(r),
      ),
    ])
      .then(([locs, routes]) => {
        if (cancelled) return;
        setLocations(locs.locations);
        setSavedRoutes(routes.routes);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLocationsLoading(false));

    return () => {
      cancelled = true;
    };
  }, [cityId]);

  // New city → fresh plan starting from that city's depot.
  useEffect(() => {
    setPlanState(emptyPlan(city));
    // Only when switching cities, not when the depot is edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);

  /* ---------- derived ---------- */

  const locationsById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return locations.filter((l) => {
      if (statusFilter === "current" && l.status === "inactive") return false;
      if (statusFilter !== "current" && statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      return [l.label, l.area, l.address, l.googleName].some((v) => v?.toLowerCase().includes(q));
    });
  }, [locations, search, statusFilter]);

  const stopNumbers = useMemo(
    () => new Map(plan.stops.map((s, i) => [s.locationId, i + 1])),
    [plan.stops],
  );

  // Plan map: every routable location in the city (+ any selected stop, even if since paused/removed).
  const planLocations = useMemo(() => {
    const shown = locations.filter((l) => l.status !== "inactive");
    const ids = new Set(shown.map((l) => l.id));
    const extra = plan.stops
      .map((s) => locationsById.get(s.locationId))
      .filter((l): l is DropLocation => Boolean(l) && !ids.has(l!.id));
    return [...shown, ...extra];
  }, [locations, plan.stops, locationsById]);

  const activeCount = useMemo(() => locations.filter((l) => l.status === "active").length, [locations]);

  // Plan tab list: same locations as the map, with its own quick filter.
  const [planSearch, setPlanSearch] = useState("");
  const planList = useMemo(() => {
    const q = planSearch.trim().toLowerCase();
    if (!q) return planLocations;
    return planLocations.filter((l) => [l.label, l.area, l.address].some((v) => v?.toLowerCase().includes(q)));
  }, [planLocations, planSearch]);
  const isPlan = section === "plan";
  const noStops = useMemo(() => new Map<string, number>(), []);

  const areas = useMemo(
    () => [...new Set(locations.map((l) => l.area).filter(Boolean))].sort(),
    [locations],
  );

  const focused = focusedId ? locationsById.get(focusedId) || null : null;
  // Shown dashed on the map until recalculated.
  const routeStale = Boolean(computed && computed.signature !== routeSignature(plan));

  /* ---------- actions ---------- */

  function toggleStop(loc: DropLocation) {
    setPlanState((p) =>
      p.stops.some((s) => s.locationId === loc.id)
        ? { ...p, stops: p.stops.filter((s) => s.locationId !== loc.id) }
        : loc.status === "active"
          ? { ...p, stops: [...p.stops, { locationId: loc.id, quantity: null, stopMinutes: null }] }
          : p,
    );
  }

  function selectAllActive(from: DropLocation[] = locations) {
    setPlanState((p) => {
      const have = new Set(p.stops.map((s) => s.locationId));
      const add = from
        .filter((l) => l.status === "active" && !have.has(l.id))
        .map((l) => ({ locationId: l.id, quantity: null, stopMinutes: null }));
      const stops = [...p.stops, ...add];
      if (stops.length > MAX_ROUTE_STOPS) {
        setNotice(`${stops.length} stops selected — Google routes allow ${MAX_ROUTE_STOPS}. Split into more than one route.`);
      }
      return { ...p, stops };
    });
  }

  function upsertLocation(loc: DropLocation, note?: string) {
    setLocations((prev) => {
      const exists = prev.some((l) => l.id === loc.id);
      const next = exists ? prev.map((l) => (l.id === loc.id ? loc : l)) : [...prev, loc];
      return next.sort((a, b) => (a.area || "").localeCompare(b.area || "") || a.label.localeCompare(b.label));
    });
    setCities((prev) =>
      prev.map((c) =>
        c.id === loc.cityId && !locationsById.has(loc.id)
          ? { ...c, locationCount: (c.locationCount ?? 0) + 1 }
          : c,
      ),
    );
    setFocusedId(loc.id);
    if (note) setNotice(note);
  }

  function upsertRoute(route: RouteTemplate) {
    setSavedRoutes((prev) => {
      const exists = prev.some((r) => r.id === route.id);
      return (exists ? prev.map((r) => (r.id === route.id ? route : r)) : [...prev, route]).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    });
    if (route.id !== activeRouteId) {
      // Newly saved or duplicated → work on that one now.
      setActiveRouteId(route.id);
      setPlanState((p) => ({ ...planFromRoute(route), departure: p.departure }));
    }
    setNotice(`Saved “${route.name}”.`);
  }

  async function addCity(placeId: string, sessionToken: string) {
    setAddingCity(true);
    setError("");
    try {
      const data = await readJson<{ city: City; existed?: boolean }>(
        await postJson("/api/paper/cities", { placeId, sessionToken }),
      );
      setCities((prev) =>
        prev.some((c) => c.id === data.city.id)
          ? prev
          : [...prev, data.city].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setCityId(data.city.id);
      setAddCityOpen(false);
      if (!data.city.depot) setNotice(`Added ${data.city.name}. Set a depot in the route planner to use as the default start.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddingCity(false);
    }
  }

  /* ---------- render ---------- */

  if (citiesLoading) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const cityDialog = (
    <Dialog open={addCityOpen} onOpenChange={setAddCityOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a city</DialogTitle>
          <DialogDescription>Each city keeps its own drop locations, depot and routes.</DialogDescription>
        </DialogHeader>
        <PlaceSearch citiesOnly autoFocus placeholder="Search a city" onSelect={(s, t) => addCity(s.placeId, t)} />
        {addingCity && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {error && <div className="text-sm text-red-700">{error}</div>}
      </DialogContent>
    </Dialog>
  );

  if (!city) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">Newspaper distribution</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Start by adding the first city you distribute in. Then add drop locations and plan routes.
        </p>
        <Button onClick={() => setAddCityOpen(true)}>
          <Plus className="h-4 w-4" /> Add city
        </Button>
        {error && <div className="text-sm text-red-700">{error}</div>}
        {cityDialog}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <select
          value={cityId}
          onChange={(e) => setCityId(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm font-medium"
          aria-label="City"
        >
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}, {c.state} ({c.locationCount ?? 0})
            </option>
          ))}
        </select>

        <div className="flex flex-wrap rounded-md bg-muted p-0.5">
          {(Object.keys(SECTION_LABELS) as Section[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => (runTarget && s !== "plan" ? endRunPlanning() : setSection(s))}
              className={cn(
                "rounded px-3 py-1 text-sm font-medium",
                section === s ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {SECTION_LABELS[s]}
            </button>
          ))}
        </div>

        {section === "locations" && (
          <>
            <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter locations"
                className="h-9 pl-9"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as LocationStatusFilter)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              aria-label="Status filter"
            >
              <option value="current">Active + paused</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
            <Button size="sm" onClick={() => setDialog({ open: true, location: null })}>
              <Plus className="h-4 w-4" /> Add location
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAddCityOpen(true)}>
              <Plus className="h-4 w-4" /> Add city
            </Button>
          </>
        )}

        {/* Mobile view switch */}
        {(section === "locations" || isPlan) && (
          <div className="flex w-full gap-1 lg:hidden">
            {(section === "locations" ? (["list", "map"] as MobileTab[]) : (["list", "map", "route"] as MobileTab[])).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setMobileTab(tab)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium",
                  mobileTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {tab === "list" ? "List" : tab === "map" ? "Map" : `Route (${plan.stops.length})`}
              </button>
            ))}
          </div>
        )}
      </div>

      {notice && (
        <div className="flex items-center justify-between gap-2 border-b bg-blue-50 px-3 py-1.5 text-sm text-blue-900">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {runTarget && isPlan && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-blue-600 px-3 py-1.5 text-sm text-white">
          <span>
            Planning a run for <b>{runTarget.editionName}</b>: tick locations in the list or click pins (or load a saved
            route and untick some), choose start, first and last stop, calculate, then <b>Create run</b>.
          </span>
          <button type="button" className="underline" onClick={() => endRunPlanning()}>
            Cancel
          </button>
        </div>
      )}

      {section === "editions" && (
        <EditionsPanel
          city={city}
          savedRoutes={savedRoutes}
          focus={editionFocus}
          onPlanRun={(e) => startRunPlanning({ editionId: e.id, editionName: e.name })}
        />
      )}
      {section === "reports" && <ReportsPanel city={city} />}

      {/* Locations + Plan share one map. */}
      <div className={cn("min-h-0 flex-1", section === "locations" || isPlan ? "flex" : "hidden")}>
        {section === "locations" && (
          <aside className={cn("min-h-0 w-full border-r lg:block lg:w-96 lg:shrink-0", mobileTab === "list" ? "block" : "hidden")}>
            <LocationList
              locations={filtered}
              loading={locationsLoading}
              error={error}
              stopNumbers={noStops}
              focusedId={focusedId}
              selectable={false}
              onToggle={() => {}}
              onFocus={(l) => {
                setFocusedId(l.id);
                setMobileTab("map");
              }}
              onSelectAll={() => {}}
              onClear={() => {}}
              header={
                <DepotCard
                  city={city}
                  locations={locations}
                  onCityUpdated={(c) => setCities((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...c } : x)))}
                />
              }
            />
          </aside>
        )}

        {isPlan && (
          <aside className={cn("min-h-0 w-full border-r lg:block lg:w-80 lg:shrink-0", mobileTab === "list" ? "block" : "hidden")}>
            <LocationList
              locations={planList}
              loading={locationsLoading}
              error={error}
              stopNumbers={stopNumbers}
              focusedId={focusedId}
              onToggle={toggleStop}
              onFocus={(l) => {
                setFocusedId(l.id);
                setMobileTab("map");
              }}
              onSelectAll={() => selectAllActive(planList)}
              onClear={() => setPlanState((p) => ({ ...p, stops: [], firstStopId: null, lastStopId: null }))}
              header={
                <div className="border-b p-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={planSearch}
                      onChange={(e) => setPlanSearch(e.target.value)}
                      placeholder="Filter by name, area or address"
                      className="h-9 pl-9"
                    />
                  </div>
                </div>
              }
            />
          </aside>
        )}

        <main className={cn("relative min-h-0 flex-1 lg:block", mobileTab === "map" ? "block" : "hidden")}>
          <DistributionMap
            center={city.center}
            locations={isPlan ? planLocations : filtered}
            stopNumbers={isPlan ? stopNumbers : noStops}
            focusedId={focusedId}
            route={isPlan ? computed?.route ?? null : null}
            routeStale={routeStale}
            start={isPlan ? plan.start : null}
            finish={isPlan && !plan.finish.returnToStart ? plan.finish.point : null}
            fitKey={isPlan ? `${cityId}|plan|${locationsLoading}` : `${cityId}|${statusFilter}|${search}|${locationsLoading}`}
            onPinClick={(id) => setFocusedId(id)}
          />

          {isPlan && (
            <div className="absolute left-2 top-2 z-10 flex flex-col gap-2 sm:left-3 sm:top-3 lg:hidden">
              <MapFinder locations={planLocations} stopNumbers={stopNumbers} onPick={(id) => setFocusedId(id)} />
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" className="h-8 shadow" onClick={() => selectAllActive()} disabled={activeCount === 0}>
                  Select all active ({activeCount})
                </Button>
                {plan.stops.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 shadow"
                    onClick={() => setPlanState((p) => ({ ...p, stops: [], firstStopId: null, lastStopId: null }))}
                  >
                    Clear ({plan.stops.length})
                  </Button>
                )}
              </div>
              {!locationsLoading && planLocations.length === 0 && (
                <div className="rounded-md bg-background/95 p-2 text-sm shadow">
                  No locations yet —{" "}
                  <button type="button" className="font-medium text-primary underline" onClick={() => setSection("locations")}>
                    add some in Locations
                  </button>
                  .
                </div>
              )}
            </div>
          )}

          {focused && (
            <div className="absolute inset-x-2 bottom-8 z-10 flex justify-center sm:inset-x-auto sm:right-3 sm:top-3 sm:bottom-auto">
              <LocationDetails
                key={`${section}:${focused.id}`}
                location={focused}
                stopNumber={isPlan ? stopNumbers.get(focused.id) : undefined}
                variant={isPlan ? "plan" : "manage"}
                onClose={() => setFocusedId(null)}
                onToggleStop={() => toggleStop(focused)}
                onEdit={() => setDialog({ open: true, location: focused })}
                onManage={() => {
                  const id = focused.id;
                  if (runTarget) endRunPlanning();
                  setSection("locations");
                  setFocusedId(id);
                  setMobileTab("map");
                }}
                onUpdated={upsertLocation}
              />
            </div>
          )}
        </main>

        {isPlan && (
          <aside
            className={cn(
              "min-h-0 w-full border-l lg:block lg:w-[380px] lg:shrink-0",
              mobileTab === "route" ? "block" : "hidden",
            )}
          >
            <RoutePlanner
              city={city}
              plan={plan}
              setPlan={setPlan}
              computed={computed}
              setComputed={setComputed}
              locationsById={locationsById}
              locations={locations}
              savedRoutes={savedRoutes}
              activeRouteId={activeRouteId}
              onRouteSaved={upsertRoute}
              onLoadRoute={(r) => {
                setActiveRouteId(r.id);
                setPlanState(planFromRoute(r));
                setComputed(null);
              }}
              onNewRoute={() => {
                setActiveRouteId(null);
                setPlanState(emptyPlan(city));
                setComputed(null);
              }}
              onCityUpdated={(c) => setCities((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...c } : x)))}
              onFocusLocation={(id) => {
                setFocusedId(id);
                setMobileTab("map");
              }}
              runTarget={runTarget}
              drivers={drivers}
              onRunCreated={(editionId, message) => {
                // A newly saved route shows up in the saved-route list.
                fetch(`/api/paper/route-templates?cityId=${encodeURIComponent(cityId)}&includeArchived=true`)
                  .then((r) => readJson<{ routes: RouteTemplate[] }>(r))
                  .then((d) => setSavedRoutes(d.routes))
                  .catch(() => {});
                endRunPlanning({ editionId, message });
              }}
              onCancelRun={() => endRunPlanning()}
            />
          </aside>
        )}
      </div>

      <LocationDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        city={city}
        location={dialog.location}
        areas={areas}
        onSaved={upsertLocation}
        onShowExisting={(l) => {
          if (l.status === "inactive") setStatusFilter("all");
          setFocusedId(l.id);
          setMobileTab("map");
        }}
      />
      {cityDialog}
    </div>
  );
}
