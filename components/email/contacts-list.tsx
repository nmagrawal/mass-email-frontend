"use client"

import { useState } from "react"
import { Loader2, UserPlus, Users, Mail } from "lucide-react"
import type { Contact } from "@/lib/types/email"

interface ContactsListProps {
  contacts: Contact[]
  isLoading: boolean
  onAddContact: (contact: { email: string; name?: string }) => void
  onComposeToContact: (email: string) => void
}

export function ContactsList({
  contacts,
  isLoading,
  onAddContact,
  onComposeToContact,
}: ContactsListProps) {
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setIsSubmitting(true)
    try {
      await onAddContact({ email: email.trim(), name: name.trim() || undefined })
      setEmail("")
      setName("")
      setShowForm(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="text-lg font-semibold text-foreground">Contacts</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <UserPlus className="h-4 w-4" />
          Add Contact
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="border-b border-border bg-accent/30 p-4">
          <div className="space-y-3">
            <div>
              <label htmlFor="contact-email" className="mb-1 block text-sm font-medium text-foreground">
                Email
              </label>
              <input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="contact-name" className="mb-1 block text-sm font-medium text-foreground">
                Name (optional)
              </label>
              <input
                id="contact-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? "Adding..." : "Add Contact"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-auto">
        {contacts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <Users className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No contacts yet
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center gap-3 p-4 transition-colors hover:bg-accent/50"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium text-accent-foreground">
                  {(contact.name || contact.email).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {contact.name || contact.email}
                  </p>
                  {contact.name && (
                    <p className="truncate text-sm text-muted-foreground">
                      {contact.email}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onComposeToContact(contact.email)}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={`Send email to ${contact.name || contact.email}`}
                >
                  <Mail className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
