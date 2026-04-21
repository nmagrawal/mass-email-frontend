"use client"

import { useEffect, useMemo } from "react"
import { format } from "date-fns"
import DOMPurify from "dompurify"
import { ArrowLeft, Trash2, Reply, Forward, Loader2, Mail } from "lucide-react"
import type { Email } from "@/lib/types/email"

interface EmailDetailProps {
  email: Email | undefined
  isLoading: boolean
  onBack: () => void
  onDelete: (id: string) => void
  onReply?: (email: Email) => void
}

export function EmailDetail({
  email,
  isLoading,
  onBack,
  onDelete,
  onReply,
}: EmailDetailProps) {
  // Sanitize HTML content for safe rendering
  const sanitizedHtml = useMemo(() => {
    if (!email?.html_body) return null

    // Configure DOMPurify to allow safe HTML elements
    const clean = DOMPurify.sanitize(email.html_body, {
      ALLOWED_TAGS: [
        "p", "br", "strong", "b", "i", "em", "u", "a", "ul", "ol", "li",
        "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
        "table", "thead", "tbody", "tr", "th", "td", "div", "span", "img",
      ],
      ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "style", "target"],
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ["target"],
    })

    // Add target="_blank" to all links for security
    return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ')
  }, [email?.html_body])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!email) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <Mail className="h-16 w-16 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          Select an email to read
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border p-4">
        <button
          onClick={onBack}
          className="rounded-lg p-2 transition-colors hover:bg-accent lg:hidden"
          aria-label="Back to list"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          {onReply && (
            <button
              onClick={() => onReply(email)}
              className="rounded-lg p-2 transition-colors hover:bg-accent"
              aria-label="Reply"
            >
              <Reply className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={() => onReply && onReply(email)}
            className="rounded-lg p-2 transition-colors hover:bg-accent"
            aria-label="Forward"
          >
            <Forward className="h-5 w-5" />
          </button>
          <button
            onClick={() => onDelete(email.id)}
            className="rounded-lg p-2 text-destructive transition-colors hover:bg-destructive/10"
            aria-label="Delete"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-auto p-6">
        <h1 className="text-xl font-semibold text-foreground text-balance">
          {email.subject || "(No subject)"}
        </h1>

        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
            {(email.from_name || email.from_email).charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-foreground">
                {email.from_name || email.from_email}
              </span>
              {email.from_name && (
                <span className="text-sm text-muted-foreground">
                  {"<"}{email.from_email}{">"}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              To: {email.to_name || email.to_email}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(email.created_at), "PPpp")}
            </p>
          </div>
        </div>

        {/* Email Body */}
        <div className="mt-6 border-t border-border pt-6">
          {sanitizedHtml ? (
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : (
            <div className="whitespace-pre-wrap text-sm text-foreground">
              {email.text_body || "No content"}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
