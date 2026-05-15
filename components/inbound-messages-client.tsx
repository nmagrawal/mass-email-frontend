"use client";
import React, { useEffect, useState } from "react";

const PAGE_SIZE = 20;

export default function InboundMessagesClient() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function fetchInboundMessages() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/inbound-messages?skip=${(page - 1) * PAGE_SIZE}&limit=${PAGE_SIZE}`,
        );
        if (!res.ok) throw new Error("Failed to fetch inbound messages");
        const data = await res.json();
        setMessages(data.messages || []);
        setTotal(data.total || 0);
      } catch (err: any) {
        setError(err.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchInboundMessages();
  }, [page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Inbound Messages</h1>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div className="text-red-600">Error: {error}</div>
      ) : (
        <>
          <table className="min-w-full border mb-4 table-fixed">
            <colgroup>
              <col style={{ width: "18%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "46%" }} />
              <col style={{ width: "18%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="border px-4 py-2">Sender</th>
                <th className="border px-4 py-2">Phone</th>
                <th className="border px-4 py-2">Message</th>
                <th className="border px-4 py-2">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg: any, idx: number) => (
                <tr key={idx}>
                  <td
                    className="border px-4 py-2 truncate"
                    style={{ maxWidth: 120 }}
                  >
                    {msg.full_name}
                  </td>
                  <td
                    className="border px-4 py-2 truncate"
                    style={{ maxWidth: 120 }}
                  >
                    {msg.phone}
                  </td>
                  <td
                    className="border px-4 py-2 whitespace-pre-line break-words"
                    style={{ maxWidth: 400, wordBreak: "break-word" }}
                  >
                    {msg.text}
                  </td>
                  <td
                    className="border px-4 py-2 truncate"
                    style={{ maxWidth: 140 }}
                  >
                    {new Date(msg.timestamp)
                      .toISOString()
                      .replace("T", " ")
                      .replace("Z", "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 border rounded disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages || 1}
            </span>
            <button
              className="px-3 py-1 border rounded disabled:opacity-50"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
