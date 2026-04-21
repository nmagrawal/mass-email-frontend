import useSWR from "swr"
import type { Email } from "@/lib/types/email"

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error("Failed to fetch")
  }
  return res.json()
}

export function useEmails(folder: string = "inbox") {
  // Don't fetch for mass-campaigns as it's not a real email folder
  const shouldFetch = folder !== "mass-campaigns"
  
  const { data, error, isLoading, mutate } = useSWR<Email[]>(
    shouldFetch ? `/api/emails?folder=${folder}` : null,
    fetcher
  )

  return {
    emails: Array.isArray(data) ? data : [],
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


