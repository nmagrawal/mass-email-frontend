
import { NextRequest, NextResponse } from "next/server"
import { MongoClient } from "mongodb"


const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const API_KEY = process.env.FRONTEND_API_KEY || ""
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "voter_db";
const VOTERS_COLLECTION = "voters";

export async function POST(request: NextRequest) {
  let client: MongoClient | null = null;
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.from_email || !body.subject || !body.html_template || !body.contacts) {
      return NextResponse.json(
        { error: "Missing required fields: from_email, subject, html_template, contacts" },
        { status: 400 }
      )
    }

    // Validate contacts array
    if (!Array.isArray(body.contacts) || body.contacts.length === 0) {
      return NextResponse.json(
        { error: "Contacts must be a non-empty array" },
        { status: 400 }
      )
    }

    // Validate each contact has email and first_name
    for (const contact of body.contacts) {
      if (!contact.email || !contact.first_name) {
        return NextResponse.json(
          { error: "Each contact must have email and first_name" },
          { status: 400 }
        )
      }
    }

    const response = await fetch(`${API_URL}/api/mass-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify({
        from_email: body.from_email,
        subject: body.subject,
        html_template: body.html_template,
        contacts: body.contacts,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Failed to send mass campaign" }))
      return NextResponse.json(
        { error: error.message || error.detail || "Failed to send mass campaign" },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Update last_template_sent for each contact in MongoDB
    if (body.template_name && Array.isArray(body.contacts)) {
      client = new MongoClient(MONGODB_URI!);
      await client.connect();
      const db = client.db(DB_NAME);
      const voters = db.collection(VOTERS_COLLECTION);
      const now = new Date();
      for (const contact of body.contacts) {
        if (!contact.email) continue;
        await voters.updateOne(
          { email: contact.email },
          {
            $set: {
              last_template_sent: body.template_name,
              last_template_sent_at: now,
            },
          }
        );
      }
      await client.close();
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Mass send error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
