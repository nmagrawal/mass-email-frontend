"use client";

import { FormEvent, useState } from "react";

import NearestVotersMap, {
  type SearchLocation,
  type Voter,
} from "@/components/NearestVotersMap";

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

  //
  // SHARED FUNCTION
  //
  // Both GPS and address search
  // eventually come here.
  //

  async function findNearestByCoordinates(
    lat: number,
    lng: number,
    label: string,
  ) {
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

    setSearchLocation({
      lat,
      lng,
    });

    setSearchLabel(label);

    setVoters(data.voters || []);
  }

  //
  // OPTION 1:
  // CURRENT LOCATION
  //

  function useCurrentLocation() {
    setError("");
    setVoters([]);

    if (!navigator.geolocation) {
      setError("Location is not supported by this browser.");

      return;
    }

    setLoadingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = position.coords.latitude;

          const lng = position.coords.longitude;

          await findNearestByCoordinates(lat, lng, "Your current location");
        } catch (err: any) {
          setError(err?.message || "Could not find nearby voters");
        } finally {
          setLoadingLocation(false);
        }
      },

      (locationError) => {
        setLoadingLocation(false);

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

        maximumAge: 30000,
      },
    );
  }

  //
  // OPTION 2:
  // ENTER AN ADDRESS
  //

  async function findByAddress(e: FormEvent) {
    e.preventDefault();

    setError("");

    const cleanAddress = address.trim();

    if (!cleanAddress) {
      setError("Please enter an address.");

      return;
    }

    setLoadingAddress(true);

    setVoters([]);

    try {
      //
      // Step 1:
      // address -> lat/lng
      //

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

      //
      // Step 2:
      // lat/lng -> nearest 10
      //

      await findNearestByCoordinates(
        data.lat,
        data.lng,

        data.formattedAddress || cleanAddress,
      );
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
          Find the 10 nearest SRD2 records using your current location or an
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
        {/* CURRENT LOCATION */}

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
              disabled={isLoading}
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
              disabled={isLoading}
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
                  text-sm
                  text-gray-500
                "
            >
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

          <div
            className="
                mt-8
              "
          >
            <h2
              className="
                  mb-4
                  text-xl
                  font-semibold
                "
            >
              Nearest {voters.length}
            </h2>

            <div
              className="
                  space-y-3
                "
            >
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
