"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Plus, Trash2, Upload } from "lucide-react";

export interface MassTextContact {
  phone: string;
  name?: string;
}

export interface MassTextTemplate {
  _id?: string;
  name: string;
  body: string;
}

export interface MassTextCampaignSendPayload {
  message: string;
  contacts: MassTextContact[];
  template_name?: string;
  imageUrl?: string; // For MMS image support
}

export interface MassTextCampaignProps {
  onSend: (data: MassTextCampaignSendPayload) => Promise<void>;
  initialContacts?: MassTextContact[];
  setContacts?: (contacts: MassTextContact[]) => void;
}

export function MassTextCampaign({
  onSend,
  initialContacts,
  setContacts,
}: MassTextCampaignProps) {
  const [hydrated, setHydrated] = useState(false);
  // Always use default value for SSR, update from localStorage after hydration
  const [contacts, _setContactsState] = useState<MassTextContact[]>(
    initialContacts && initialContacts.length > 0
      ? initialContacts
      : [{ phone: "", name: "" }],
  );

  // Keep contacts in sync with parent prop
  useEffect(() => {
    if (
      initialContacts &&
      (initialContacts.length !== contacts.length ||
        initialContacts.some(
          (c, i) =>
            c.phone !== contacts[i]?.phone || c.name !== contacts[i]?.name,
        ))
    ) {
      _setContactsState(initialContacts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContacts]);
  const _setContacts = (newContacts: MassTextContact[]) => {
    _setContactsState(newContacts);
    if (typeof window !== "undefined") {
      localStorage.setItem("massTextContacts", JSON.stringify(newContacts));
    }
    if (setContacts) setContacts(newContacts);
  };

  // Hydration: after mount, update contacts from localStorage if available
  useEffect(() => {
    setHydrated(true);
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("massTextContacts");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            _setContactsState(parsed);
          }
        } catch {
          // ignore parse error
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [bulkInput, setBulkInput] = useState("");
  const [showBulkInput, setShowBulkInput] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [message, setMessage] = useState("Hi {name},\n\n");
  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  // Handle image file selection and preview
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageUploadError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setImageFile(null);
      setImagePreview(null);
      return;
    }
    // Accept only images (jpeg, png, gif, webp)
    if (!file.type.startsWith("image/")) {
      setImageUploadError("Only image files are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageUploadError("Image must be less than 5MB.");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Remove selected image
  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageUploadError(null);
  };
  const [templates, setTemplates] = useState<MassTextTemplate[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateName, setTemplateName] = useState("");
  const [saveTemplateLoading, setSaveTemplateLoading] = useState(false);
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(
    null,
  );
  const [saveTemplateSuccess, setSaveTemplateSuccess] = useState<string | null>(
    null,
  );

  // Fetch templates on mount
  useEffect(() => {
    setTemplateLoading(true);
    fetch("/api/texts/templates")
      .then((res) => res.json())
      .then((data) => {
        setTemplates(data.templates || []);
        setTemplateError(null);
      })
      .catch(() => setTemplateError("Failed to load templates"))
      .finally(() => setTemplateLoading(false));
  }, []);

  // Save or update template
  const handleSaveTemplate = useCallback(
    async (asNew = false) => {
      setSaveTemplateLoading(true);
      setSaveTemplateError(null);
      setSaveTemplateSuccess(null);
      try {
        const nameToCheck = templateName || "Untitled";
        const duplicate = templates.find(
          (tpl) =>
            tpl.name.trim().toLowerCase() ===
              nameToCheck.trim().toLowerCase() &&
            (!selectedTemplateId || tpl._id !== selectedTemplateId),
        );
        if (duplicate && asNew) {
          setSaveTemplateError(
            "Template name already exists. Please choose a different name.",
          );
          setSaveTemplateLoading(false);
          return;
        }
        if (duplicate && !asNew && !selectedTemplateId) {
          setSaveTemplateError(
            "Template name already exists. Please choose a different name.",
          );
          setSaveTemplateLoading(false);
          return;
        }
        const payload: any = {
          name: nameToCheck,
          body: message,
        };
        // Only send _id if it is a non-empty string
        if (
          selectedTemplateId &&
          !asNew &&
          typeof selectedTemplateId === "string" &&
          selectedTemplateId.length === 24
        ) {
          payload._id = selectedTemplateId;
        }
        const res = await fetch("/api/texts/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Save failed");
        setSaveTemplateSuccess(
          selectedTemplateId && !asNew ? "Template updated" : "Template saved",
        );
        setSelectedTemplateId(data._id || selectedTemplateId);
        setTemplateLoading(true);
        fetch("/api/texts/templates")
          .then((res) => res.json())
          .then((data) => setTemplates(data.templates || []))
          .finally(() => setTemplateLoading(false));
      } catch (err: any) {
        setSaveTemplateError(err.message || "Save failed");
      } finally {
        setSaveTemplateLoading(false);
        setTimeout(() => setSaveTemplateSuccess(null), 2000);
      }
    },
    [templateName, message, selectedTemplateId, templates],
  );

  // When template is selected, load its body
  useEffect(() => {
    if (!selectedTemplateId) return;
    const tpl = templates.find((t) => t._id === selectedTemplateId);
    if (tpl) {
      setMessage(tpl.body);
      setTemplateName(tpl.name);
      if (saveTemplateError) setSaveTemplateError(null);
    }
  }, [selectedTemplateId, templates]);

  // Bulk input parsing
  const parseBulkInput = useCallback(() => {
    const lines = bulkInput.trim().split("\n");
    const newContacts: MassTextContact[] = [];
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      let phone = "";
      let name = "";
      if (trimmedLine.includes(",")) {
        const parts = trimmedLine.split(",");
        phone = parts[0].trim();
        name = parts[1]?.trim() || "";
      } else {
        phone = trimmedLine;
      }
      if (phone) {
        newContacts.push({ phone, name: name || phone });
      }
    }
    if (newContacts.length > 0) {
      _setContacts(newContacts);
      setBulkInput("");
      setShowBulkInput(false);
      setSuccess(`Imported ${newContacts.length} contacts`);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(
        "No valid contacts found. Use format: phone,name (one per line)",
      );
      setTimeout(() => setError(null), 5000);
    }
  }, [bulkInput, _setContacts]);

  const validContactCount = contacts.filter((c) => c.phone.trim()).length;

  // Character count helpers
  const [charCount, setCharCount] = useState(0);
  const [maxPersonalizedCount, setMaxPersonalizedCount] = useState(0);
  useEffect(() => {
    setCharCount(message.length);
    // Calculate the max personalized message length for all contacts
    if (contacts.length > 0) {
      let maxLen = 0;
      for (const contact of contacts) {
        const personalized = message.replace(
          /\{name\}/gi,
          contact.name || contact.phone,
        );
        if (personalized.length > maxLen) maxLen = personalized.length;
      }
      setMaxPersonalizedCount(maxLen);
    } else {
      setMaxPersonalizedCount(message.length);
    }
  }, [message, contacts]);

  const [invalidNumbers, setInvalidNumbers] = useState<
    { phone: string; name?: string; error?: string }[]
  >([]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(null);
      setInvalidNumbers([]);
      if (!selectedTemplateId) {
        setError("Please save your template before sending the campaign.");
        setIsSending(false);
        return;
      }
      if (!message.trim()) {
        setError("Message is required");
        setIsSending(false);
        return;
      }
      let remainingContacts = contacts.filter((c) => c.phone.trim());
      if (remainingContacts.length === 0) {
        setError("At least one valid contact (with phone) is required");
        setIsSending(false);
        return;
      }
      // Check for Twilio 1600 char limit after personalization
      for (const contact of remainingContacts) {
        const personalized = message.replace(
          /\{name\}/gi,
          contact.name || contact.phone,
        );
        if (personalized.length > 1600) {
          setError(
            `Message to ${contact.phone} exceeds 1600 character limit after personalization.`,
          );
          setIsSending(false);
          return;
        }
      }
      setIsSending(true);
      let imageUrl: string | undefined = undefined;
      try {
        if (imageFile) {
          // Upload image to server or cloud storage (implement /api/upload or similar)
          const formData = new FormData();
          formData.append("file", imageFile);
          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (!res.ok || !data.url)
            throw new Error(data.error || "Image upload failed");
          imageUrl = data.url;
        }

        // Send one-by-one, updating UI after each
        let sentCount = 0;
        let failed: { phone: string; name?: string; error?: string }[] = [];
        for (let i = 0; i < remainingContacts.length; i++) {
          const contact = remainingContacts[i];
          const payload = {
            message: message.trim(),
            contacts: [contact],
            template_name: templateName || "Untitled",
            imageUrl,
          };
          try {
            const res = await fetch("/api/mass-texting", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (res.ok && data.success) {
              sentCount++;
            } else {
              failed.push({
                phone: contact.phone,
                name: contact.name,
                error: data?.results?.[0]?.error || data?.error || "Failed",
              });
            }
          } catch (err) {
            failed.push({
              phone: contact.phone,
              name: contact.name,
              error: err instanceof Error ? err.message : "Failed",
            });
          }
          // Remove this contact from the list
          _setContactsState((prev: MassTextContact[]) =>
            prev.filter((_c: MassTextContact, idx: number) => idx !== 0),
          );
          const updated = contacts.slice(1);
          if (typeof window !== "undefined") {
            localStorage.setItem("massTextContacts", JSON.stringify(updated));
          }
          if (setContacts) setContacts(updated);
          // Wait a bit for UI update (optional)
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        setInvalidNumbers(failed);
        setSuccess(`Campaign sent to ${sentCount} contacts!`);
        setMessage("");
        _setContacts([{ phone: "", name: "" }]);
        setSelectedTemplateId("");
        setTemplateName("");
        handleRemoveImage();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to send campaign",
        );
      } finally {
        setIsSending(false);
      }
    },
    [message, contacts, templateName, selectedTemplateId, imageFile],
  );

  if (!hydrated) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="border-b pb-4">
        <h2 className="text-lg font-semibold">Mass Text Campaign</h2>
        <p className="text-sm text-muted-foreground">
          Send SMS to multiple contacts
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Message Template
        </label>
        {templateLoading ? (
          <span className="text-xs text-muted-foreground">
            Loading templates...
          </span>
        ) : templateError ? (
          <span className="text-xs text-red-500">{templateError}</span>
        ) : (
          <select
            className="w-full rounded border p-2 mb-2"
            value={selectedTemplateId}
            onChange={(e) => {
              setSelectedTemplateId(e.target.value);
              const tpl = templates.find((t) => t._id === e.target.value);
              setTemplateName(tpl?.name || "");
            }}
          >
            <option value="">-- Select a template --</option>
            {templates.map((tpl) => (
              <option key={tpl._id} value={tpl._id}>
                {tpl.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex flex-col gap-2 mt-2">
          <input
            className="w-full rounded border p-2"
            type="text"
            placeholder="Template name"
            value={templateName}
            onChange={(e) => {
              setTemplateName(e.target.value);
              if (saveTemplateError) setSaveTemplateError(null);
            }}
            disabled={saveTemplateLoading}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded bg-primary text-primary-foreground px-3 py-1 font-medium disabled:opacity-50"
              onClick={() => handleSaveTemplate(false)}
              disabled={saveTemplateLoading || !message}
            >
              {selectedTemplateId ? "Update Template" : "Save as Template"}
            </button>
            <button
              type="button"
              className="rounded bg-secondary text-secondary-foreground px-3 py-1 font-medium border border-border disabled:opacity-50"
              onClick={() => handleSaveTemplate(true)}
              disabled={saveTemplateLoading || !message}
            >
              Save as New
            </button>
          </div>
          {saveTemplateError && (
            <span className="text-xs text-red-500">{saveTemplateError}</span>
          )}
          {saveTemplateSuccess && (
            <span className="text-xs text-green-600">
              {saveTemplateSuccess}
            </span>
          )}
        </div>
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        encType="multipart/form-data"
      >
        {/* Image upload for MMS */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Image (optional, for MMS)
          </label>
          <div className="flex items-center gap-2">
            <label className="inline-block cursor-pointer px-3 py-1 bg-secondary text-secondary-foreground border border-border rounded font-medium hover:bg-secondary/80 disabled:opacity-50">
              Choose File
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                disabled={isSending}
                style={{ display: "none" }}
              />
            </label>
            <span className="text-xs text-muted-foreground">
              {imageFile ? imageFile.name : "No file chosen"}
            </span>
          </div>
          {imageUploadError && (
            <div className="text-xs text-red-500">{imageUploadError}</div>
          )}
          {imagePreview && (
            <div className="mt-2 flex flex-col gap-2">
              <img
                src={imagePreview}
                alt="Preview"
                className="max-h-40 rounded border"
              />
              <Button type="button" onClick={handleRemoveImage} size="sm">
                Remove Image
              </Button>
            </div>
          )}
        </div>
        {error && <div className="text-red-500 text-sm">{error}</div>}
        {success && <div className="text-green-600 text-sm">{success}</div>}
        <div className="flex flex-col gap-1">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter your message. Use {name} for personalization."
            rows={4}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Raw: {charCount} chars</span>
            <span>
              Max personalized: {maxPersonalizedCount} chars
              {maxPersonalizedCount > 1600 && (
                <span className="text-red-500"> (Over Twilio limit!)</span>
              )}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Contacts</label>
          <div className="flex gap-2 mb-2">
            <Button
              type="button"
              onClick={() => setShowBulkInput((v) => !v)}
              size="sm"
            >
              <Upload className="h-3 w-3" />
              {showBulkInput ? "Hide Bulk Input" : "Bulk Input"}
            </Button>
            <Button
              type="button"
              onClick={() =>
                _setContacts([...contacts, { phone: "", name: "" }])
              }
              size="sm"
            >
              Add Contact
            </Button>
            <Button
              type="button"
              onClick={() => {
                _setContacts([]);
                if (typeof window !== "undefined") {
                  localStorage.removeItem("massTextContacts");
                }
              }}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-destructive border border-destructive bg-transparent hover:bg-destructive/10"
              size="sm"
              title="Delete all recipients"
            >
              <Trash2 className="h-3 w-3" />
              Remove All
            </Button>
          </div>
          {showBulkInput && (
            <div className="mb-2">
              <Textarea
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder="One per line: phone,name"
                rows={3}
              />
              <Button type="button" onClick={parseBulkInput} className="mt-1">
                Import
              </Button>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {contacts.map((contact, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className="rounded border p-2 flex-1"
                  type="text"
                  placeholder="Phone number"
                  value={contact.phone}
                  onChange={(e) =>
                    _setContacts(
                      contacts.map((c, j) =>
                        j === i ? { ...c, phone: e.target.value } : c,
                      ),
                    )
                  }
                />
                <input
                  className="rounded border p-2 flex-1"
                  type="text"
                  placeholder="Name (optional)"
                  value={contact.name || ""}
                  onChange={(e) =>
                    _setContacts(
                      contacts.map((c, j) =>
                        j === i ? { ...c, name: e.target.value } : c,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  onClick={() =>
                    _setContacts(contacts.filter((_, j) => j !== i))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
        <Button type="submit" disabled={isSending || validContactCount === 0}>
          {isSending ? "Sending..." : `Send Texts (${validContactCount})`}
        </Button>
        {invalidNumbers.length > 0 && (
          <div className="mt-4">
            <div className="text-red-600 font-semibold mb-2">
              Invalid Numbers:
            </div>
            <ul className="text-xs">
              {invalidNumbers.map((n, i) => (
                <li key={i} className="mb-1">
                  {n.phone} {n.name && `(${n.name})`} - {n.error || "Invalid"}
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Remove All button moved above for UI consistency */}
      </form>
    </div>
  );
}
