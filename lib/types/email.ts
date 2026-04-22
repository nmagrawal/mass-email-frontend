export interface Email {
  id: string
  from_email: string
  from_name?: string
  to_email: string
  to_name?: string
  subject: string
  text_body?: string
  html_body?: string
  created_at: string
  read: boolean
  folder: "inbox" | "sent" | "drafts" | "trash"
}

export interface Contact {
  id: string
  email: string
  name?: string
  created_at: string
}

export interface SendEmailPayload {
  to: string
  subject: string
  body: string
  html_body?: string
}

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface MassCampaignContact {
  email: string
  first_name: string
}

export interface MassCampaignPayload {
  from_email: string
  subject: string
  html_template: string
  contacts: MassCampaignContact[]
}
