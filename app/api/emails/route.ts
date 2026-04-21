import { NextRequest, NextResponse } from "next/server"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const API_KEY = process.env.FRONTEND_API_KEY || ""

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const folder = searchParams.get("folder") || "inbox"

  try {
    const response = await fetch(`${API_URL}/emails?folder=${folder}`, {
      headers: {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch emails" },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Error fetching emails:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
