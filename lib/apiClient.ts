
const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const API_KEY = process.env.NEXT_PUBLIC_API_KEY!;

export async function apiFetch(path: string, options: RequestInit = {}) {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
    },
  });
}

// --- SMS API helpers ---


// Create a new SMS template
export async function createSmsTemplate({ name, body, media_url }: { name: string; body: string; media_url?: string }) {
  return apiFetch("/api/sms/templates", {
    method: "POST",
    body: JSON.stringify({ name, body, media_url }),
  });
}

// Launch a new SMS campaign (audience: string[] for contacts, or { city: string })
export async function launchSmsCampaign({
  campaign_name,
  template_id,
  audience,
}: {
  campaign_name: string;
  template_id: string;
  audience: string[] | { city: string };
}) {
  return apiFetch("/api/sms/campaign", {
    method: "POST",
    body: JSON.stringify({ campaign_name, template_id, audience }),
  });
}

// (For completeness, not called from frontend) - Twilio webhook
export async function postTwilioWebhook(data: any) {
  return apiFetch("/api/webhook/twilio", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
