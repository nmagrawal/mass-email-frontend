"use client"

import { formatDistanceToNow } from "date-fns"
import { Mail, MailOpen, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Email } from "@/lib/types/email"

interface EmailListProps {
  emails: Email[]
  selectedId: string | null
  onSelect: (email: Email) => void
  isLoading?: boolean
  folder: string
}

export function EmailList({
  emails,
  selectedId,
  onSelect,
  isLoading,
  folder,
}: EmailListProps) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <Mail className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          No emails in {folder}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {emails.map((email) => {
        const isSelected = selectedId === email.id
        const displayName = folder === "sent" ? email.to_email : (email.from_name || email.from_email)
        const displayEmail = folder === "sent" ? email.to_email : email.from_email

        return (
          <button
            key={email.id}
            onClick={() => onSelect(email)}
            className={cn(
              "flex items-start gap-3 p-4 text-left transition-colors hover:bg-accent/50",
              isSelected && "bg-accent",
              !email.read && "bg-accent/30"
            )}
          >
            <div className="mt-0.5 flex-shrink-0">
              {email.read ? (
                <MailOpen className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Mail className="h-5 w-5 text-primary" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className={cn(
                    "truncate text-sm",
                    !email.read ? "font-semibold text-foreground" : "text-foreground"
                  )}
                >
                  {displayName}
                </p>
                <span className="flex-shrink-0 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(email.created_at), { addSuffix: true })}
                </span>
              </div>

              <p
                className={cn(
                  "truncate text-sm",
                  !email.read ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {email.subject || "(No subject)"}
              </p>

              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {email.text_body?.slice(0, 100) || "No preview available"}
              </p>

              {folder !== "sent" && displayEmail !== displayName && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {displayEmail}
                </p>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
