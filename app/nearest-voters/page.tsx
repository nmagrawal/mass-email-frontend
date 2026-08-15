"use client";

import { useState } from "react";
import NearestVotersMap from "@/components/NearestVotersMap";

type UserLocation = {
  lat: number;
  lng: number;
};

type Voter = {
  _id: string;

  name?: {
    full?: string;
    first?: string;
    last?: string;
  };

  residence?: {
    address_line1?: string;
    city?: string;
    state?: string;
    zip?: string;

    location?: {
      type: "Point";
      coordinates: [number, number];
    };
  };

  precinct?: {
    id?: string;
    name?: string;
  };

  registration?: {
    party_name?: string;
    party_abbr?: string;
  };
};

export default function NearestVotersPage() {
  const [voters, setVoters] = useState<Voter[]>([]);

  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  function findNearest() {
    setError("");

    if (!navigator.geolocation) {
      setError("Location is not supported by this browser.");

      return;
    }

    setLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const location = {
            lat: position.coords.latitude,

            lng: position.coords.longitude,
          };

          setUserLocation(location);

          const response = await fetch("/api/nearest-voters", {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
            },

            body: JSON.stringify(location),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Could not find nearby voters");
          }

          setVoters(data.voters);
        } catch (err: any) {
          setError(err.message || "Something went wrong");
        } finally {
          setLoading(false);
        }
      },

      (locationError) => {
        setLoading(false);

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
            setError("Could not access your location.");
        }
      },

      {
        enableHighAccuracy: true,

        timeout: 15000,

        maximumAge: 30000,
      },
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Nearby SRD2 Voters</h1>

        <p className="mt-2 text-gray-600">
          Use your current location to find the nearest 10 addresses.
        </p>
      </div>

      <button
        onClick={findNearest}
        disabled={loading}
        className="rounded-lg bg-black px-6 py-3 text-white disabled:opacity-50"
      >
        {loading ? "Finding your location..." : "Use My Current Location"}
      </button>

      {error && (
        <div className="mt-5 rounded-lg bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {userLocation && voters.length > 0 && (
        <div className="mt-8">
          <NearestVotersMap userLocation={userLocation} voters={voters} />
        </div>
      )}

      {voters.length > 0 && (
        <div className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">Nearest {voters.length}</h2>

          {voters.map((voter, index) => {
            const address = [
              voter.residence?.address_line1,

              voter.residence?.city,

              voter.residence?.state,

              voter.residence?.zip,
            ]
              .filter(Boolean)
              .join(", ");

            const name =
              voter.name?.full ||
              [voter.name?.first, voter.name?.last].filter(Boolean).join(" ");

            return (
              <div key={voter._id} className="rounded-xl border p-4">
                <div className="font-semibold">
                  #{index + 1} {name}
                </div>

                <div className="text-gray-600">{address}</div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
