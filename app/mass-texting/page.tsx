"use client";

import React, { useState } from "react";
import {
  MassTextCampaign,
  MassTextCampaignSendPayload,
  MassTextContact,
} from "../../components/text/mass-text-campaign";
import { VoterListPanelSMS } from "../../components/text/voter-list-panel-sms";

export default function MassTextingPage() {
  const [contacts, setContacts] = useState<MassTextContact[]>([]);

  const handleSend = async (data: MassTextCampaignSendPayload) => {
    const res = await fetch("/api/mass-texting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Failed to send");
  };

  const handleAddToTextList = (newContacts: MassTextContact[]) => {
    // Merge and deduplicate by phone
    setContacts((prev) => {
      const map = new Map<string, MassTextContact>();
      [...prev, ...newContacts].forEach((c) => {
        if (c.phone) map.set(c.phone, c);
      });
      return Array.from(map.values());
    });
  };

  return (
    <div className="max-w-5xl mx-auto py-10 flex gap-8">
      <div className="w-2/3">
        <MassTextCampaign
          onSend={handleSend}
          initialContacts={contacts}
          setContacts={setContacts}
        />
      </div>
      <div className="w-1/3 min-w-[320px]">
        <VoterListPanelSMS onAddToTextList={handleAddToTextList} />
      </div>
    </div>
  );
}
