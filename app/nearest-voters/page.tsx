"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import NearestVotersMap, {
  type SearchLocation,
  type Voter,
} from "@/components/NearestVotersMap";

const REFRESH_DISTANCE_METERS = 40;

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

/*
 * Distance between two GPS coordinates.
 * Used so we only refresh nearest voters
 * after meaningful movement.
 */
function distanceInMeters(a: SearchLocation, b: SearchLocation) {
  const earthRadius = 6371000;

  const toRadians = (degrees: number) => {
    return degrees * (Math.PI / 180);
  };

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

export default function NearestVotersPage() {
  const [voters, setVoters] = useState<Voter[]>([]);

  const [searchLocation, setSearchLocation] = useState<SearchLocation | null>(
    null,
  );

  const [searchLabel, setSearchLabel] = useState("");

  const [address, setAddress] = useState("");

  const [loadingLocation, setLoadingLocation] = useState(false);

  const [loadingAddress, setLoadingAddress] = useState(false);

  const [error, setError] = useState("");

  const [liveTracking, setLiveTracking] = useState(false);

  /*
   * Browser geolocation watcher ID.
   */
  const watchIdRef = useRef<number | null>(null);

  /*
   * Location where we last asked
   * MongoDB for nearest voters.
   *
   * The blue dot can move continuously,
   * but Mongo only gets queried after
   * ~40 meters of movement.
   */
  const lastQueriedLocationRef = useRef<SearchLocation | null>(null);

  /*
   * Prevent simultaneous nearest-voter
   * requests if GPS fires rapidly.
   */
  const nearestQueryInFlightRef = useRef(false);

  /*
   * Stop GPS watcher.
   */
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

  /*
   * Automatically stop location tracking
   * when leaving the page.
   */
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  /*
   * Shared MongoDB nearest-voter request.
   *
   * Both:
   *
   * - live GPS
   * - manually entered address
   *
   * ultimately use this.
   */
  async function fetchNearestVoters(lat: number, lng: number) {
    const response = await fetch("/api/nearest-voters", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        lat,
        lng,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not find nearby voters");
    }

    setVoters(data.voters || []);
  }

  /*
   * ==========================================================
   * OPTION 1:
   * LIVE CURRENT LOCATION
   * ==========================================================
   */

  function useCurrentLocation() {
    setError("");

    if (!navigator.geolocation) {
      setError("Location is not supported by this browser.");

      return;
    }

    /*
     * Kill an old watcher if the
     * button is clicked again.
     */
    stopLiveTracking();

    setLoadingLocation(true);

    setLiveTracking(true);

    setSearchLabel("Your current location");

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const currentLocation: SearchLocation = {
          lat: position.coords.latitude,

          lng: position.coords.longitude,
        };

        /*
         * IMPORTANT:
         *
         * Update this every time GPS moves.
         *
         * This makes the blue dot move
         * in real time on the map.
         */
        setSearchLocation(currentLocation);

        setSearchLabel("Your current location");

        const lastLocation = lastQueriedLocationRef.current;

        /*
         * First GPS position:
         * always get nearest 10.
         */
        let shouldRefresh = !lastLocation;

        /*
         * Future positions:
         * only refresh Mongo after
         * moving ~40 meters.
         */
        if (lastLocation) {
          const moved = distanceInMeters(lastLocation, currentLocation);

          if (moved >= REFRESH_DISTANCE_METERS) {
            shouldRefresh = true;
          }
        }

        if (!shouldRefresh || nearestQueryInFlightRef.current) {
          return;
        }

        nearestQueryInFlightRef.current = true;

        try {
          await fetchNearestVoters(currentLocation.lat, currentLocation.lng);

          /*
           * Only update after
           * successful Mongo query.
           */
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
        /*
         * Ask the device for its
         * best available GPS result.
         */
        enableHighAccuracy: true,

        timeout: 15000,

        /*
         * Don't intentionally reuse
         * an old GPS reading for long.
         */
        maximumAge: 3000,
      },
    );
  }

  /*
   * ==========================================================
   * OPTION 2:
   * MANUALLY ENTER AN ADDRESS
   * ==========================================================
   */

  async function findByAddress(e: FormEvent) {
    e.preventDefault();

    setError("");

    const cleanAddress = address.trim();

    if (!cleanAddress) {
      setError("Please enter an address.");

      return;
    }

    /*
     * Manual address search should
     * stop live GPS tracking.
     *
     * Otherwise GPS would immediately
     * move the map back to the user.
     */
    stopLiveTracking();

    setLoadingAddress(true);

    setVoters([]);

    try {
      /*
       * Step 1:
       *
       * Typed address
       * ->
       * Google latitude / longitude
       */
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

      /*
       * Move map search marker
       * immediately.
       */
      setSearchLocation(location);

      setSearchLabel(data.formattedAddress || cleanAddress);

      /*
       * Step 2:
       *
       * Coordinates
       * ->
       * MongoDB nearest 10.
       */
      await fetchNearestVoters(location.lat, location.lng);
    } catch (err: any) {
      setError(err?.message || "Could not search address");
    } finally {
      setLoadingAddress(false);
    }
  }

  const isLoading = loadingLocation || loadingAddress;

  return (
    <main
      className="
        mx-auto
        max-w-6xl
        p-6
        md:p-8
      "
    >
      {/* HEADER */}

      <div className="mb-8">
        <h1
          className="
            text-3xl
            font-bold
          "
        >
          Nearby SRD2 Voters
        </h1>

        <p
          className="
            mt-2
            text-gray-600
          "
        >
          Find the nearest 10 SRD2 records using your live location or an
          address.
        </p>
      </div>

      {/* SEARCH CARD */}

      <div
        className="
          max-w-2xl
          rounded-2xl
          border
          bg-white
          p-5
          shadow-sm
        "
      >
        {/* LIVE LOCATION */}

        {!liveTracking ? (
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={isLoading}
            className="
              w-full
              rounded-lg
              bg-black
              px-6
              py-3
              font-medium
              text-white
              transition
              hover:bg-gray-800
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
          >
            {loadingLocation
              ? "Finding your location..."
              : "Use My Current Location"}
          </button>
        ) : (
          <div
            className="
              flex
              flex-col
              gap-3
              sm:flex-row
            "
          >
            <div
              className="
                flex
                flex-1
                items-center
                gap-3
                rounded-lg
                border
                border-blue-200
                bg-blue-50
                px-4
                py-3
              "
            >
              <span
                className="
                  relative
                  flex
                  h-3
                  w-3
                "
              >
                <span
                  className="
                    absolute
                    inline-flex
                    h-full
                    w-full
                    animate-ping
                    rounded-full
                    bg-blue-400
                    opacity-75
                  "
                />

                <span
                  className="
                    relative
                    inline-flex
                    h-3
                    w-3
                    rounded-full
                    bg-blue-500
                  "
                />
              </span>

              <span
                className="
                  text-sm
                  font-medium
                  text-blue-800
                "
              >
                Live location active
              </span>
            </div>

            <button
              type="button"
              onClick={stopLiveTracking}
              className="
                rounded-lg
                border
                px-5
                py-3
                text-sm
                font-medium
                transition
                hover:bg-gray-50
              "
            >
              Stop
            </button>
          </div>
        )}

        {/* OR */}

        <div
          className="
            my-5
            flex
            items-center
            gap-4
          "
        >
          <div
            className="
              h-px
              flex-1
              bg-gray-200
            "
          />

          <span
            className="
              text-xs
              font-medium
              text-gray-400
            "
          >
            OR
          </span>

          <div
            className="
              h-px
              flex-1
              bg-gray-200
            "
          />
        </div>

        {/* ADDRESS SEARCH */}

        <form onSubmit={findByAddress}>
          <label
            htmlFor="address"
            className="
              mb-2
              block
              text-sm
              font-medium
            "
          >
            Enter an address
          </label>

          <div
            className="
              flex
              flex-col
              gap-2
              sm:flex-row
            "
          >
            <input
              id="address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, San Ramon, CA"
              disabled={loadingAddress}
              className="
                min-w-0
                flex-1
                rounded-lg
                border
                border-gray-300
                px-4
                py-3
                outline-none
                transition
                focus:border-black
                focus:ring-1
                focus:ring-black
                disabled:bg-gray-100
              "
            />

            <button
              type="submit"
              disabled={loadingAddress}
              className="
                rounded-lg
                bg-black
                px-6
                py-3
                font-medium
                text-white
                transition
                hover:bg-gray-800
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              {loadingAddress ? "Searching..." : "Search"}
            </button>
          </div>
        </form>
      </div>

      {/* ERROR */}

      {error && (
        <div
          className="
            mt-5
            max-w-2xl
            rounded-lg
            border
            border-red-200
            bg-red-50
            p-4
            text-sm
            text-red-700
          "
        >
          {error}
        </div>
      )}

      {/* NO RESULTS */}

      {searchLocation && !isLoading && voters.length === 0 && !error && (
        <div
          className="
              mt-8
              rounded-xl
              border
              p-5
              text-gray-600
            "
        >
          No nearby SRD2 records were found.
        </div>
      )}

      {/* RESULTS */}

      {searchLocation && voters.length > 0 && (
        <>
          {/* SEARCH LOCATION */}

          <div
            className="
                mt-8
                mb-3
              "
          >
            <div
              className="
                  flex
                  items-center
                  gap-2
                  text-sm
                  text-gray-500
                "
            >
              {liveTracking && (
                <span
                  className="
                      h-2
                      w-2
                      rounded-full
                      bg-blue-500
                    "
                />
              )}
              Showing nearest records to
            </div>

            <div
              className="
                  font-semibold
                "
            >
              {searchLabel}
            </div>
          </div>

          {/* MAP */}

          <NearestVotersMap
            searchLocation={searchLocation}
            searchLabel={searchLabel}
            voters={voters}
          />

          {/* LIST */}

          <div className="mt-8">
            <div
              className="
                  mb-4
                  flex
                  items-center
                  justify-between
                  gap-4
                "
            >
              <h2
                className="
                    text-xl
                    font-semibold
                  "
              >
                Nearest {voters.length}
              </h2>

              {liveTracking && (
                <span
                  className="
                      text-xs
                      text-gray-500
                    "
                >
                  Results refresh after moving about {REFRESH_DISTANCE_METERS}m
                </span>
              )}
            </div>

            <div className="space-y-3">
              {voters.map((voter, index) => {
                const name = getVoterName(voter);

                const voterAddress = getVoterAddress(voter);

                return (
                  <div
                    key={voter._id}
                    className="
                          rounded-xl
                          border
                          bg-white
                          p-4
                        "
                  >
                    <div
                      className="
                            flex
                            gap-4
                          "
                    >
                      {/* NUMBER */}

                      <div
                        className="
                              flex
                              h-9
                              w-9
                              shrink-0
                              items-center
                              justify-center
                              rounded-full
                              bg-black
                              text-sm
                              font-semibold
                              text-white
                            "
                      >
                        {index + 1}
                      </div>

                      {/* DETAILS */}

                      <div
                        className="
                              min-w-0
                              flex-1
                            "
                      >
                        <div
                          className="
                                font-semibold
                              "
                        >
                          {name}
                        </div>

                        <div
                          className="
                                mt-1
                                text-sm
                                text-gray-600
                              "
                        >
                          {voterAddress}
                        </div>

                        <div
                          className="
                                mt-2
                                flex
                                flex-wrap
                                gap-x-4
                                gap-y-1
                                text-xs
                                text-gray-500
                              "
                        >
                          {voter.precinct?.name && (
                            <span>Precinct: {voter.precinct.name}</span>
                          )}

                          {voter.registration?.party_abbr && (
                            <span>Party: {voter.registration.party_abbr}</span>
                          )}

                          {voter.flags?.super_voter && <span>Super Voter</span>}
                        </div>

                        {voterAddress && (
                          <a
                            href={
                              `https://www.google.com/maps/search/?api=1&query=` +
                              encodeURIComponent(voterAddress)
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="
                                  mt-3
                                  inline-block
                                  text-sm
                                  font-medium
                                  underline
                                  underline-offset-2
                                "
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
