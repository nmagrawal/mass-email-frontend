import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Search } from "lucide-react";

interface Voter {
  _id: any;
  full_name: string;
  demographics: {
    city: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export function VoterListPanel({
  onAddToEmailList,
}: {
  onAddToEmailList?: (
    contacts: { email: string; first_name: string }[],
  ) => void;
}) {
  const [search, setSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>("Mangalam");
  const [voters, setVoters] = useState<Voter[]>([]);
  const [selected, setSelected] = useState<{ [id: string]: boolean }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const PAGE_SIZE = 300;

  useEffect(() => {
    const fetchCities = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/voters?skip=0&limit=${PAGE_SIZE}`);
        const data = await res.json();
        setCities(data.cities || []);
        setVoters(data.voters || []);
        setTotal(data.total || null);
        setSelected({});
      } catch (err) {
        setError("Failed to load voters");
      } finally {
        setLoading(false);
      }
    };
    fetchCities();
  }, []);

  useEffect(() => {
    if (isSearching) return; // Don't auto-fetch when searching
    const skip = (page - 1) * PAGE_SIZE;
    setLoading(true);
    setError(null);
    let url = `/api/voters?skip=${skip}&limit=${PAGE_SIZE}`;
    if (selectedCity) {
      url += `&city=${encodeURIComponent(selectedCity)}`;
    }
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setVoters(data.voters || []);
        setTotal(data.total || null);
        setSelected({});
      })
      .catch(() => setError("Failed to load voters"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity, page, isSearching]);

  // Search handler: fetch all matching voters in city
  const handleSearch = async () => {
    if (!search.trim()) return;
    setIsSearching(true);
    setLoading(true);
    setError(null);
    let url = `/api/voters?search=${encodeURIComponent(search.trim())}`;
    if (selectedCity) {
      url += `&city=${encodeURIComponent(selectedCity)}`;
    }
    // Fetch a large number (up to 2000) for search
    url += `&limit=2000&skip=0`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      setVoters(data.voters || []);
      setTotal(data.voters ? data.voters.length : 0);
      setSelected({});
    } catch {
      setError("Failed to search voters");
    } finally {
      setLoading(false);
    }
  };

  // Reset search when search box is cleared
  useEffect(() => {
    if (!search.trim() && isSearching) {
      setIsSearching(false);
      setPage(1);
    }
  }, [search, isSearching]);

  const allSelected =
    voters.length > 0 && voters.every((v) => selected[v._id.$oid || v._id]);
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected({});
    } else {
      const newSel: { [id: string]: boolean } = {};
      voters.forEach((v) => {
        newSel[v._id.$oid || v._id] = true;
      });
      setSelected(newSel);
    }
  };

  const handleCheckbox = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddToEmailList = () => {
    if (!onAddToEmailList) return;
    const selectedVoters = voters.filter((v) => selected[v._id.$oid || v._id]);
    const contacts = selectedVoters
      .map((v) => ({
        email: v.demographics?.email || v.email || "",
        first_name:
          v.demographics?.name_first || v.full_name.split(" ")[0] || "",
        full_name: v.full_name,
      }))
      .filter((c) => c.email);
    onAddToEmailList(contacts);
  };

  return (
    <div className="h-full w-full flex flex-col border-l border-border bg-background">
      <div className="p-4 border-b border-border">
        <h3 className="text-lg font-semibold mb-2">Voters by City</h3>
        <select
          className="w-full rounded border p-2 mb-2"
          value={selectedCity}
          onChange={(e) => {
            setSelectedCity(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Cities</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
        <div className="relative mb-2">
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
        <button
          className="mt-2 w-full rounded bg-primary text-primary-foreground py-2 font-medium disabled:opacity-50"
          disabled={
            Object.values(selected).filter(Boolean).length === 0 ||
            !onAddToEmailList
          }
          onClick={handleAddToEmailList}
        >
          Add to Email List
        </button>
        {/* Pagination Controls */}
        {!isSearching && (
          <div className="flex items-center justify-between mt-4">
            <button
              className="px-3 py-1 rounded border disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              Previous
            </button>
            <span>
              Page {page}
              {total !== null && <> of {Math.ceil(total / PAGE_SIZE)}</>}
            </span>
            <button
              className="px-3 py-1 rounded border disabled:opacity-50"
              onClick={() => setPage((p) => p + 1)}
              disabled={
                loading ||
                (total !== null && page >= Math.ceil(total / PAGE_SIZE)) ||
                voters.length < PAGE_SIZE
              }
            >
              Next
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div>Loading...</div>
        ) : error ? (
          <div className="text-red-500">{error}</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="border-b p-2 text-left w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="border-b p-2 text-left">Name</th>
                <th className="border-b p-2 text-left">City</th>
                <th className="border-b p-2 text-left">Last Template Sent</th>
              </tr>
            </thead>
            <tbody>
              {voters
                .filter(({ full_name }) =>
                  full_name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((voter) => {
                  const id = voter._id.$oid || voter._id;
                  return (
                    <tr key={id}>
                      <td className="border-b p-2">
                        <input
                          type="checkbox"
                          checked={!!selected[id]}
                          onChange={() => handleCheckbox(id)}
                          aria-label={`Select ${voter.full_name}`}
                        />
                      </td>
                      <td className="border-b p-2">{voter.full_name}</td>
                      <td className="border-b p-2">
                        {voter.demographics.city}
                      </td>
                      <td className="border-b p-2">
                        {voter.last_template_sent || "-"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
