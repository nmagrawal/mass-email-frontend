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
    const body = await request.json();

    // Validate required fields
    if (!body.from_email || !body.to || !body.subject || !body.body) {
      return NextResponse.json(
        { error: "Missing required fields: from_email, to, subject, body" },
        { status: 400 }
      );
    }

    // Send the email as before
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
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Failed to send email" }));
      return NextResponse.json(
        { error: error.message || "Failed to send email" },
        { status: response.status }
      );
    }

    // Record the template sent in the voter's record
    // Expecting: body.template_name, body.contacts (array of {email, first_name})
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
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error sending email:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    if (client) await client.close();
  }
}
