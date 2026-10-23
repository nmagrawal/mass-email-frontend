"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  TEMPLATE_PLACEHOLDERS,
  findUnknownPlaceholders,
  getSmsSegments,
  renderTemplate,
} from "@/lib/outreach-render";

import { formatWhen, readJson, type OutreachTemplate } from "./types";

const SAMPLE_VOTER = { first: "Jordan", last: "Lee", full: "Jordan Lee" };

type Props = {
  templates: OutreachTemplate[];
  loading: boolean;
  error: string;
  onSaved: (template: OutreachTemplate) => void;
};

type Draft = { mode: "create" } | { mode: "version"; template: OutreachTemplate };

export function TemplateManager({ templates, loading, error, onSaved }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [activating, setActivating] = useState("");

  async function activate(template: OutreachTemplate, version: number) {
    setActivating(`${template.id}:${version}`);
    setActionError("");
    try {
      const data = await readJson<{ template: OutreachTemplate }>(
        await fetch(`/api/outreach/templates/${encodeURIComponent(template.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activeVersion: version }),
        }),
      );
      onSaved(data.template);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActivating("");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">SMS templates</h2>
          <p className="text-xs text-muted-foreground">
            Editing creates a new version; versions already used are never changed.
          </p>
        </div>
        {!draft && (
          <Button size="sm" onClick={() => setDraft({ mode: "create" })}>
            <Plus className="h-4 w-4" /> New template
          </Button>
        )}
      </div>

      {(error || actionError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error || actionError}
        </div>
      )}

      {draft && (
        <TemplateForm
          draft={draft}
          onCancel={() => setDraft(null)}
          onSaved={(template) => {
            onSaved(template);
            setDraft(null);
          }}
        />
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading templates…</div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No templates yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {templates.map((template) => {
            const isOpen = expanded === template.id;
            return (
              <li key={template.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{template.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {template.id} · active v{template.activeVersion} of {template.versions.length}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDraft({ mode: "version", template })}
                    disabled={Boolean(draft)}
                  >
                    Edit (new version)
                  </Button>
                </div>

                {template.active && (
                  <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">
                    {template.active.body}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : template.id)}
                  className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Version history
                </button>

                {isOpen && (
                  <ul className="mt-2 space-y-2">
                    {template.versions.map((version) => {
                      const isActive = version.version === template.activeVersion;
                      const key = `${template.id}:${version.version}`;
                      return (
                        <li key={version.version} className="rounded-lg border p-3 text-sm">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium">
                              v{version.version}
                              {isActive && (
                                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                                  active
                                </span>
                              )}
                            </span>
                            {!isActive && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => activate(template, version.version)}
                                disabled={Boolean(activating)}
                              >
                                {activating === key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Make active
                              </Button>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatWhen(version.createdAt)}
                            {version.createdByName && ` · ${version.createdByName}`}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap break-words">{version.body}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TemplateForm({
  draft,
  onCancel,
  onSaved,
}: {
  draft: Draft;
  onCancel: () => void;
  onSaved: (template: OutreachTemplate) => void;
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState(
    draft.mode === "version" ? draft.template.active?.body || "" : "Hi {{first_name}}, ",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const unknown = findUnknownPlaceholders(body);
  const unchanged = draft.mode === "version" && body.trim() === (draft.template.active?.body || "").trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res =
        draft.mode === "create"
          ? await fetch("/api/outreach/templates", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, channel: "sms", body }),
            })
          : await fetch(`/api/outreach/templates/${encodeURIComponent(draft.template.id)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ body, activate: true }),
            });

      const data = await readJson<{ template: OutreachTemplate }>(res);
      onSaved(data.template);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border bg-muted/30 p-4">
      <div className="text-sm font-semibold">
        {draft.mode === "create"
          ? "New SMS template"
          : `New version of “${draft.template.name}” (v${
              Math.max(...draft.template.versions.map((v) => v.version)) + 1
            })`}
      </div>

      {draft.mode === "create" && (
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name, e.g. Initial voter outreach"
          required
          maxLength={120}
        />
      )}

      <div>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} required maxLength={1600} />
        <div className="mt-1 text-xs text-muted-foreground">
          {body.length} chars · {getSmsSegments(body)} segment{getSmsSegments(body) === 1 ? "" : "s"} · Placeholders:{" "}
          {TEMPLATE_PLACEHOLDERS.map((p) => `{{${p}}}`).join(", ")}
        </div>
        {unknown.length > 0 && (
          <div className="mt-1 text-xs text-amber-700">
            Unknown placeholder: {unknown.map((p) => `{{${p}}}`).join(", ")}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">Preview</div>
        <p className="whitespace-pre-wrap break-words rounded-lg border bg-background p-3 text-sm">
          {renderTemplate(body, SAMPLE_VOTER)}
        </p>
      </div>

      {error && <div className="text-sm text-red-700">{error}</div>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !body.trim() || unchanged || (draft.mode === "create" && !name.trim())}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {draft.mode === "create" ? "Create template" : "Save as new version"}
        </Button>
      </div>
    </form>
  );
}
