"use client";

import Link from "next/link";
import { useState } from "react";

import ExploreVotersMap, {
  type ExploreMapStats,
} from "@/components/ExploreVotersMap";

export default function ExploreVotersPage() {
  const [stats, setStats] = useState<ExploreMapStats>({
    addressCount: 0,
    voterCount: 0,
    zoom: 12,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">Explore San Ramon Voters</h1>

            {loading && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                Updating map...
              </span>
            )}
          </div>

          <p className="max-w-3xl text-gray-600">
            Pan or zoom the map to explore frequent and super voters in the
            visible area. Clusters break apart as you zoom in, eventually
            showing individual household addresses.
          </p>
        </div>

        <Link
          href="/nearest-voters"
          className="inline-flex w-fit items-center rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-gray-50"
        >
          Nearby &amp; Walking Route
        </Link>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Visible addresses
          </div>
          <div className="mt-1 text-2xl font-bold">{stats.addressCount}</div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Visible eligible voters
          </div>
          <div className="mt-1 text-2xl font-bold">{stats.voterCount}</div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Map zoom
          </div>
          <div className="mt-1 text-2xl font-bold">{stats.zoom}</div>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-3 text-sm text-gray-500">
        Cluster numbers represent the total eligible voters inside that cluster.
        Individual address markers show the number of eligible voters at that
        household.
      </div>

      <ExploreVotersMap
        onStatsChange={setStats}
        onLoadingChange={setLoading}
        onError={setError}
      />
    </main>
  );
}
