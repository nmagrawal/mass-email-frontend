import type { SerializedHistory, SerializedTemplate } from "@/lib/outreach";

export type OutreachTemplate = SerializedTemplate;
export type OutreachRecord = SerializedHistory;

export type OutreachVoter = {
  id: string;
  name: { first: string; last: string; full: string };
  phone: string;
  email: string;
  address: string;
  party: string;
  flags: { superVoter: boolean; frequentVoter: boolean; district2: boolean };
  latestSms: OutreachRecord | null;
  lastSentSms: OutreachRecord | null;
  pendingSms: OutreachRecord | null;
};

export type VoterFilter = "all" | "not_sent" | "sent" | "pending";

export async function readJson<T = any>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data?.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      data?: any;
    };
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

export function formatWhen(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* Derive the list-row summary from a voter's full history (newest first). */
export function summarizeSms(history: OutreachRecord[]) {
  const sms = history.filter((r) => r.channel === "sms");
  return {
    latestSms: sms[0] ?? null,
    lastSentSms: sms.find((r) => r.status === "sent") ?? null,
    pendingSms: sms.find((r) => r.status === "initiated") ?? null,
  };
}
