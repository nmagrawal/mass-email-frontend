import type {
  RunTotals,
  SerializedEdition,
  SerializedRun,
  SerializedStopDelivery,
} from "@/lib/paper-distribution";

export type Edition = SerializedEdition & {
  summary?: {
    runs: number;
    unassignedRuns: number;
    completedRuns: number;
    allocated: number;
    delivered: number;
    pickedUp: number;
  };
};
export type Run = SerializedRun;
export type StopRecord = SerializedStopDelivery;
export type Totals = RunTotals;

export type RunWithTotals = Run & { totals: Totals };

export type EditionDetail = {
  edition: Edition;
  runs: RunWithTotals[];
  stops: StopRecord[];
  totals: {
    copiesAvailable: number;
    allocated: number;
    unallocated: number;
    loaded: number;
    delivered: number;
    pickedUp: number;
    returned: number;
    damaged: number;
    unaccounted: number;
    runs: number;
    unassignedRuns: number;
    completedRuns: number;
    inProgressRuns: number;
  };
  duplicates: { locationId: string; label: string; runs: string[] }[];
};

export type RunDetail = {
  run: Run;
  stops: StopRecord[];
  totals: Totals;
  edition: Edition | null;
};

export type Driver = { clerkUserId: string; name: string; role: string; email: string };

export const RUN_STATUS_LABEL: Record<string, string> = {
  planned: "No driver",
  assigned: "Assigned",
  in_progress: "In progress",
  interrupted: "Interrupted",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const RUN_STATUS_STYLE: Record<string, string> = {
  planned: "bg-amber-100 text-amber-800",
  assigned: "bg-blue-100 text-blue-800",
  in_progress: "bg-indigo-100 text-indigo-800",
  interrupted: "bg-red-100 text-red-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-gray-200 text-gray-600",
};

export const STOP_STATUS_STYLE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  delivered: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  skipped: "bg-red-100 text-red-800",
};

export const QUICK_REASONS = [
  "Closed",
  "No space / rack full",
  "Refused",
  "Couldn't access",
  "Ran out of papers",
  "Location gone",
];

export function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/* YYYY-MM-DD in local time, for <input type="date">. */
export function toDateInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function n(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString();
}
