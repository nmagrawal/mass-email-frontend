"use client";

import { useState, useCallback } from "react";
import {
  Send,
  Plus,
  Trash2,
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type { MassCampaignContact } from "@/lib/types/email";
import { ImagePicker } from "./image-picker";

export interface MassCampaignProps {
  onSend: (data: {
    from_email: string;
    subject: string;
    html_template: string;
    contacts: MassCampaignContact[];
  }) => Promise<void>;
}

export function MassCampaign({ onSend }: MassCampaignProps) {
  const [fromEmail, setFromEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [htmlTemplate, setHtmlTemplate] = useState(
    `<h2>Hello {name},</h2>\n<p>Your message here...</p>`,
  );
  const [contacts, setContacts] = useState<MassCampaignContact[]>([
    { email: "", first_name: "" },
  ]);
  const [bulkInput, setBulkInput] = useState("");
  const [showBulkInput, setShowBulkInput] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [bulkFileName, setBulkFileName] = useState<string>("");

  const addContact = useCallback(() => {
    setContacts((prev) => [...prev, { email: "", first_name: "" }]);
  }, []);

  const removeContact = useCallback((index: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateContact = useCallback(
    (index: number, field: keyof MassCampaignContact, value: string) => {
      setContacts((prev) =>
        prev.map((contact, i) =>
          i === index ? { ...contact, [field]: value } : contact,
        ),
      );
    },
    [],
  );

  const parseBulkInput = useCallback(() => {
    const lines = bulkInput.trim().split("\n");
    const newContacts: MassCampaignContact[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Support formats: "email,name" or "email, name" or "name <email>"
      let email = "";
      let first_name = "";

      if (trimmedLine.includes("<") && trimmedLine.includes(">")) {
        // Format: "Name <email@example.com>"
        const match = trimmedLine.match(/^(.+?)\s*<(.+?)>$/);
        if (match) {
          first_name = match[1].trim();
          email = match[2].trim();
        }
      } else if (trimmedLine.includes(",")) {
        // Format: "email,name" or "email, name"
        const parts = trimmedLine.split(",");
        email = parts[0].trim();
        first_name = parts[1]?.trim() || "";
      } else {
        // Just an email
        email = trimmedLine;
      }

      if (email && email.includes("@")) {
        newContacts.push({
          email,
          first_name: first_name || email.split("@")[0],
        });
      }
    }

    if (newContacts.length > 0) {
      setContacts(newContacts);
      setBulkInput("");
      setShowBulkInput(false);
      setSuccess(`Imported ${newContacts.length} contacts`);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(
        "No valid contacts found. Use format: email,name (one per line)",
      );
      setTimeout(() => setError(null), 5000);
    }
  }, [bulkInput]);

  // File upload handler for txt/csv/json
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        setBulkFileName("");
        return;
      }
      setBulkFileName(file.name);
      const ext = file.name.split(".").pop()?.toLowerCase();
      try {
        let importedContacts: MassCampaignContact[] = [];
        if (ext === "json") {
          const text = await file.text();
          const arr = JSON.parse(text);
          if (Array.isArray(arr)) {
            importedContacts = arr
              .filter(
                (c) =>
                  c && typeof c.email === "string" && c.email.includes("@"),
              )
              .map((c) => ({
                email: c.email,
                first_name: c.first_name || c.email.split("@")[0],
              }));
          }
        } else if (ext === "txt" || ext === "csv") {
          const text = await file.text();
          const lines = text.split(/\r?\n/);
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            let email = "";
            let first_name = "";
            if (trimmedLine.includes("<") && trimmedLine.includes(">")) {
              const match = trimmedLine.match(/^(.+?)\s*<(.+?)>$/);
              if (match) {
                first_name = match[1].trim();
                email = match[2].trim();
              }
            } else if (trimmedLine.includes(",")) {
              const parts = trimmedLine.split(",");
              email = parts[0].trim();
              first_name = parts[1]?.trim() || "";
            } else {
              email = trimmedLine;
            }
            if (email && email.includes("@")) {
              importedContacts.push({
                email,
                first_name: first_name || email.split("@")[0],
              });
            }
          }
        } else {
          setError("Unsupported file type. Use .txt, .csv, or .json");
          setTimeout(() => setError(null), 5000);
          return;
        }
        if (importedContacts.length > 0) {
          setContacts(importedContacts);
          setSuccess(`Imported ${importedContacts.length} contacts from file`);
          setTimeout(() => setSuccess(null), 3000);
        } else {
          setError("No valid contacts found in file");
          setTimeout(() => setError(null), 5000);
        }
      } catch (err) {
        setError("Failed to parse file. Ensure it is valid.");
        setTimeout(() => setError(null), 5000);
      }
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(null);

      // Validate
      if (!fromEmail.trim()) {
        setError("From email is required");
        return;
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromEmail.trim())) {
        setError("From email is invalid");
        return;
      }
      if (!subject.trim()) {
        setError("Subject is required");
        return;
      }
      if (!htmlTemplate.trim()) {
        setError("HTML template is required");
        return;
      }
      const validContacts = contacts.filter(
        (c) => c.email.trim() && c.first_name.trim(),
      );
      if (validContacts.length === 0) {
        setError(
          "At least one valid contact (with email and name) is required",
        );
        return;
      }

      setIsSending(true);

      try {
        await onSend({
          from_email: fromEmail.trim(),
          subject: subject.trim(),
          html_template: htmlTemplate,
          contacts: validContacts,
        });
        setSuccess(`Campaign sent to ${validContacts.length} contacts!`);
        // Reset form
        setFromEmail("");
        setSubject("");
        setHtmlTemplate(`<h2>Hello {name},</h2>\n<p>Your message here...</p>`);
        setContacts([{ email: "", first_name: "" }]);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to send campaign",
        );
      } finally {
        setIsSending(false);
      }
    },
    [subject, htmlTemplate, contacts, onSend],
  );

  const validContactCount = contacts.filter(
    (c) => c.email.trim() && c.first_name.trim(),
  ).length;

  const handleInsertImage = useCallback((imageUrl: string) => {
    const imageHtml = `<img src="${imageUrl}" alt="Campaign image" style="max-width: 100%; height: auto;" />`;
    setHtmlTemplate((prev) => prev + "\n" + imageHtml);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Mass Campaign
          </h2>
          <p className="text-sm text-muted-foreground">
            Send personalized emails to multiple contacts
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {validContactCount} valid contact{validContactCount !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex-1 overflow-auto p-4">
          <div className="mx-auto max-w-3xl space-y-6">
            {/* Status Messages */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {success}
              </div>
            )}

            {/* From Email */}
            <div className="space-y-2">
              <label
                htmlFor="from-email"
                className="text-sm font-medium text-foreground"
              >
                From Email
              </label>
              <input
                id="from-email"
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="sender@example.com"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {/* Subject */}
            <div className="space-y-2">
              <label
                htmlFor="subject"
                className="text-sm font-medium text-foreground"
              >
                Subject Line
              </label>
              <input
                id="subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* HTML Template */}
            <div className="space-y-2">
              <label
                htmlFor="template"
                className="text-sm font-medium text-foreground"
              >
                HTML Template
              </label>
              <p className="text-xs text-muted-foreground">
                Use{" "}
                <code className="rounded bg-muted px-1 py-0.5">{"{name}"}</code>{" "}
                as a placeholder for personalization
              </p>
              <textarea
                id="template"
                value={htmlTemplate}
                onChange={(e) => setHtmlTemplate(e.target.value)}
                rows={8}
                placeholder="<h2>Hello {name},</h2><p>Your message...</p>"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Preview</p>
              <div
                className="rounded-lg border border-border bg-card p-4"
                dangerouslySetInnerHTML={{
                  __html: htmlTemplate.replace(
                    /\{name\}/g,
                    contacts[0]?.first_name || "Voter",
                  ),
                }}
              />
            </div>

            {/* Contacts Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">
                  Recipients
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBulkInput(!showBulkInput)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    <Upload className="h-3 w-3" />
                    Bulk Import
                  </button>
                  <button
                    type="button"
                    onClick={addContact}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    <Plus className="h-3 w-3" />
                    Add Contact
                  </button>
                </div>
              </div>

              {/* Bulk Import */}
              {showBulkInput && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    Paste contacts, one per line, or upload a file.
                    <br />
                    Supported formats:
                    <br />
                    <code className="text-foreground">
                      email@example.com,FirstName
                    </code>
                    <br />
                    <code className="text-foreground">
                      FirstName &lt;email@example.com&gt;
                    </code>
                    <br />
                    <span className="text-foreground">
                      .txt, .csv, or .json file
                    </span>
                  </p>
                  <textarea
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value)}
                    rows={4}
                    placeholder="voter1@gmail.com,Robert&#10;voter2@gmail.com,Sarah"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {/* Custom file upload button */}
                  <div className="flex items-center gap-2 mt-2">
                    <label
                      htmlFor="bulk-file-upload"
                      className="inline-block cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      Choose File
                      <input
                        id="bulk-file-upload"
                        type="file"
                        accept=".txt,.csv,.json"
                        onChange={handleFileUpload}
                        style={{ display: "none" }}
                      />
                    </label>
                    <span
                      className="text-xs text-muted-foreground"
                      id="bulk-file-upload-filename"
                    >
                      {bulkFileName || "No file chosen"}
                    </span>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBulkInput(false)}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={parseBulkInput}
                      className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      Import
                    </button>
                  </div>
                </div>
              )}

              {/* Contact List */}
              <div className="space-y-2">
                {contacts.map((contact, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) =>
                        updateContact(index, "email", e.target.value)
                      }
                      placeholder="email@example.com"
                      className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      type="text"
                      value={contact.first_name}
                      onChange={(e) =>
                        updateContact(index, "first_name", e.target.value)
                      }
                      placeholder="First Name"
                      className="w-32 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {contacts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContact(index)}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Remove contact"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/30 p-4">
          <button
            type="submit"
            disabled={isSending || validContactCount === 0}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Campaign ({validContactCount})
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
