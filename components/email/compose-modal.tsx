"use client";

import { useState, useEffect } from "react";
import { X, Minus, Maximize2, Minimize2, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImagePicker } from "./image-picker";

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (data: {
    from_email: string;
    to: string;
    subject: string;
    body: string;
  }) => Promise<void>;
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  initialFromEmail?: string;
}

export function ComposeModal({
  isOpen,
  onClose,
  onSend,
  initialTo = "",
  initialSubject = "",
  initialBody = "",
  initialFromEmail = "",
}: ComposeModalProps) {
  const [fromEmail, setFromEmail] = useState(
    () =>
      (typeof window !== "undefined" && localStorage.getItem("compose_fromEmail")) || initialFromEmail
  );
  const [to, setTo] = useState(
    () =>
      (typeof window !== "undefined" && localStorage.getItem("compose_to")) || initialTo
  );
  const [subject, setSubject] = useState(
    () =>
      (typeof window !== "undefined" && localStorage.getItem("compose_subject")) || initialSubject
  );
  const [body, setBody] = useState(
    () =>
      (typeof window !== "undefined" && localStorage.getItem("compose_body")) || initialBody
  );
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist fields to localStorage on change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("compose_fromEmail", fromEmail);
    }
  }, [fromEmail]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("compose_to", to);
    }
  }, [to]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("compose_subject", subject);
    }
  }, [subject]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("compose_body", body);
    }
  }, [body]);

  // Reset form when initial values change (e.g., reply/forward)
  useEffect(() => {
    if (typeof window !== "undefined") {
      setFromEmail(localStorage.getItem("compose_fromEmail") || initialFromEmail);
      setTo(localStorage.getItem("compose_to") || initialTo);
      setSubject(localStorage.getItem("compose_subject") || initialSubject);
      setBody(localStorage.getItem("compose_body") || initialBody);
    } else {
      setFromEmail(initialFromEmail);
      setTo(initialTo);
      setSubject(initialSubject);
      setBody(initialBody);
    }
  }, [initialFromEmail, initialTo, initialSubject, initialBody]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsMinimized(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fromEmail.trim()) {
      setError("Please enter a sender email");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(fromEmail.trim())) {
      setError("Please enter a valid sender email address");
      return;
    }
    if (!to.trim()) {
      setError("Please enter a recipient email");
      return;
    }
    if (!emailRegex.test(to.trim())) {
      setError("Please enter a valid recipient email address");
      return;
    }

    setIsSending(true);
    try {
      await onSend({
        from_email: fromEmail.trim(),
        to: to.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });
      // Reset form and close
      setFromEmail("");
      setTo("");
      setSubject("");
      setBody("");
      if (typeof window !== "undefined") {
        localStorage.removeItem("compose_fromEmail");
        localStorage.removeItem("compose_to");
        localStorage.removeItem("compose_subject");
        localStorage.removeItem("compose_body");
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    if (fromEmail || to || subject || body) {
      // Could add a confirmation dialog here
    }
    setFromEmail("");
    setTo("");
    setSubject("");
    setBody("");
    if (typeof window !== "undefined") {
      localStorage.removeItem("compose_fromEmail");
      localStorage.removeItem("compose_to");
      localStorage.removeItem("compose_subject");
      localStorage.removeItem("compose_body");
    }
    onClose();
  };

  const handleInsertImage = (imageUrl: string) => {
    // Insert image HTML at the end of the body
    const imageHtml = `<img src="${imageUrl}" alt="Embedded image" style="max-width: 100%; height: auto;" />`;
    setBody((prev) => prev + (prev ? "\n\n" : "") + imageHtml);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop for maximized state */}
      {isMaximized && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setIsMaximized(false)}
        />
      )}

      <div
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden rounded-t-lg border border-border bg-background shadow-2xl transition-all duration-200",
          isMinimized
            ? "bottom-0 right-4 h-12 w-80"
            : isMaximized
              ? "inset-4 rounded-lg"
              : "bottom-0 right-4 h-[500px] w-[560px] max-w-[calc(100vw-2rem)]",
        )}
      >
        {/* Header */}
        <div
          className="flex h-12 flex-shrink-0 cursor-pointer items-center justify-between bg-foreground/5 px-4"
          onClick={() => isMinimized && setIsMinimized(false)}
        >
          <span className="text-sm font-medium text-foreground">
            {subject || "New Message"}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(!isMinimized);
              }}
              className="rounded p-1 transition-colors hover:bg-accent"
              aria-label={isMinimized ? "Expand" : "Minimize"}
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMaximized(!isMaximized);
                setIsMinimized(false);
              }}
              className="rounded p-1 transition-colors hover:bg-accent"
              aria-label={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              className="rounded p-1 transition-colors hover:bg-accent"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Form - hidden when minimized */}
        {!isMinimized && (
          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col overflow-hidden"
          >
            {/* From field */}
            <div className="flex items-center border-b border-border px-4">
              <label
                htmlFor="compose-from"
                className="w-12 text-sm text-muted-foreground"
              >
                From
              </label>
              <input
                id="compose-from"
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="sender@example.com"
                className="flex-1 bg-transparent py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                required
              />
            </div>
            {/* To field */}
            <div className="flex items-center border-b border-border px-4">
              <label
                htmlFor="compose-to"
                className="w-12 text-sm text-muted-foreground"
              >
                To
              </label>
              <input
                id="compose-to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
                className="flex-1 bg-transparent py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                required
              />
            </div>

            {/* Subject field */}
            <div className="flex items-center border-b border-border px-4">
              <label
                htmlFor="compose-subject"
                className="w-12 text-sm text-muted-foreground"
              >
                Subject
              </label>
              <input
                id="compose-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="flex-1 bg-transparent py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Body */}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Compose your message..."
              className="flex-1 resize-none bg-transparent p-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />

            {/* Footer */}
            <div className="flex items-center gap-3 border-t border-border p-4">
              <button
                type="submit"
                disabled={isSending}
                className="flex items-center gap-2 rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send
                  </>
                )}
              </button>
              <ImagePicker onInsert={handleInsertImage} />
            </div>
          </form>
        )}
      </div>
    </>
  );
}
