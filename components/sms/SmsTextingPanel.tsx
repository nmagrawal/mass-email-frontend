import React, { useState } from "react";
import type { MassTextContact } from "../text/mass-text-campaign";
import { MassTextCampaign } from "../text/mass-text-campaign";
import { VoterListPanelSMS } from "../text/voter-list-panel-sms";
import { SmsTemplateManager } from "./SmsTemplateManager";
import { CampaignLauncher } from "./CampaignLauncher";
import { VoterInbox } from "./VoterInbox";
import { MassTextingSidebar } from "./MassTextingSidebar";

export default function SmsTextingPanel() {
  const [mainTab, setMainTab] = useState("modern");
  const [classicContacts, setClassicContacts] = useState<MassTextContact[]>([]);

  // For classic mass texting, keep the same layout as before
  const renderClassic = () => (
    <div className="flex gap-8">
      <div className="w-2/3">
        <MassTextCampaign
          onSend={async () => {}}
          initialContacts={classicContacts}
          setContacts={setClassicContacts}
        />
      </div>
      <div className="w-1/3 min-w-[320px]">
        <VoterListPanelSMS
          onAddToTextList={(newContacts) => {
            setClassicContacts((prev) => {
              const map = new Map();
              [...prev, ...newContacts].forEach((c) => {
                if (c.phone) map.set(c.phone, c);
              });
              return Array.from(map.values());
            });
          }}
        />
      </div>
    </div>
  );

  // Modern UI: Tabs for Templates, Campaigns, Inbox
  const [tab, setTab] = useState("campaigns");
  const renderModern = () => (
    <div className="flex h-full min-h-[600px] bg-white rounded shadow">
      <div className="w-48 border-r bg-gray-50 flex flex-col">
        <div className="p-4 font-bold text-lg border-b">Mass Texting</div>
        <nav className="flex-1 flex flex-col gap-2 p-4">
          {[
            { key: "templates", label: "Templates" },
            { key: "campaigns", label: "Campaigns" },
            { key: "inbox", label: "Inbox" },
          ].map((t) => (
            <button
              key={t.key}
              className={`text-left px-3 py-2 rounded transition font-medium ${tab === t.key ? "bg-blue-600 text-white" : "hover:bg-blue-100"}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex-1 p-6 overflow-auto">
        {tab === "templates" && <SmsTemplateManager />}
        {tab === "campaigns" && <CampaignLauncher />}
        {tab === "inbox" && <VoterInbox />}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-[600px] bg-white rounded shadow">
      <MassTextingSidebar tab={mainTab} setTab={setMainTab} />
      <div className="flex-1 p-6 overflow-auto">
        {mainTab === "modern" ? renderModern() : renderClassic()}
      </div>
    </div>
  );
}
