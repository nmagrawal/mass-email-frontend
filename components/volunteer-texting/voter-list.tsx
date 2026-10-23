"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPhone } from "@/lib/outreach-render";
import { cn } from "@/lib/utils";

import {
  formatWhen,
  type OutreachVoter,
  type VoterFilter,
} from "./types";

const FILTER_OPTIONS: { value: VoterFilter; label: string }[] = [
  { value: "not_sent", label: "Not texted" },
  { value: "pending", label: "My unconfirmed" },
  { value: "sent", label: "Texted" },
  { value: "all", label: "All" },
];

type Props = {
  voters: OutreachVoter[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  error: string;
  search: string;
  onSearchChange: (value: string) => void;
  filter: VoterFilter;
  onFilterChange: (value: VoterFilter) => void;
  district2Only: boolean;
  onDistrict2Change: (value: boolean) => void;
  selectedId: string | null;
  onSelect: (voter: OutreachVoter) => void;
  currentUserId?: string | null;
};

export function VoterStatusPill({
  voter,
  currentUserId,
}: {
  voter: OutreachVoter;
  currentUserId?: string | null;
}) {
  if (voter.pendingSms && voter.pendingSms.initiatedBy === currentUserId) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        Confirm pending
      </span>
    );
  }

  if (voter.lastSentSms) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        Texted {formatWhen(voter.lastSentSms.sentAt).split(",")[0]}
      </span>
    );
  }

  if (voter.pendingSms) {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
        In progress
      </span>
    );
  }

  return null;
}

export function VoterList({
  voters,
  total,
  loading,
  page,
  pageSize,
  onPageChange,
  error,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  district2Only,
  onDistrict2Change,
  selectedId,
  onSelect,
  currentUserId,
}: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // Start each page at the top of the list.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [page]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name or phone"
            className="pl-9"
            inputMode="search"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onFilterChange(option.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                filter === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={district2Only}
            onChange={(e) => onDistrict2Change(e.target.checked)}
            className="h-4 w-4"
          />
          District 2 only
        </label>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading voters…
          </div>
        ) : voters.length === 0 && !error ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No voters match.
          </div>
        ) : (
          <>
            <div className="px-3 pt-3 text-xs text-muted-foreground">
              {((page - 1) * pageSize + 1).toLocaleString()}–
              {Math.min(page * pageSize, total).toLocaleString()} of {total.toLocaleString()} voter
              {total === 1 ? "" : "s"}
            </div>
            <ul className="divide-y">
              {voters.map((voter) => (
                <li key={voter.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(voter)}
                    className={cn(
                      "flex w-full flex-col gap-1 px-3 py-3 text-left transition hover:bg-accent",
                      selectedId === voter.id && "bg-accent",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">
                        {voter.name.full || "Unknown voter"}
                      </span>
                      <VoterStatusPill voter={voter} currentUserId={currentUserId} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatPhone(voter.phone)}</span>
                      {voter.flags.superVoter && <span>· Super</span>}
                      {!voter.flags.superVoter && voter.flags.frequentVoter && (
                        <span>· Frequent</span>
                      )}
                      {voter.flags.district2 && <span>· D2</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {total > pageSize && (
        <Pagination
          page={page}
          totalPages={Math.ceil(total / pageSize)}
          disabled={loading}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  disabled,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  disabled: boolean;
  onPageChange: (page: number) => void;
}) {
  const [jumpValue, setJumpValue] = useState(String(page));

  useEffect(() => {
    setJumpValue(String(page));
  }, [page]);

  function jump(e: React.FormEvent) {
    e.preventDefault();
    const target = Number.parseInt(jumpValue, 10);

    if (!Number.isFinite(target)) {
      setJumpValue(String(page));
      return;
    }

    const clamped = Math.min(totalPages, Math.max(1, target));
    setJumpValue(String(clamped));
    if (clamped !== page) onPageChange(clamped);
  }

  return (
    <div className="flex items-center justify-between gap-2 border-t p-2">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <form onSubmit={jump} className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span>Page</span>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={totalPages}
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          className="h-8 w-16 px-2 text-center"
          aria-label="Page number"
        />
        <span>of {totalPages.toLocaleString()}</span>
        <Button type="submit" size="sm" variant="secondary" disabled={disabled}>
          Go
        </Button>
      </form>

      <Button
        variant="outline"
        size="icon"
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || page >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
