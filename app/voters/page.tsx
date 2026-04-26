"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import Link from "next/link";

interface Voter {
  voterId: string;
  opgovUserId: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  city: string | null;
  address: string;
}

export default function VotersPage() {
  const [voters, setVoters] = useState<Voter[]>([]);
  const [city, setCity] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchCities();
  }, []);

  useEffect(() => {
    fetchVoters();
  }, [city]);

  // Search handler: fetch all matching voters in city
  async function handleSearch() {
    if (!search.trim()) return;
    setLoading(true);
    let url = `/api/voters?mapped=true&search=${encodeURIComponent(search.trim())}`;
    if (city) {
      url += `&city=${encodeURIComponent(city)}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    setVoters(data.voters || []);
    setLoading(false);
  }

  async function fetchCities() {
    // Get all cities from the API (not filtered by mapped)
    const res = await fetch("/api/voters");
    const data = await res.json();
    setCities(data.cities || []);
  }

  async function fetchVoters() {
    setLoading(true);
    const res = await fetch(
      `/api/voters?mapped=true${city ? `&city=${encodeURIComponent(city)}` : ""}`,
    );
    const data = await res.json();
    setVoters(data.voters || []);
    setLoading(false);
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Mapped Voters</h1>
      <div className="mb-4 flex gap-2 items-end">
        <div>
          <label className="mr-2 font-medium">Filter by City:</label>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="border px-2 py-1 rounded"
          >
            <option value="">All Cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="relative flex-1">
          <input
            className="w-full rounded border p-2 pr-10"
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            onClick={handleSearch}
            aria-label="Search"
            disabled={loading || !search.trim()}
          >
            <Search className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <table className="w-full border-collapse border mt-4">
          <thead>
            <tr>
              <th className="border px-2 py-1">First Name</th>
              <th className="border px-2 py-1">Last Name</th>
              <th className="border px-2 py-1">City</th>
              <th className="border px-2 py-1">Address</th>
              <th className="border px-2 py-1">Voter ID</th>
              <th className="border px-2 py-1">Opgov User ID</th>
            </tr>
          </thead>
          <tbody>
            {voters.map((v) => (
              <tr key={v.voterId}>
                <td className="border px-2 py-1">
                  {v.first_name || v.full_name || ""}
                </td>
                <td className="border px-2 py-1">
                  {v.last_name ||
                    (v.full_name
                      ? v.full_name.split(" ").slice(1).join(" ")
                      : "")}
                </td>
                <td className="border px-2 py-1">{v.city}</td>
                <td className="border px-2 py-1">{v.address}</td>
                <td className="border px-2 py-1">{v.voterId}</td>
                <td className="border px-2 py-1">{v.opgovUserId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
