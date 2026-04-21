"use client"

import { useState, useCallback, useMemo } from "react"
import { Sidebar } from "./sidebar"
import { EmailList } from "./email-list"
import { EmailDetail } from "./email-detail"
import { MassCampaign } from "./mass-campaign"
import { ComposeModal } from "./compose-modal"
import { useEmails, useEmail } from "@/hooks/use-emails"
import type { MassCampaignContact } from "@/lib/types/email"
import { Menu, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Email } from "@/lib/types/email"

export function EmailClient() {
  const [currentFolder, setCurrentFolder] = useState("inbox")
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [composeInitial, setComposeInitial] = useState<{
    to?: string
    subject?: string
    body?: string
  }>({})

  // Data fetching
  const { emails, isLoading: emailsLoading, mutate: mutateEmails } = useEmails(currentFolder)
  const { email: selectedEmail, isLoading: emailLoading } = useEmail(selectedEmailId)

  // Calculate unread count for inbox
  const unreadCount = useMemo(() => {
    if (currentFolder !== "inbox") return 0
    return emails.filter((e) => !e.read).length
  }, [emails, currentFolder])

  const handleFolderChange = useCallback((folder: string) => {
    setCurrentFolder(folder)
    setSelectedEmailId(null)
    setShowMobileSidebar(false)
  }, [])

  const handleEmailSelect = useCallback((email: Email) => {
    setSelectedEmailId(email.id)
  }, [])

  const handleBack = useCallback(() => {
    setSelectedEmailId(null)
  }, [])

  const handleCompose = useCallback(() => {
    setComposeInitial({})
    setShowCompose(true)
  }, [])

  const handleSendMassCampaign = useCallback(
    async (data: {
      subject: string
      html_template: string
      contacts: MassCampaignContact[]
    }) => {
      const response = await fetch("/api/mass-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to send mass campaign")
      }

      return response.json()
    },
    []
  )

  const handleReply = useCallback((email: Email) => {
    setComposeInitial({
      to: email.from_email,
      subject: `Re: ${email.subject}`,
      body: `\n\n---\nOn ${new Date(email.created_at).toLocaleString()}, ${email.from_name || email.from_email} wrote:\n\n${email.text_body || ""}`,
    })
    setShowCompose(true)
  }, [])

  const handleSendEmail = useCallback(async (data: { to: string; subject: string; body: string }) => {
    const response = await fetch("/api/emails/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || "Failed to send email")
    }

    // Refresh the email list
    mutateEmails()
  }, [mutateEmails])

  const handleDeleteEmail = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/emails/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete email")
      }

      setSelectedEmailId(null)
      mutateEmails()
    } catch (error) {
      console.error("Error deleting email:", error)
    }
  }, [mutateEmails])

  const handleRefresh = useCallback(() => {
    mutateEmails()
  }, [mutateEmails])

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Mobile sidebar overlay */}
      {showMobileSidebar && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setShowMobileSidebar(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 lg:relative lg:translate-x-0",
          showMobileSidebar ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar
          currentFolder={currentFolder}
          onFolderChange={handleFolderChange}
          onCompose={handleCompose}
          unreadCount={unreadCount}
        />
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Mass Campaigns - Full width view */}
        {currentFolder === "mass-campaigns" ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Mobile header */}
            <div className="flex items-center gap-2 border-b border-border p-3 lg:hidden">
              <button
                onClick={() => setShowMobileSidebar(true)}
                className="rounded-lg p-2 transition-colors hover:bg-accent"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <h2 className="flex-1 text-lg font-semibold text-foreground">
                Mass Campaigns
              </h2>
            </div>
            <MassCampaign onSend={handleSendMassCampaign} />
          </div>
        ) : (
          <>
            {/* Email list */}
            <div
              className={cn(
                "flex w-full flex-col border-r border-border lg:w-80 xl:w-96",
                selectedEmailId ? "hidden lg:flex" : "flex"
              )}
            >
              {/* Mobile header */}
              <div className="flex items-center gap-2 border-b border-border p-3 lg:hidden">
                <button
                  onClick={() => setShowMobileSidebar(true)}
                  className="rounded-lg p-2 transition-colors hover:bg-accent"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <h2 className="flex-1 text-lg font-semibold capitalize text-foreground">
                  {currentFolder}
                </h2>
                <button
                  onClick={handleRefresh}
                  className="rounded-lg p-2 transition-colors hover:bg-accent"
                  aria-label="Refresh"
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
              </div>

              {/* Desktop header */}
              <div className="hidden items-center justify-between border-b border-border p-4 lg:flex">
                <h2 className="text-lg font-semibold capitalize text-foreground">
                  {currentFolder}
                </h2>
                <button
                  onClick={handleRefresh}
                  className="rounded-lg p-2 transition-colors hover:bg-accent"
                  aria-label="Refresh"
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
              </div>

              {/* Email list content */}
              <div className="flex-1 overflow-auto">
                <EmailList
                  emails={emails}
                  selectedId={selectedEmailId}
                  onSelect={handleEmailSelect}
                  isLoading={emailsLoading}
                  folder={currentFolder}
                />
              </div>
            </div>

            {/* Email detail view */}
            <div
              className={cn(
                "flex-1 overflow-hidden",
                !selectedEmailId ? "hidden lg:flex" : "flex"
              )}
            >
              <div className="flex h-full w-full flex-col">
                <EmailDetail
                  email={selectedEmail}
                  isLoading={emailLoading}
                  onBack={handleBack}
                  onDelete={handleDeleteEmail}
                  onReply={handleReply}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Compose Modal */}
      <ComposeModal
        isOpen={showCompose}
        onClose={() => setShowCompose(false)}
        onSend={handleSendEmail}
        initialTo={composeInitial.to}
        initialSubject={composeInitial.subject}
        initialBody={composeInitial.body}
      />
    </div>
  )
}
