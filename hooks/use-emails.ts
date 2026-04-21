import useSWR from "swr"
import type { Email, Contact } from "@/lib/types/email"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export function useEmails(folder: string = "inbox") {
  const { data, error, isLoading, mutate } = useSWR<Email[]>(
    `/api/emails?folder=${folder}`,
    fetcher
  )

  return {
    emails: data || [],
    isLoading,
    isError: error,
    mutate,
  }
}

export function useEmail(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<Email>(
    id ? `/api/emails/${id}` : null,
    fetcher
  )

  return {
    email: data,
    isLoading,
    isError: error,
    mutate,
  }
}

export function useContacts() {
  const { data, error, isLoading, mutate } = useSWR<Contact[]>(
    "/api/contacts",
    fetcher
  )

  return {
    contacts: data || [],
    isLoading,
    isError: error,
    mutate,
  }
}
