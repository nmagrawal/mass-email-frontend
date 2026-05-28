import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/api/mongo";

const dbName = "voter_db";
const collectionName = "voters";

interface RawSmsMessage {
  text?: string;
  message?: string;
  direction?: "inbound" | "outbound";
  timestamp?: string | Date | { $date?: string };
  campaign?: string;
}

function normalizeTimestamp(value: unknown) {
  if (!value) {
    return new Date().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "$date" in value &&
    typeof (value as { $date?: string }).$date === "string"
  ) {
    const date = new Date((value as { $date: string }).$date);
    return Number.isNaN(date.getTime())
      ? new Date().toISOString()
      : date.toISOString();
  }

  if (typeof value === "string") {
    let cleaned = value.trim();

    // Trim Python-style microseconds to JS-supported milliseconds.
    cleaned = cleaned.replace(/(\.\d{3})\d+/, "$1");

    // If no timezone exists, force UTC so inbound/outbound parse the same.
    if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(cleaned)) {
      cleaned = `${cleaned}Z`;
    }

    const date = new Date(cleaned);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }

    return new Date().toISOString();
  }

  return new Date().toISOString();
}

function shouldHideInboundText(text: string) {
  const clean = text.trim().toLowerCase();
  return clean === "stop" || clean === "op";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ voterId: string }> }
) {
  try {
    const { voterId } = await params;

    if (!ObjectId.isValid(voterId)) {
      return NextResponse.json({ error: "Invalid voter id" }, { status: 400 });
    }

    const db = await getDb(dbName);
    const collection = db.collection(collectionName);

    const voter = await collection.findOne(
      { _id: new ObjectId(voterId) },
      {
        projection: {
          full_name: 1,
          demographics: 1,
          sms_chats: 1,
        },
      }
    );

    if (!voter) {
      return NextResponse.json({ error: "Voter not found" }, { status: 404 });
    }

    const smsChats = voter.sms_chats || {};
    const phone =
      voter.demographics?.PhoneNumber ||
      voter.demographics?.PhoneNumberNormalized ||
      "";

    const messages: any[] = [];

    for (const [threadName, threadMessages] of Object.entries(smsChats)) {
      if (!Array.isArray(threadMessages)) continue;

      for (const raw of threadMessages as RawSmsMessage[]) {
        const text = raw.text || raw.message || "";

        if (!text.trim()) continue;

        const direction = raw.direction === "outbound" ? "outbound" : "inbound";
        const timestamp = normalizeTimestamp(raw.timestamp);

        if (direction === "inbound" && shouldHideInboundText(text)) {
          continue;
        }

        messages.push({
          id: `${threadName}-${direction}-${timestamp}-${text}`,
          text,
          direction,
          timestamp,
          campaign:
            threadName !== "inbound_unmatched"
              ? threadName
              : raw.campaign || null,
          full_name: voter.full_name || "Unknown Sender",
          phone,
        });
      }
    }

    const uniqueMessages = Array.from(
      new Map(
        messages.map((message) => [
          `${message.direction}-${message.timestamp}-${message.text}`,
          message,
        ])
      ).values()
    );

    uniqueMessages.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return NextResponse.json({
      voter: {
        id: String(voter._id),
        name: voter.full_name || "Unknown Sender",
        phone,
        normalizedPhone: voter.demographics?.PhoneNumberNormalized || "",
      },
      messages: uniqueMessages,
    });
  } catch (err) {
    console.error("Inbound message detail error:", err);

    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load conversation",
      },
      { status: 500 }
    );
  }
}