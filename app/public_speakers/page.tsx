"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

interface Voter {
  _id: string;
  demographics: {
    name_first?: string;
    name_last?: string;
    full_name?: string;
    city?: string;
    [key: string]: any;
  };
  full_name?: string;
  public_speaker?: boolean;
  public_speaker_id?: string;
}

const PAGE_SIZE = 50;

export default function PublicSpeakersPage() {
  const [voters, setVoters] = useState<Voter[]>([]);
  const [city, setCity] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    fetchCities();
  }, []);

  useEffect(() => {
    setPage(0); // Reset to first page when city changes
  }, [city]);

  // Search handler: fetch all matching public speakers in city
  async function handleSearch() {
    if (!search.trim()) return;
    setIsSearching(true);
    setLoading(true);
    let url = `/api/public-speakers?search=${encodeURIComponent(search.trim())}`;
    if (city) {
      url += `&city=${encodeURIComponent(city)}`;
    }
    // Fetch a large number (up to 2000) for search
    url += `&limit=2000&skip=0`;
    const res = await fetch(url);
    const data = await res.json();
    setVoters((data.voters || []).filter((v: Voter) => v.public_speaker));
    setTotal(data.voters ? data.voters.length : 0);
    setLoading(false);
  }

  // Reset search when search box is cleared
  useEffect(() => {
    if (!search.trim() && isSearching) {
      setIsSearching(false);
      setPage(0);
    }
  }, [search, isSearching]);

  useEffect(() => {
    fetchVoters();
  }, [city, page]);

  async function fetchCities() {
    const res = await fetch("/api/voters");
    const data = await res.json();
    setCities(data.cities || []);
  }

  async function fetchVoters() {
    setLoading(true);
    const params = new URLSearchParams();
    if (city) params.append("city", city);
    params.append("skip", String(page * PAGE_SIZE));
    params.append("limit", String(PAGE_SIZE));
    const res = await fetch(`/api/public-speakers?${params.toString()}`);
    const data = await res.json();
    setVoters((data.voters || []).filter((v: Voter) => v.public_speaker));
    setTotal(data.total || 0);
    setLoading(false);
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Mapped Public Speakers</h1>
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
        <>
          <table className="w-full border-collapse border mt-4">
            <thead>
              <tr>
                <th className="border px-2 py-1">First Name</th>
                <th className="border px-2 py-1">Last Name</th>
                <th className="border px-2 py-1">City</th>
                <th className="border px-2 py-1">Address</th>
                <th className="border px-2 py-1">Public Speaker</th>
                <th className="border px-2 py-1">Speaker ID</th>
              </tr>
            </thead>
            <tbody>
              {voters.map((v) => (
                <tr key={v._id}>
                  <td className="border px-2 py-1">
                    {v.demographics?.name_first ||
                      v.demographics?.full_name ||
                      v.full_name ||
                      ""}
                  </td>
                  <td className="border px-2 py-1">
                    {v.demographics?.name_last || ""}
                  </td>
                  <td className="border px-2 py-1">{v.demographics?.city}</td>
                  <td className="border px-2 py-1">
                    {v.demographics?.MailAddress1 ||
                    v.demographics?.MailAddress2
                      ? [
                          v.demographics?.MailAddress1,
                          v.demographics?.MailAddress2,
                        ]
                          .filter(Boolean)
                          .join(", ")
                      : [
                          v.demographics?.house_number,
                          v.demographics?.street,
                          v.demographics?.type,
                          v.demographics?.city,
                          v.demographics?.state,
                          v.demographics?.zip,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                  </td>
                  <td className="border px-2 py-1">
                    {v.public_speaker ? "Yes" : "No"}
                  </td>
                  <td className="border px-2 py-1">
                    {v.public_speaker_id || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between items-center mt-4">
            <button
              className="px-3 py-1 border rounded disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Previous
            </button>
            <span>
              Page {page + 1} of {Math.ceil(total / PAGE_SIZE) || 1}
            </span>
            <button
              className="px-3 py-1 border rounded disabled:opacity-50"
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
