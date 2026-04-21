import type { Email, Contact, SendEmailPayload } from "@/lib/types/email"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.FRONTEND_API_KEY || "",
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "An error occurred" }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }

  return response.json()
}

// Email endpoints
export async function getEmails(folder: string = "inbox"): Promise<Email[]> {
  return fetchWithAuth(`/emails?folder=${folder}`)
}

export async function getEmail(id: string): Promise<Email> {
  return fetchWithAuth(`/emails/${id}`)
}

export async function sendEmail(payload: SendEmailPayload): Promise<Email> {
  return fetchWithAuth("/emails/send", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function markAsRead(id: string): Promise<Email> {
  return fetchWithAuth(`/emails/${id}/read`, {
    method: "PATCH",
  })
}

export async function deleteEmail(id: string): Promise<void> {
  return fetchWithAuth(`/emails/${id}`, {
    method: "DELETE",
  })
}

// Contact endpoints
export async function getContacts(): Promise<Contact[]> {
  return fetchWithAuth("/contacts")
}

export async function createContact(contact: Omit<Contact, "id" | "created_at">): Promise<Contact> {
  return fetchWithAuth("/contacts", {
    method: "POST",
    body: JSON.stringify(contact),
  })
}

// SWR fetcher
export const fetcher = async (url: string) => {
  return fetchWithAuth(url)
}
