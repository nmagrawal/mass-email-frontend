import { NextRequest, NextResponse } from "next/server"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const API_KEY = process.env.FRONTEND_API_KEY || ""

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.from_email || !body.to || !body.subject || !body.body) {
      return NextResponse.json(
        { error: "Missing required fields: from_email, to, subject, body" },
        { status: 400 }
      )
    }

    const response = await fetch(`${API_URL}/api/send`, {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from_email: body.from_email,
        to: body.to,
        subject: body.subject,
        body: body.body,
        html_body: body.html_body,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Failed to send email" }))
      return NextResponse.json(
        { error: error.message || "Failed to send email" },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Error sending email:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
