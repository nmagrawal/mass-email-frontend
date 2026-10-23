"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";

import { cn } from "@/lib/utils";

import { TemplateManager } from "./template-manager";
import {
  readJson,
  type OutreachTemplate,
  type OutreachVoter,
  type VoterFilter,
} from "./types";
import { VoterList } from "./voter-list";
import { VoterOutreachPanel } from "./voter-outreach-panel";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

type Tab = "voters" | "templates";

type VotersResponse = {
  campaignId: string;
  voters: OutreachVoter[];
  total: number;
  stats: { sent: number; sentByMe: number };
};

export function VolunteerTextingClient() {
  const { user } = useUser();
  const currentUserId = user?.id ?? null;

  const [tab, setTab] = useState<Tab>("voters");

  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<VoterFilter>("not_sent");
  const [district2Only, setDistrict2Only] = useState(false);

  const [voters, setVoters] = useState<OutreachVoter[]>([]);
  const [total, setTotal] = useState(0);
  const [campaignId, setCampaignId] = useState("");
  const [stats, setStats] = useState({ sent: 0, sentByMe: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const selectedVoter = voters.find((v) => v.id === selectedId) || null;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      // A new search starts again at page 1.
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetch("/api/outreach/templates?channel=sms")
      .then((res) => readJson<{ templates: OutreachTemplate[] }>(res))
      .then((data) => setTemplates(data.templates))
      .catch((err) => setTemplatesError(err.message))
      .finally(() => setTemplatesLoading(false));
  }, []);

  const loadVoters = useCallback(
    async (pageNumber: number) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;

      const params = new URLSearchParams({
        filter,
        skip: String((pageNumber - 1) * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (district2Only) params.set("district2", "true");

      setLoading(true);
      setListError("");

      try {
        const data = await readJson<VotersResponse>(
          await fetch(`/api/outreach/voters?${params}`, { signal: controller.signal }),
        );
        setVoters(data.voters);
        setTotal(data.total);

        // Past the end (e.g. list shrank after confirming sends) → go to the last page.
        const lastPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
        if (pageNumber > lastPage) setPage(lastPage);
        setStats(data.stats);
        setCampaignId(data.campaignId);
      } catch (err: any) {
        if (err.name !== "AbortError") setListError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [filter, debouncedSearch, district2Only],
  );

  useEffect(() => {
    loadVoters(page);
  }, [loadVoters, page]);

  const patchVoter = useCallback((voterId: string, patch: Partial<OutreachVoter>) => {
    setVoters((prev) => prev.map((v) => (v.id === voterId ? { ...v, ...patch } : v)));
  }, []);

  const upsertTemplate = useCallback((template: OutreachTemplate) => {
    setTemplates((prev) =>
      [...prev.filter((t) => t.id !== template.id), template].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
  }, []);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 md:px-4">
        <div className="flex gap-1">
          {(["voters", "templates"] as Tab[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition",
                tab === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {value === "voters" ? "Text voters" : "Templates"}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          {campaignId && <span className="mr-2 font-mono">{campaignId}</span>}
          <b className="text-foreground">{stats.sent.toLocaleString()}</b> sent ·{" "}
          <b className="text-foreground">{stats.sentByMe.toLocaleString()}</b> by you
        </div>
      </div>

      {tab === "templates" ? (
        <div className="flex-1 overflow-y-auto">
          <TemplateManager
            templates={templates}
            loading={templatesLoading}
            error={templatesError}
            onSaved={upsertTemplate}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              "min-h-0 w-full border-r md:block md:w-[340px] md:shrink-0",
              selectedVoter ? "hidden" : "block",
            )}
          >
            <VoterList
              voters={voters}
              total={total}
              loading={loading}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              error={listError}
              search={search}
              onSearchChange={setSearch}
              filter={filter}
              onFilterChange={(value) => {
                setFilter(value);
                setPage(1);
              }}
              district2Only={district2Only}
              onDistrict2Change={(value) => {
                setDistrict2Only(value);
                setPage(1);
              }}
              selectedId={selectedId}
              onSelect={(voter) => setSelectedId(voter.id)}
              currentUserId={currentUserId}
            />
          </div>

          <div className={cn("min-h-0 flex-1", selectedVoter ? "block" : "hidden md:block")}>
            {selectedVoter ? (
              <VoterOutreachPanel
                key={selectedVoter.id}
                voter={selectedVoter}
                templates={templates}
                templatesLoading={templatesLoading}
                currentUserId={currentUserId}
                onBack={() => setSelectedId(null)}
                onVoterChange={patchVoter}
                onConfirmedSent={() =>
                  setStats((s) => ({ sent: s.sent + 1, sentByMe: s.sentByMe + 1 }))
                }
                onManageTemplates={() => setTab("templates")}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
                Select a voter to start texting.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
