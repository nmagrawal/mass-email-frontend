"use client";
import { useEffect, useState } from "react";

interface Voter {
  _id: string;
  demographics: {
    name_first?: string;
    name_last?: string;
    city?: string;
    [key: string]: any;
  };
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

  useEffect(() => {
    fetchCities();
  }, []);

  useEffect(() => {
    setPage(0); // Reset to first page when city changes
  }, [city]);

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
      <div className="mb-4">
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
                    {v.demographics?.name_first}
                  </td>
                  <td className="border px-2 py-1">
                    {v.demographics?.name_last}
                  </td>
                  <td className="border px-2 py-1">{v.demographics?.city}</td>
                  <td className="border px-2 py-1">
                    {v.demographics?.address || ""}
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
