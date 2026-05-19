"use client";

import React, { useState } from "react";
import { SmsSidebar } from "./sms-sidebar";
import { SmsInboxList } from "./sms-inbox-list";
import { SmsChatDetail } from "./sms-chat-detail";
import { SmsTemplatesList } from "./sms-templates-list";
import { SmsCampaignComposer } from "./sms-campaign-composer";

export type SmsTab = "inbox" | "campaigns" | "templates";

export function SmsClient() {
  const [activeTab, setActiveTab] = useState<SmsTab>("inbox");
  const [selectedVoter, setSelectedVoter] = useState<any>(null);

  return (
    <div className="h-screen max-h-screen min-h-0 w-full overflow-hidden flex bg-linear-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="shrink-0 h-full min-h-0 overflow-hidden">
        <SmsSidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>

      <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-hidden flex">
          {activeTab === "inbox" && (
            <>
              <div className="shrink-0 h-full min-h-0 overflow-hidden">
                <SmsInboxList
                  selectedVoter={selectedVoter}
                  setSelectedVoter={setSelectedVoter}
                />
              </div>

              <div className="flex-1 h-full min-h-0 overflow-hidden">
                <SmsChatDetail voter={selectedVoter} />
              </div>
            </>
          )}

          {activeTab === "campaigns" && (
            <div className="w-full h-full min-h-0 overflow-y-auto">
              <SmsCampaignComposer />
            </div>
          )}

          {activeTab === "templates" && (
            <div className="w-full h-full min-h-0 overflow-y-auto">
              <SmsTemplatesList />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}