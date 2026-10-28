"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { STOP_STATUS_STYLE, formatDate, n, toDateInput } from "./delivery-types";
import { readJson, type City } from "./types";

type Report = {
  latestEdition: { id: string; name: string; publishDate: string } | null;
  runStatus: Record<string, number>;
  byEdition: {
    editionId: string;
    name: string;
    publishDate: string;
    status: string;
    copiesAvailable: number;
    allocated: number;
    loaded: number;
    delivered: number;
    pickedUp: number;
    returned: number;
    damaged: number;
    unaccounted: number;
    runs: number;
    completedRuns: number;
    skippedStops: number;
    partialStops: number;
  }[];
  byLocation: {
    locationId: string;
    label: string;
    rounds: number;
    planned: number;
    dropped: number;
    pickedUp: number;
    skipped: number;
    partial: number;
    leftoverRate: number | null;
    last: { date: string; dropped: number | null; pickedUp: number | null } | null;
  }[];
  problems: {
    editionName: string;
    publishDate: string;
    locationId: string;
    label: string;
    status: string;
    planned: number;
    delivered: number | null;
    reason: string;
    autoSkipped: boolean;
    recordedBy: string | null;
  }[];
  notPlanned: { locationId: string; label: string; area: string }[];
};

function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = rows
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export function ReportsPanel({ city }: { city: City }) {
  const [from, setFrom] = useState(toDateInput(new Date(Date.now() - 56 * 86400000)));
  const [to, setTo] = useState(toDateInput(new Date(Date.now() + 7 * 86400000)));
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/paper/reports?cityId=${encodeURIComponent(city.id)}&from=${from}&to=${to}`)
      .then((r) => readJson<Report>(r))
      .then((d) => !cancelled && setReport(d))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [city.id, from, to]);

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 md:p-5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          From
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
        </label>
        {loading && <Loader2 className="mb-2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {error && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>}

      {report && (
        <>
          {report.latestEdition && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">
                Latest: {report.latestEdition.name} ({formatDate(report.latestEdition.publishDate)})
              </h3>
              <div className="flex flex-wrap gap-2 text-sm">
                {["unassigned", "assigned", "in_progress", "interrupted", "completed"].map((k) => (
                  <span key={k} className="rounded-lg border px-3 py-1.5">
                    <span className="text-muted-foreground">{k.replace("_", " ")}</span>{" "}
                    <b className={cn(k === "unassigned" && report.runStatus[k] && "text-amber-700", k === "interrupted" && report.runStatus[k] && "text-red-700")}>
                      {report.runStatus[k] ?? 0}
                    </b>
                  </span>
                ))}
                <span className="rounded-lg border px-3 py-1.5">
                  <span className="text-muted-foreground">active locations not planned</span>{" "}
                  <b className={cn(report.notPlanned.length && "text-amber-700")}>{report.notPlanned.length}</b>
                </span>
              </div>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Copies by edition</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  downloadCsv(`editions-${city.id}-${from}-${to}.csv`, [
                    ["Edition", "Date", "Available", "Allocated", "Loaded", "Dropped", "Old picked up", "Returned", "Damaged", "Unaccounted", "Runs", "Completed", "Skipped stops", "Partial stops"],
                    ...report.byEdition.map((e) => [e.name, e.publishDate.slice(0, 10), e.copiesAvailable, e.allocated, e.loaded, e.delivered, e.pickedUp, e.returned, e.damaged, e.unaccounted, e.runs, e.completedRuns, e.skippedStops, e.partialStops]),
                  ])
                }
              >
                <Download className="h-4 w-4" /> CSV
              </Button>
            </div>
            <Table
              head={["Edition", "Available", "Allocated", "Loaded", "Dropped", "Old picked up", "Returned", "Damaged", "Unaccounted", "Runs", "Skipped/partial"]}
              rows={report.byEdition.map((e) => [
                <span key="n">
                  <span className="font-medium">{e.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{formatDate(e.publishDate)} · {e.status}</span>
                </span>,
                n(e.copiesAvailable),
                n(e.allocated),
                n(e.loaded),
                n(e.delivered),
                n(e.pickedUp),
                n(e.returned),
                n(e.damaged),
                <span key="u" className={cn(e.unaccounted !== 0 && "font-semibold text-red-700")}>{n(e.unaccounted)}</span>,
                `${e.completedRuns}/${e.runs}`,
                `${e.skippedStops}/${e.partialStops}`,
              ])}
              empty="No editions in this period."
            />
          </section>

          <section>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Drops and pickups by location</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  downloadCsv(`locations-${city.id}-${from}-${to}.csv`, [
                    ["Location", "Rounds", "Planned", "Dropped", "Old picked up", "Leftover %", "Skipped", "Partial", "Last date", "Last dropped", "Last picked up"],
                    ...report.byLocation.map((l) => [l.label, l.rounds, l.planned, l.dropped, l.pickedUp, l.leftoverRate == null ? "" : Math.round(l.leftoverRate * 100), l.skipped, l.partial, l.last?.date.slice(0, 10) ?? "", l.last?.dropped ?? "", l.last?.pickedUp ?? ""]),
                  ])
                }
              >
                <Download className="h-4 w-4" /> CSV
              </Button>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              Leftover % = old papers picked up ÷ papers dropped. High values suggest the allocation is too large.
            </p>
            <Table
              head={["Location", "Rounds", "Planned", "Dropped", "Old picked up", "Leftover", "Skipped", "Last round"]}
              rows={report.byLocation.map((l) => [
                <span key="l" className="font-medium">{l.label}</span>,
                l.rounds,
                n(l.planned),
                n(l.dropped),
                n(l.pickedUp),
                <span key="r" className={cn(l.leftoverRate != null && l.leftoverRate >= 0.5 && "font-semibold text-amber-700")}>
                  {pct(l.leftoverRate)}
                </span>,
                l.skipped + (l.partial ? ` (+${l.partial} partial)` : ""),
                l.last ? `${formatDate(l.last.date)}: ${n(l.last.dropped)} dropped, ${n(l.last.pickedUp)} picked up` : "—",
              ])}
              empty="No recorded deliveries in this period."
            />
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Missed and short deliveries</h3>
            <Table
              head={["Date", "Location", "Status", "Planned", "Dropped", "Reason", "By"]}
              rows={report.problems.map((p) => [
                formatDate(p.publishDate),
                p.label,
                <span key="s" className={cn("rounded-full px-2 py-0.5 text-xs", STOP_STATUS_STYLE[p.status])}>{p.status}</span>,
                n(p.planned),
                n(p.delivered),
                <span key="r" className={cn(p.autoSkipped && "text-muted-foreground")}>{p.reason}</span>,
                p.recordedBy ?? "—",
              ])}
              empty="No skipped or partial stops. 🎉"
            />
          </section>

          {report.notPlanned.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Active locations not in the latest edition</h3>
              <div className="flex flex-wrap gap-1.5">
                {report.notPlanned.map((l) => (
                  <span key={l.locationId} className="rounded-full border px-2.5 py-1 text-xs">
                    {l.label}
                    {l.area ? <span className="text-muted-foreground"> · {l.area}</span> : null}
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) {
    return <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td key={j} className={cn("px-2 py-1.5", j > 0 && typeof c !== "object" && "tabular-nums")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
