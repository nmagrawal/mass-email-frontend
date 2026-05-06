import React, { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiClient";

export function CampaignLauncher() {
  const [campaignName, setCampaignName] = useState("Chirag");
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [audienceType, setAudienceType] = useState<"upload" | "city">("upload");
  // Contacts state: array of { phone, name }
  const [contacts, setContacts] = useState<{ phone: string; name?: string }[]>([
    { phone: "", name: "" },
  ]);
  const [bulkInput, setBulkInput] = useState("");
  const [showBulkInput, setShowBulkInput] = useState(false);
  const [city, setCity] = useState("");
  const [cityList, setCityList] = useState<string[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);
  // Fetch city list when city audience is selected
  useEffect(() => {
    if (audienceType === "city" && cityList.length === 0 && !cityLoading) {
      setCityLoading(true);
      setCityError(null);
      fetch("/api/voters?distinct=city")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data.cities)) {
            setCityList(data.cities);
          } else if (Array.isArray(data)) {
            setCityList(data);
          } else {
            setCityError("Failed to load cities");
          }
        })
        .catch(() => setCityError("Failed to load cities"))
        .finally(() => setCityLoading(false));
    }
  }, [audienceType, cityList.length, cityLoading]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/sms/templates/")
      .then((res) => res.json())
      .then((data) => setTemplates(data.templates || []));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const payload: any = {
        campaign_name: campaignName,
        template_id: selectedTemplate,
        audience:
          audienceType === "upload"
            ? {
                contacts: contacts
                  .filter((c) => c.phone.trim())
                  .map((c) => ({
                    phone: c.phone.trim(),
                    name: c.name?.trim(),
                  })),
              }
            : { city },
      };
      const res = await apiFetch("/api/sms/campaign/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to launch campaign");
      setMsg("Campaign launched!");
      setCampaignName("");
      setSelectedTemplate("");
      setContacts([{ phone: "", name: "" }]);
      setCity("");
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 p-4 bg-white rounded shadow"
    >
      <h2 className="text-lg font-bold">Launch SMS Campaign</h2>
      <input
        className="input w-full border p-2 rounded"
        placeholder="Campaign Name"
        value={campaignName}
        onChange={(e) => setCampaignName(e.target.value)}
        required
      />
      <select
        className="input w-full border p-2 rounded"
        value={selectedTemplate}
        onChange={(e) => setSelectedTemplate(e.target.value)}
        required
      >
        <option value="">Select Template</option>
        {templates.map((t) => (
          <option key={t._id} value={t._id}>
            {t.name}
          </option>
        ))}
      </select>
      <div className="flex gap-4">
        <label>
          <input
            type="radio"
            checked={audienceType === "upload"}
            onChange={() => setAudienceType("upload")}
          />
          Upload Contacts
        </label>
        <label>
          <input
            type="radio"
            checked={audienceType === "city"}
            onChange={() => setAudienceType("city")}
          />
          Select by City
        </label>
      </div>
      {audienceType === "upload" ? (
        <div>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              className="rounded bg-gray-200 text-gray-800 px-2 py-1 text-xs font-medium border border-gray-300"
              onClick={() => setShowBulkInput((v) => !v)}
            >
              {showBulkInput ? "Hide Bulk Input" : "Bulk Input"}
            </button>
            <button
              type="button"
              className="rounded bg-gray-200 text-gray-800 px-2 py-1 text-xs font-medium border border-gray-300"
              onClick={() => {
                // Prevent adding duplicate blank contact
                if (
                  contacts.length === 0 ||
                  contacts[contacts.length - 1].phone.trim() ||
                  contacts[contacts.length - 1].name?.trim()
                ) {
                  setContacts([...contacts, { phone: "", name: "" }]);
                }
              }}
            >
              Add Contact
            </button>
            <button
              type="button"
              className="rounded bg-red-100 text-red-700 px-2 py-1 text-xs font-medium border border-red-300"
              onClick={() => setContacts([{ phone: "", name: "" }])}
            >
              Remove All
            </button>
          </div>
          {showBulkInput && (
            <div className="mb-2">
              <textarea
                className="input w-full border p-2 rounded"
                placeholder="One per line: phone,name"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                rows={3}
              />
              <button
                type="button"
                className="rounded bg-blue-600 text-white px-3 py-1 mt-1"
                onClick={() => {
                  const lines = bulkInput.trim().split("\n");
                  const newContacts: { phone: string; name?: string }[] = [];
                  for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;
                    let phone = "";
                    let name = "";
                    if (trimmedLine.includes(",")) {
                      const parts = trimmedLine.split(",");
                      phone = parts[0].trim();
                      name = parts[1]?.trim() || "";
                    } else {
                      phone = trimmedLine;
                    }
                    if (phone) {
                      newContacts.push({ phone, name: name || phone });
                    }
                  }
                  if (newContacts.length > 0) {
                    setContacts(newContacts);
                    setBulkInput("");
                    setShowBulkInput(false);
                  }
                }}
              >
                Import
              </button>
            </div>
          )}
          <div
            className="flex flex-col gap-2 border rounded max-h-72 overflow-y-auto bg-white"
            style={{ minHeight: 48 }}
          >
            {contacts.length === 0 ? (
              <div className="p-2 text-sm text-gray-400">
                No contacts added.
              </div>
            ) : (
              contacts.map((contact, i) => (
                <div
                  key={i}
                  className="flex gap-2 items-center px-2 py-1 border-b last:border-b-0"
                >
                  <input
                    className="rounded border p-2 flex-1"
                    type="text"
                    placeholder="Phone number"
                    value={contact.phone}
                    onChange={(e) =>
                      setContacts(
                        contacts.map((c, j) =>
                          j === i ? { ...c, phone: e.target.value } : c,
                        ),
                      )
                    }
                  />
                  <input
                    className="rounded border p-2 flex-1"
                    type="text"
                    placeholder="Name (optional)"
                    value={contact.name || ""}
                    onChange={(e) =>
                      setContacts(
                        contacts.map((c, j) =>
                          j === i ? { ...c, name: e.target.value } : c,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="rounded bg-red-200 text-red-800 px-2 py-1 text-xs font-medium border border-red-300"
                    onClick={() => {
                      const updated = contacts.filter((_, j) => j !== i);
                      setContacts(
                        updated.length === 0
                          ? [{ phone: "", name: "" }]
                          : updated,
                      );
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div>
          {cityLoading ? (
            <div className="text-xs text-gray-500">Loading cities...</div>
          ) : cityError ? (
            <div className="text-xs text-red-500">{cityError}</div>
          ) : (
            <select
              className="input w-full border p-2 rounded"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              <option value="">Select City</option>
              {cityList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <button
        className="btn bg-blue-600 text-white px-4 py-2 rounded"
        type="submit"
        disabled={loading}
      >
        {loading ? "Sending..." : "Send Campaign"}
      </button>
      {msg && <div className="text-sm">{msg}</div>}
    </form>
  );
}
