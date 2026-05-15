import React, { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiClient";

export function VoterInbox() {
  const [voters, setVoters] = useState<any[]>([]);
  const [selectedVoter, setSelectedVoter] = useState<any>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch("/api/sms/voters")
      .then((res) => res.json())
      .then((data) => setVoters(data.voters || []));
  }, []);

  useEffect(() => {
    if (!selectedVoter) return;
    setLoading(true);
    apiFetch(`/api/sms/chats?voter_id=${selectedVoter.id}`)
      .then((res) => res.json())
      .then((data) => {
        const smsChats = data.sms_chats || {};
        // Flatten all messages from all campaigns
        let allMessages: any[] = [];
        Object.values(smsChats).forEach((arr: any) => {
          if (Array.isArray(arr)) {
            allMessages = allMessages.concat(arr);
          }
        });
        // Sort by timestamp
        allMessages.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        setChats(allMessages);
      })
      .finally(() => setLoading(false));
  }, [selectedVoter]);

  return (
    <div className="flex h-[600px] bg-white rounded shadow">
      <div className="w-1/3 border-r overflow-y-auto">
        {voters.map((v) => (
          <div
            key={v.id}
            className={`p-2 cursor-pointer ${selectedVoter?.id === v.id ? "bg-blue-100" : ""}`}
            onClick={() => setSelectedVoter(v)}
          >
            {v.name || v.phone}
          </div>
        ))}
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        {loading ? (
          <div>Loading chat...</div>
        ) : (
          <div className="space-y-2">
            {chats.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`rounded px-3 py-2 max-w-xs ${msg.direction === "outbound" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-900"}`}
                  title={msg.timestamp}
                >
                  <div>{msg.text}</div>
                  <div className="text-xs text-gray-500 mt-1 text-right">
                    {new Date(msg.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
