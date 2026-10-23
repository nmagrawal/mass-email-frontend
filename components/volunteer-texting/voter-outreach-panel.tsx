"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, Loader2, MessageSquare, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  buildSmsLink,
  findUnknownPlaceholders,
  formatPhone,
  getSmsSegments,
  renderTemplate,
} from "@/lib/outreach-render";
import { cn } from "@/lib/utils";

import {
  formatWhen,
  readJson,
  summarizeSms,
  type OutreachRecord,
  type OutreachTemplate,
  type OutreachVoter,
} from "./types";

const TEMPLATE_STORAGE_KEY = "volunteerTexting.templateId";

type Props = {
  voter: OutreachVoter;
  templates: OutreachTemplate[];
  templatesLoading: boolean;
  currentUserId?: string | null;
  onBack: () => void;
  onVoterChange: (voterId: string, patch: Partial<OutreachVoter>) => void;
  onConfirmedSent: () => void;
  onManageTemplates: () => void;
};

type AttemptPayload = {
  voterId: string;
  channel: "sms";
  templateId: string;
  templateVersion: number;
  body: string;
  confirmDuplicate: boolean;
};

const STATUS_STYLES: Record<string, string> = {
  initiated: "bg-amber-100 text-amber-800",
  sent: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-gray-100 text-gray-700",
  failed: "bg-red-100 text-red-700",
};

export function VoterOutreachPanel({
  voter,
  templates,
  templatesLoading,
  currentUserId,
  onBack,
  onVoterChange,
  onConfirmedSent,
  onManageTemplates,
}: Props) {
  const [templateId, setTemplateId] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<OutreachRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "send" | "sent" | "cancelled" | "failed">("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [unrecorded, setUnrecorded] = useState<AttemptPayload | null>(null);

  const template = templates.find((t) => t.id === templateId) || null;
  const active = template?.active ?? null;

  const renderedTemplate = useMemo(
    () => (active ? renderTemplate(active.body, voter.name) : ""),
    [active, voter.name],
  );

  const smsHistory = history.filter((r) => r.channel === "sms");
  const lastSent = smsHistory.find((r) => r.status === "sent") || null;
  const pending = smsHistory.find((r) => r.status === "initiated") || null;
  const myPending = pending && pending.initiatedBy === currentUserId ? pending : null;
  const othersPending = pending && !myPending ? pending : null;

  const unknownPlaceholders = findUnknownPlaceholders(message);
  const edited = message !== renderedTemplate;

  // Pick the remembered template (or the first one) once templates load.
  useEffect(() => {
    if (templateId && templates.some((t) => t.id === templateId)) return;
    let remembered = "";
    try {
      remembered = localStorage.getItem(TEMPLATE_STORAGE_KEY) || "";
    } catch {}
    const next = templates.find((t) => t.id === remembered) || templates[0];
    setTemplateId(next?.id || "");
  }, [templates, templateId]);

  // Fresh preview whenever the voter or template version changes.
  useEffect(() => {
    setMessage(renderedTemplate);
  }, [renderedTemplate, voter.id]);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setError("");
    setHistory([]);

    fetch(`/api/outreach/history?voterId=${encodeURIComponent(voter.id)}`)
      .then((res) => readJson<{ history: OutreachRecord[] }>(res))
      .then((data) => {
        if (!cancelled) setHistory(data.history);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [voter.id]);

  function applyHistory(next: OutreachRecord[]) {
    setHistory(next);
    onVoterChange(voter.id, summarizeSms(next));
  }

  function upsertRecord(record: OutreachRecord, list = history) {
    const without = list.filter((r) => r.id !== record.id);
    return [record, ...without].sort(
      (a, b) =>
        new Date(b.initiatedAt || 0).getTime() - new Date(a.initiatedAt || 0).getTime(),
    );
  }

  function selectTemplate(id: string) {
    setTemplateId(id);
    try {
      localStorage.setItem(TEMPLATE_STORAGE_KEY, id);
    } catch {}
  }

  /*
   * One tap: "Send SMS" is a real <a href="sms:..."> so the tap itself opens
   * Messages (browsers only allow opening another app directly from a tap —
   * doing it after an await can be silently blocked, which once left the
   * previous voter's draft on screen). The attempt is recorded in parallel.
   */
  function handleSendClick() {
    if (!template || !active || !message.trim()) return;

    recordAttempt({
      voterId: voter.id,
      channel: "sms",
      templateId: template.id,
      templateVersion: active.version,
      body: message.trim(),
      // The "already sent" warning is visible whenever lastSent exists,
      // so tapping "Send again" is the explicit confirmation.
      confirmDuplicate: Boolean(lastSent),
    });
  }

  async function recordAttempt(payload: AttemptPayload) {
    setBusy("send");
    setError("");
    setUnrecorded(null);

    try {
      const data = await readJson<{ record: OutreachRecord }>(
        await fetch("/api/outreach/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          // The page may be backgrounded while Messages is open.
          keepalive: true,
        }),
      );

      // Earlier unconfirmed attempts by this volunteer were superseded server-side.
      const superseded = history.map((r) =>
        r.status === "initiated" && r.initiatedBy === currentUserId && r.channel === "sms"
          ? { ...r, status: "cancelled" as const }
          : r,
      );
      applyHistory(upsertRecord(data.record, superseded));
    } catch (err: any) {
      // Messages is already open at this point, so keep the payload and let
      // the volunteer record it once they've decided.
      setUnrecorded(payload);

      if (err.data?.code === "already_sent" && err.data.previousSent) {
        const prev = err.data.previousSent as OutreachRecord;
        applyHistory(upsertRecord(prev));
        setError(
          `Not recorded: ${prev.confirmedByName || prev.initiatedByName} already texted this voter ` +
            `${formatWhen(prev.sentAt)}. If you still send yours, tap "Record anyway".`,
        );
      } else {
        setError(`Couldn't record this attempt (${err.message}). Messages may still be open — try again.`);
      }
    } finally {
      setBusy("");
    }
  }

  async function resolvePending(status: "sent" | "cancelled" | "failed") {
    if (!myPending) return;

    setBusy(status);
    setError("");

    try {
      const res = await fetch(`/api/outreach/history/${myPending.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));

      if (data.record) {
        applyHistory(upsertRecord(data.record));
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to update");
      }

      if (status === "sent") {
        onConfirmedSent();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function copyMessage(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy — select the text manually.");
    }
  }

  const sendLabel = lastSent ? "Send again" : "Send SMS";
  const canSend = Boolean(active && message.trim() && voter.phone) && !busy;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2 border-b p-3 md:p-4">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Back to list">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{voter.name.full || "Unknown voter"}</h2>
          <a href={`tel:${voter.phone}`} className="text-sm text-primary underline-offset-2 hover:underline">
            {formatPhone(voter.phone)}
          </a>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {voter.flags.superVoter && <Tag>Super voter</Tag>}
            {voter.flags.frequentVoter && <Tag>Frequent voter</Tag>}
            {voter.flags.district2 && <Tag>San Ramon District 2</Tag>}
            {voter.party && <Tag>{voter.party}</Tag>}
          </div>
          {voter.address && (
            <div className="mt-1 truncate text-xs text-muted-foreground">{voter.address}</div>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3 md:p-4">
        {error && (
          <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <div>{error}</div>
            {unrecorded && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === "send"}
                  onClick={() =>
                    recordAttempt({
                      ...unrecorded,
                      // Only skip the duplicate check once the warning has been shown.
                      confirmDuplicate: unrecorded.confirmDuplicate || Boolean(lastSent),
                    })
                  }
                >
                  {busy === "send" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {lastSent ? "Record anyway" : "Try again"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setUnrecorded(null);
                    setError("");
                  }}
                >
                  I didn&apos;t send it
                </Button>
              </div>
            )}
          </div>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4" /> SMS
            </h3>
            <button
              type="button"
              onClick={onManageTemplates}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Manage templates
            </button>
          </div>

          {templatesLoading ? (
            <div className="text-sm text-muted-foreground">Loading templates…</div>
          ) : templates.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No SMS templates yet.{" "}
              <button type="button" onClick={onManageTemplates} className="font-medium text-primary underline">
                Create one
              </button>
            </div>
          ) : (
            <>
              <label className="block text-xs font-medium text-muted-foreground">
                Template
                <select
                  value={templateId}
                  onChange={(e) => selectTemplate(e.target.value)}
                  disabled={Boolean(myPending)}
                  className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (v{t.activeVersion})
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={Boolean(myPending)}
                  rows={6}
                  className="text-sm"
                />
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {message.length} chars · {getSmsSegments(message)} segment
                    {getSmsSegments(message) === 1 ? "" : "s"}
                    {edited && " · edited"}
                  </span>
                  {edited && !myPending && (
                    <button type="button" onClick={() => setMessage(renderedTemplate)} className="underline">
                      Reset
                    </button>
                  )}
                </div>
                {unknownPlaceholders.length > 0 && (
                  <div className="mt-1 text-xs text-amber-700">
                    Unfilled placeholder: {unknownPlaceholders.map((p) => `{{${p}}}`).join(", ")}
                  </div>
                )}
              </div>
            </>
          )}

          {!historyLoading && lastSent && !myPending && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">SMS already sent</div>
                <div className="text-xs">
                  {formatWhen(lastSent.sentAt)} by {lastSent.confirmedByName || lastSent.initiatedByName}
                </div>
              </div>
            </div>
          )}

          {othersPending && (
            <div className="rounded-lg border bg-muted p-3 text-xs text-muted-foreground">
              {othersPending.initiatedByName} started a text {formatWhen(othersPending.initiatedAt)} but hasn't
              confirmed it yet.
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {myPending ? (
              <Button asChild size="lg" variant="outline">
                <a href={buildSmsLink(myPending.recipient.phone || "", myPending.messageSnapshot.body)}>
                  <MessageSquare className="h-4 w-4" /> Reopen Messages
                </a>
              </Button>
            ) : canSend && !historyLoading ? (
              <Button asChild size="lg">
                <a href={buildSmsLink(voter.phone, message.trim())} onClick={handleSendClick}>
                  <MessageSquare className="h-4 w-4" /> {sendLabel}
                </a>
              </Button>
            ) : (
              <Button size="lg" disabled>
                {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                {sendLabel}
              </Button>
            )}
            <Button
              size="lg"
              variant={myPending ? "default" : "outline"}
              onClick={() => resolvePending("sent")}
              disabled={!myPending || Boolean(busy)}
              className={cn(myPending && "bg-emerald-600 text-white hover:bg-emerald-700")}
            >
              {busy === "sent" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirm Sent
            </Button>
          </div>

          {myPending && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <div>
                In Messages, check the recipient is{" "}
                <b>
                  {voter.name.full || "this voter"} · {formatPhone(myPending.recipient.phone)}
                </b>
                , send it, then come back and tap <b>Confirm Sent</b>.
              </div>
              <p className="whitespace-pre-wrap break-words rounded-md border border-amber-200 bg-background p-2 text-foreground">
                {myPending.messageSnapshot.body}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => copyMessage(myPending.messageSnapshot.body)}>
                  <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy text"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => resolvePending("cancelled")} disabled={Boolean(busy)}>
                  Didn&apos;t send
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-700"
                  onClick={() => resolvePending("failed")}
                  disabled={Boolean(busy)}
                >
                  Failed
                </Button>
              </div>
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Contact history</h3>
          {historyLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : history.length === 0 ? (
            <div className="text-sm text-muted-foreground">No outreach yet in this campaign.</div>
          ) : (
            <ul className="space-y-2">
              {history.map((record) => (
                <li key={record.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium uppercase">{record.channel}</span>
                    <span className={cn("rounded-full px-2 py-0.5 font-medium", STATUS_STYLES[record.status])}>
                      {record.status}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {record.status === "sent"
                      ? `Sent ${formatWhen(record.sentAt)} by ${record.confirmedByName || record.initiatedByName}`
                      : `Started ${formatWhen(record.initiatedAt)} by ${record.initiatedByName}`}
                    {record.templateId && ` · ${record.templateId} v${record.templateVersion}`}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                    {record.messageSnapshot.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">{children}</span>;
}
