"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  MessageCircle,
  Loader2,
  Search,
  RefreshCw,
  ChevronDown,
  X,
} from "lucide-react";

const PAGE_SIZE = 20;
const SEARCH_PAGE_SIZE = 50;
const DEBOUNCE_DELAY = 500;

interface SmsInboxListProps {
  selectedVoter: Voter | null;
  setSelectedVoter: (voter: Voter) => void;
}

export interface Voter {
  id: string;
  name?: string | null;
  phone: string;
  normalizedPhone?: string | null;
  lastMessage?: string | null;
  lastMessageTime?: string | null;
  unreadCount?: number | null;
}

interface InboxApiResponse {
  conversations?: Voter[];
  total?: number;
  error?: string;
  message?: string;
  detail?: Array<{ msg?: string }>;
}

function useDebouncedValue<T>(value: T, delay = DEBOUNCE_DELAY) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function SmsInboxList({
  selectedVoter,
  setSelectedVoter,
}: SmsInboxListProps) {
  const [voters, setVoters] = useState<Voter[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cacheRef = useRef<Map<string, InboxApiResponse>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const votersLengthRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    votersLengthRef.current = voters.length;
  }, [voters.length]);

  const debouncedSearch = useDebouncedValue(searchQuery.trim());
  const isSearching = debouncedSearch.length > 0;
  const limit = isSearching ? SEARCH_PAGE_SIZE : PAGE_SIZE;

  const makeCacheKey = useCallback(
    (skip: number) => `${debouncedSearch || "__all__"}:${skip}:${limit}`,
    [debouncedSearch, limit]
  );

  const requestPage = useCallback(
    async (skip: number, force = false) => {
      const key = makeCacheKey(skip);

      if (!force && cacheRef.current.has(key)) {
        return cacheRef.current.get(key)!;
      }

      if (inFlightRef.current.has(key)) {
        return null;
      }

      inFlightRef.current.add(key);

      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(limit),
      });

      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }

      const res = await fetch(`/api/inbound-messages?${params.toString()}`, {
        method: "GET",
        cache: "force-cache",
      });

      const data: InboxApiResponse = await res.json().catch(() => ({}));

      inFlightRef.current.delete(key);

      if (!res.ok) {
        throw new Error(
          data?.detail?.[0]?.msg ||
            data?.message ||
            data?.error ||
            "Failed to fetch inbound messages"
        );
      }

      cacheRef.current.set(key, data);
      return data;
    },
    [debouncedSearch, limit, makeCacheKey]
  );

  const prefetchNextPage = useCallback(
    async (nextSkip: number) => {
      if (nextSkip >= total && total > 0) return;

      try {
        await requestPage(nextSkip);
      } catch {
        // silent prefetch fail
      }
    },
    [requestPage, total]
  );

  const fetchVoters = useCallback(
    async (options?: { reset?: boolean; refresh?: boolean }) => {
      const reset = options?.reset ?? false;
      const refresh = options?.refresh ?? false;
      const skip = reset || refresh ? 0 : votersLengthRef.current;

      try {
        if (refresh) setRefreshing(true);
        else if (reset) setLoading(true);
        else setLoadingMore(true);

        setError(null);

        if (refresh) {
          cacheRef.current.clear();
        }

        const data = await requestPage(skip, refresh);

        if (!data) return;

        const nextConversations = Array.isArray(data.conversations)
          ? data.conversations
          : [];

        const nextTotal = Number(data.total || 0);
        setTotal(nextTotal);

        if (reset || refresh) {
          setVoters(nextConversations);
        } else {
          setVoters((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const uniqueNext = nextConversations.filter(
              (item) => item?.id && !existingIds.has(item.id)
            );

            return [...prev, ...uniqueNext];
          });
        }

        const nextSkip = skip + nextConversations.length;
        if (nextSkip < nextTotal) {
          prefetchNextPage(nextSkip);
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Something went wrong";

        setError(message);
        console.error("Error fetching inbound messages:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [requestPage, prefetchNextPage]
  );

  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setVoters([]);
    setTotal(0);
    fetchVoters({ reset: true });

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [debouncedSearch, fetchVoters]);

  const hasMore = voters.length < total;

  function formatDate(dateValue?: string | null) {
    if (!dateValue) return null;

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
  }

  if (loading) {
    return (
      <div className="w-96 h-full min-h-0 border-r border-slate-700 bg-slate-800 flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-cyan-400 mb-3" size={40} />
        <p className="text-sm text-slate-300">Loading conversations...</p>
      </div>
    );
  }

  return (
    <div className="w-96 h-full min-h-0 border-r border-slate-700 bg-linear-to-b from-slate-800 to-slate-900 flex flex-col overflow-hidden shadow-2xl">
      <div className="shrink-0 p-5 border-b border-slate-700 bg-slate-800/50 backdrop-blur">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <MessageCircle size={22} className="text-cyan-400" />
            <h3 className="font-bold text-lg text-white">Conversations</h3>
          </div>

          <button
            type="button"
            onClick={() => fetchVoters({ reset: true, refresh: true })}
            disabled={refreshing}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white transition disabled:opacity-60"
            title="Refresh conversations"
          >
            <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <Input
            placeholder="Search by name, phone, or message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10 h-10 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />

          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
              title="Clear search"
            >
              <X size={17} />
            </button>
          )}
        </div>

        {searchQuery.trim() !== debouncedSearch && (
          <p className="mt-2 text-xs text-slate-400">Searching...</p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
        {error && (
          <div className="p-4 m-3 text-sm text-red-300 bg-red-900/30 border border-red-700/50 rounded-lg">
            <p className="font-semibold mb-1">Could not load conversations</p>
            <p>{error}</p>
          </div>
        )}

        {!error && voters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 p-4">
            <MessageCircle size={48} className="opacity-30 mb-3" />
            <p className="text-sm text-center">
              {debouncedSearch ? "No conversations found" : "No conversations yet"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {voters.map((voter) => {
              const isSelected = selectedVoter?.id === voter.id;
              const displayDate = formatDate(voter.lastMessageTime);

              return (
                <button
                  key={voter.id}
                  type="button"
                  onClick={() => setSelectedVoter(voter)}
                  className={`w-full px-4 py-3.5 text-left transition-all duration-200 hover:bg-slate-700/50 group ${
                    isSelected
                      ? "bg-linear-to-r from-cyan-500/20 to-blue-500/10 border-l-4 border-l-cyan-400"
                      : "border-l-4 border-l-transparent hover:border-l-slate-500"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-semibold text-sm truncate ${
                          isSelected
                            ? "text-cyan-300"
                            : "text-white group-hover:text-cyan-300"
                        }`}
                      >
                        {voter.name || voter.phone || "Unknown Sender"}
                      </p>

                      <p className="text-xs text-slate-400 truncate mt-1 group-hover:text-slate-300">
                        {voter.lastMessage || "No messages"}
                      </p>

                      <p className="text-xs text-slate-500 truncate mt-1">
                        {voter.phone || voter.normalizedPhone || "No phone"}
                      </p>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-2">
                      {displayDate && (
                        <span className="text-[11px] text-slate-500">
                          {displayDate}
                        </span>
                      )}

                      {!!voter.unreadCount && voter.unreadCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full text-xs font-bold bg-linear-to-r from-cyan-500 to-blue-500 text-white shadow-lg">
                          {voter.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            {hasMore && !error && (
              <div className="p-3">
                <button
                  type="button"
                  onClick={() => fetchVoters()}
                  disabled={loadingMore}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-200 py-2 text-sm transition disabled:opacity-60"
                >
                  {loadingMore ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-700 p-3 bg-slate-900/50 text-xs text-slate-400 text-center">
        {voters.length} of {total} conversation{total !== 1 ? "s" : ""}
      </div>
    </div>
  );
}