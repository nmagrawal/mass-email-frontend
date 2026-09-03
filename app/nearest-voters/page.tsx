"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import NearestVotersMap, {
  type SearchLocation,
  type Voter,
} from "@/components/NearestVotersMap";

const REFRESH_DISTANCE_METERS = 40;
const MAX_ROUTE_STOPS = 25;

type RouteLeg = {
  distanceMeters: number;
  durationSeconds: number;
};

type WalkingRoute = {
  orderedVoterIds: string[];
  routePath: SearchLocation[];
  distanceMeters: number;
  durationSeconds: number;
  legs: RouteLeg[];
  warnings: string[];
};

function getVoterName(voter: Voter) {
  if (voter.name?.full) {
    return voter.name.full;
  }

  return (
    [voter.name?.first, voter.name?.middle, voter.name?.last]
      .filter(Boolean)
      .join(" ") || "Unknown"
  );
}

function getVoterAddress(voter: Voter) {
  return [
    voter.residence?.address_line1,
    voter.residence?.address_line2,
    voter.residence?.city,
    voter.residence?.state,
    voter.residence?.zip,
  ]
    .filter(Boolean)
    .join(", ");
}

function distanceInMeters(a: SearchLocation, b: SearchLocation) {
  const earthRadius = 6371000;
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);

  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  const angle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadius * angle;
}

function formatMiles(meters: number) {
  return (meters / 1609.344).toFixed(1);
}

function formatDuration(seconds: number) {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

export default function NearestVotersPage() {
  const [voters, setVoters] = useState<Voter[]>([]);
  const [searchLocation, setSearchLocation] = useState<SearchLocation | null>(
    null,
  );
  const [searchLabel, setSearchLabel] = useState("");
  const [address, setAddress] = useState("");

  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);

  const [error, setError] = useState("");
  const [liveTracking, setLiveTracking] = useState(false);
  const [walkingRoute, setWalkingRoute] = useState<WalkingRoute | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastQueriedLocationRef = useRef<SearchLocation | null>(null);
  const nearestQueryInFlightRef = useRef(false);
  const walkingRouteActiveRef = useRef(false);

  // Keep the original nearest-25 array untouched. While a route is active,
  // derive a separate display order from Google's optimized voter IDs.
  const displayVoters = useMemo(() => {
    if (!walkingRoute) {
      return voters;
    }

    const voterById = new Map(voters.map((voter) => [voter._id, voter]));

    const ordered = walkingRoute.orderedVoterIds
      .map((id) => voterById.get(id))
      .filter((voter): voter is Voter => Boolean(voter));

    return ordered.length === voters.length ? ordered : voters;
  }, [voters, walkingRoute]);

  function clearWalkingRoute() {
    walkingRouteActiveRef.current = false;
    setWalkingRoute(null);
  }

  function stopLiveTracking() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    lastQueriedLocationRef.current = null;
    nearestQueryInFlightRef.current = false;

    setLiveTracking(false);
    setLoadingLocation(false);
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  async function fetchNearestVoters(lat: number, lng: number) {
    const response = await fetch("/api/nearest-voters", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lat, lng }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not find nearby voters");
    }

    // A fresh nearest-25 search invalidates an older planned route.
    walkingRouteActiveRef.current = false;
    setWalkingRoute(null);
    setVoters(data.voters || []);
  }

  function useCurrentLocation() {
    setError("");

    if (!navigator.geolocation) {
      setError("Location is not supported by this browser.");
      return;
    }

    stopLiveTracking();
    clearWalkingRoute();

    setLoadingLocation(true);
    setLiveTracking(true);
    setSearchLabel("Your current location");

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const currentLocation: SearchLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        // Always move the blue dot in real time.
        setSearchLocation(currentLocation);
        setSearchLabel("Your current location");

        // While following a planned route, do not replace its 25 stops just
        // because GPS moved. The blue dot still updates normally.
        if (walkingRouteActiveRef.current) {
          setLoadingLocation(false);
          return;
        }

        const lastLocation = lastQueriedLocationRef.current;
        let shouldRefresh = !lastLocation;

        if (lastLocation) {
          const moved = distanceInMeters(lastLocation, currentLocation);

          if (moved >= REFRESH_DISTANCE_METERS) {
            shouldRefresh = true;
          }
        }

        if (!shouldRefresh || nearestQueryInFlightRef.current) {
          setLoadingLocation(false);
          return;
        }

        nearestQueryInFlightRef.current = true;

        try {
          await fetchNearestVoters(currentLocation.lat, currentLocation.lng);
          lastQueriedLocationRef.current = currentLocation;
          setLoadingLocation(false);
        } catch (err: any) {
          setLoadingLocation(false);
          setError(err?.message || "Could not find nearby voters");
        } finally {
          nearestQueryInFlightRef.current = false;
        }
      },
      (locationError) => {
        setLoadingLocation(false);
        setLiveTracking(false);

        switch (locationError.code) {
          case locationError.PERMISSION_DENIED:
            setError(
              "Location permission was denied. Please allow location access and try again.",
            );
            break;

          case locationError.POSITION_UNAVAILABLE:
            setError("Your current location could not be determined.");
            break;

          case locationError.TIMEOUT:
            setError("Location request timed out. Please try again.");
            break;

          default:
            setError("Could not access your current location.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 3000,
      },
    );
  }

  async function findByAddress(e: FormEvent) {
    e.preventDefault();
    setError("");

    const cleanAddress = address.trim();

    if (!cleanAddress) {
      setError("Please enter an address.");
      return;
    }

    stopLiveTracking();
    clearWalkingRoute();

    setLoadingAddress(true);
    setVoters([]);

    try {
      const response = await fetch("/api/geocode-address", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address: cleanAddress,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not find that address");
      }

      const location: SearchLocation = {
        lat: Number(data.lat),
        lng: Number(data.lng),
      };

      setSearchLocation(location);
      setSearchLabel(data.formattedAddress || cleanAddress);

      await fetchNearestVoters(location.lat, location.lng);
      lastQueriedLocationRef.current = location;
    } catch (err: any) {
      setError(err?.message || "Could not search address");
    } finally {
      setLoadingAddress(false);
    }
  }

  async function createWalkingRoute() {
    if (!searchLocation || voters.length === 0) {
      return;
    }

    setLoadingRoute(true);
    setError("");

    try {
      const routeVoters = voters.slice(0, MAX_ROUTE_STOPS);

      const response = await fetch("/api/walking-route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin: searchLocation,
          voterIds: routeVoters.map((voter) => voter._id),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not create walking route");
      }

      const route: WalkingRoute = {
        orderedVoterIds: Array.isArray(data.orderedVoterIds)
          ? data.orderedVoterIds
          : routeVoters.map((voter) => voter._id),
        routePath: Array.isArray(data.routePath) ? data.routePath : [],
        distanceMeters: Number(data.distanceMeters || 0),
        durationSeconds: Number(data.durationSeconds || 0),
        legs: Array.isArray(data.legs) ? data.legs : [],
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      };

      walkingRouteActiveRef.current = true;
      setWalkingRoute(route);
    } catch (err: any) {
      walkingRouteActiveRef.current = false;
      setWalkingRoute(null);
      setError(err?.message || "Could not create walking route");
    } finally {
      setLoadingRoute(false);
    }
  }

  const isSearchLoading = loadingLocation || loadingAddress;

  return (
    <main className="mx-auto max-w-6xl p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Nearby San Ramon Voters</h1>

        <p className="mt-2 text-gray-600">
          Find the nearest 25 frequent and super voters using your live location
          or an address, then create an optimized walking route through all 25
          stops.
        </p>
      </div>

      <div className="max-w-2xl rounded-2xl border bg-white p-5 shadow-sm">
        {!liveTracking ? (
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={isSearchLoading || loadingRoute}
            className="w-full rounded-lg bg-black px-6 py-3 font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingLocation
              ? "Finding your location..."
              : "Use My Current Location"}
          </button>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
              </span>

              <span className="text-sm font-medium text-blue-800">
                Live location active
              </span>
            </div>

            <button
              type="button"
              onClick={stopLiveTracking}
              className="rounded-lg border px-5 py-3 text-sm font-medium transition hover:bg-gray-50"
            >
              Stop
            </button>
          </div>
        )}

        <div className="my-5 flex items-center gap-4">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs font-medium text-gray-400">OR</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <form onSubmit={findByAddress}>
          <label htmlFor="address" className="mb-2 block text-sm font-medium">
            Enter an address
          </label>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, San Ramon, CA"
              disabled={loadingAddress || loadingRoute}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-4 py-3 outline-none transition focus:border-black focus:ring-1 focus:ring-black disabled:bg-gray-100"
            />

            <button
              type="submit"
              disabled={loadingAddress || loadingRoute}
              className="rounded-lg bg-black px-6 py-3 font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingAddress ? "Searching..." : "Search"}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="mt-5 max-w-2xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {searchLocation && !isSearchLoading && voters.length === 0 && !error && (
        <div className="mt-8 rounded-xl border p-5 text-gray-600">
          No nearby San Ramon super voters were found.
        </div>
      )}

      {searchLocation && voters.length > 0 && (
        <>
          <div className="mt-8 mb-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {liveTracking && (
                <span className="h-2 w-2 rounded-full bg-blue-500" />
              )}
              Showing nearest records to
            </div>

            <div className="font-semibold">{searchLabel}</div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={createWalkingRoute}
              disabled={loadingRoute || voters.length === 0}
              className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingRoute
                ? "Creating walking route..."
                : walkingRoute
                  ? "Recalculate Walking Route"
                  : `🚶 Create Walking Route (${Math.min(
                      voters.length,
                      MAX_ROUTE_STOPS,
                    )} stops)`}
            </button>

            {walkingRoute && (
              <button
                type="button"
                onClick={clearWalkingRoute}
                className="rounded-lg border px-5 py-3 font-medium transition hover:bg-gray-50"
              >
                Clear Route
              </button>
            )}
          </div>

          {walkingRoute && (
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <div>
                  <div className="text-xs text-gray-500">Walking distance</div>
                  <div className="font-semibold">
                    {formatMiles(walkingRoute.distanceMeters)} miles
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Estimated time</div>
                  <div className="font-semibold">
                    {formatDuration(walkingRoute.durationSeconds)}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Stops</div>
                  <div className="font-semibold">{displayVoters.length}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Route</div>
                  <div className="font-semibold">Round trip</div>
                </div>
              </div>

              <p className="mt-3 text-xs text-gray-600">
                Walking directions may not always reflect available sidewalks or
                pedestrian paths. Use local conditions and posted signs.
              </p>

              {walkingRoute.warnings.length > 0 && (
                <div className="mt-2 text-xs text-amber-800">
                  {walkingRoute.warnings.join(" ")}
                </div>
              )}
            </div>
          )}

          <NearestVotersMap
            searchLocation={searchLocation}
            searchLabel={searchLabel}
            voters={displayVoters}
            routePath={walkingRoute?.routePath || []}
          />

          <div className="mt-8">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">
                {walkingRoute
                  ? "Walking Order"
                  : `Nearest ${displayVoters.length}`}
              </h2>

              {liveTracking && !walkingRoute && (
                <span className="text-xs text-gray-500">
                  Results refresh after moving about {REFRESH_DISTANCE_METERS}m
                </span>
              )}

              {liveTracking && walkingRoute && (
                <span className="text-xs text-gray-500">
                  Live position updates while route stays fixed
                </span>
              )}
            </div>

            <div className="space-y-3">
              {displayVoters.map((voter, index) => {
                const name = getVoterName(voter);
                const voterAddress = getVoterAddress(voter);
                const leg = walkingRoute?.legs?.[index];

                return (
                  <div
                    key={voter._id}
                    className="rounded-xl border bg-white p-4"
                  >
                    <div className="flex gap-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-sm font-semibold text-white">
                        {index + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{name}</div>

                        {walkingRoute && leg && (
                          <div className="mt-1 text-xs font-medium text-blue-700">
                            {index === 0 ? "From start" : "From previous stop"}:{" "}
                            {(leg.distanceMeters / 1609.344).toFixed(2)} mi ·{" "}
                            {formatDuration(leg.durationSeconds)}
                          </div>
                        )}

                        <div className="mt-1 text-sm text-gray-600">
                          {voterAddress}
                        </div>

                        {(voter.contact?.phone_primary ||
                          voter.contact?.phone_secondary ||
                          voter.contact?.email) && (
                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                            {voter.contact?.phone_primary && (
                              <a
                                href={`tel:${voter.contact.phone_primary}`}
                                className="font-medium text-blue-600 hover:underline"
                              >
                                📞 {voter.contact.phone_primary}
                              </a>
                            )}

                            {voter.contact?.phone_secondary && (
                              <a
                                href={`tel:${voter.contact.phone_secondary}`}
                                className="font-medium text-blue-600 hover:underline"
                              >
                                📞 {voter.contact.phone_secondary}
                              </a>
                            )}

                            {voter.contact?.email && (
                              <a
                                href={`mailto:${voter.contact.email}`}
                                className="break-all font-medium text-blue-600 hover:underline"
                              >
                                ✉️ {voter.contact.email}
                              </a>
                            )}
                          </div>
                        )}

                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500">
                          {voter.precinct?.name && (
                            <span>Precinct: {voter.precinct.name}</span>
                          )}

                          {voter.registration?.party_abbr && (
                            <span>Party: {voter.registration.party_abbr}</span>
                          )}

                          {voter.flags?.super_voter && (
                            <span className="rounded-full bg-green-50 px-2 py-1 font-medium text-green-700">
                              Super Voter
                            </span>
                          )}

                          {voter.flags?.frequent_voter && (
                            <span
                              className="
      rounded-full
      bg-amber-50
      px-2
      py-1
      font-medium
      text-amber-700
    "
                            >
                              Frequent Voter
                            </span>
                          )}

                          {voter.flags?.srd2 && (
                            <span className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-700">
                              District 2
                            </span>
                          )}
                        </div>

                        {voterAddress && (
                          <a
                            href={
                              `https://www.google.com/maps/search/?api=1&query=` +
                              encodeURIComponent(voterAddress)
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-block text-sm font-medium underline underline-offset-2"
                          >
                            Open in Google Maps
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
