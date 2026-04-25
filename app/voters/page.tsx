"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Voter {
  voterId: string;
  opgovUserId: string;
  first_name: string;
  last_name: string;
  city: string | null;
  address: string;
}

export default function VotersPage() {
  const [voters, setVoters] = useState<Voter[]>([]);
  const [city, setCity] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCities();
  }, []);

  useEffect(() => {
    fetchVoters();
  }, [city]);

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
                <td className="border px-2 py-1">{v.first_name}</td>
                <td className="border px-2 py-1">{v.last_name}</td>
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
