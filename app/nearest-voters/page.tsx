"use client";

import { FormEvent, useState } from "react";

type Voter = {
  _id: string;

  name?: {
    full?: string;
  };

  residence?: {
    address_line1?: string;
    city?: string;
    state?: string;
    zip?: string;
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
  const [address, setAddress] = useState("");
  const [voters, setVoters] = useState<Voter[]>([]);
  const [searchedAddress, setSearchedAddress] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError("");
    setVoters([]);

    try {
      const response = await fetch("/api/nearest-voters", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          address,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setVoters(data.voters);
      setSearchedAddress(data.searchedAddress);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-2 text-3xl font-bold">Find Nearest Voters</h1>

      <p className="mb-8 text-gray-600">
        Enter an address to find the 10 nearest records.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Main St, San Ramon, CA"
          className="flex-1 rounded-lg border px-4 py-3"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-black px-6 py-3 text-white"
        >
          {loading ? "Searching..." : "Find Nearest 10"}
        </button>
      </form>

      {error && (
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {searchedAddress && (
        <div className="mt-8">
          <p className="text-sm text-gray-500">Nearest records to</p>

          <p className="font-semibold">{searchedAddress}</p>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {voters.map((voter, index) => {
          const r = voter.residence;

          const fullAddress = [r?.address_line1, r?.city, r?.state, r?.zip]
            .filter(Boolean)
            .join(", ");

          return (
            <div key={voter._id} className="rounded-xl border p-5">
              <div className="flex gap-4">
                <div className="text-xl font-bold">#{index + 1}</div>

                <div className="flex-1">
                  <h2 className="text-lg font-semibold">
                    {voter.name?.full || "Unknown"}
                  </h2>

                  <p className="text-gray-600">{fullAddress}</p>

                  <div className="mt-2 text-sm">
                    {voter.precinct?.name && (
                      <span>Precinct: {voter.precinct.name}</span>
                    )}

                    {voter.registration?.party_abbr && (
                      <span className="ml-4">
                        Party: {voter.registration.party_abbr}
                      </span>
                    )}
                  </div>

                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      fullAddress,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-sm underline"
                  >
                    Open in Google Maps
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
