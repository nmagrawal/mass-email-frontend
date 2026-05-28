// app/api/private-message/route.ts
import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { getDb } from "@/lib/api/mongo";
import { ObjectId } from "mongodb";

const dbName = "voter_db";
const voterCollectionName = "voters";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

const DEFAULT_MMS_IMAGE =
  "https://upload.wikimedia.org/wikipedia/commons/c/ca/1x1.png";

interface RawSmsMessage {
  text?: string;
  message?: string;
  direction?: "inbound" | "outbound";
  timestamp?: string | Date | { $date?: string };
  campaign?: string;
}

function normalizeDate(value: unknown): Date {
  if (!value) return new Date(0);

  if (value instanceof Date) return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "$date" in value &&
    typeof (value as { $date?: string }).$date === "string"
  ) {
    const date = new Date((value as { $date: string }).$date);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
  }

  if (typeof value === "string") {
    let cleaned = value.trim();

    cleaned = cleaned.replace(/(\.\d{3})\d+/, "$1");

    if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(cleaned)) {
      cleaned = `${cleaned}Z`;
    }

    const date = new Date(cleaned);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
  }

  return new Date(0);
}

function escapeMongoPathSegment(value: string) {
  return value.replace(/\./g, "_").replace(/\$/g, "_");
}

async function sendMessage(
  phone: string,
  message: string,
  imageUrl?: string,
  forceMMS?: boolean
) {
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio credentials are not set.");
  }

  const opts: any = {
    body: message,
    from: fromNumber,
    to: phone,
  };

  if (imageUrl) {
    opts.mediaUrl = [imageUrl];
  } else if (forceMMS) {
    opts.mediaUrl = [DEFAULT_MMS_IMAGE];
  }

  const twilioMessage = await client.messages.create(opts);

  return {
    ok: true,
    sid: twilioMessage.sid,
    status: twilioMessage.status,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      voterId,
      phone,
      message,
      imageUrl,
      forceMMS,
      campaignId,
    } = body;

    if (!voterId || !phone || !message) {
      return NextResponse.json(
        { error: "Missing required fields: voterId, phone, message" },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(voterId)) {
      return NextResponse.json(
        { error: "Invalid voterId" },
        { status: 400 }
      );
    }

    if (campaignId && !ObjectId.isValid(campaignId)) {
      return NextResponse.json(
        { error: "Invalid campaignId" },
        { status: 400 }
      );
    }

    const db = await getDb(dbName);
    const votersCollection = db.collection(voterCollectionName);

    const voter = await votersCollection.findOne(
      { _id: new ObjectId(voterId) },
      {
        projection: {
          sms_chats: 1,
        },
      }
    );

    if (!voter) {
      return NextResponse.json(
        { error: "Voter not found" },
        { status: 404 }
      );
    }

    const smsChats = voter.sms_chats || {};

    let latestInboundThreadName: string | null = null;
    let latestInboundMessage: RawSmsMessage | null = null;
    let latestInboundDate = new Date(0);

    for (const [threadName, threadMessages] of Object.entries(smsChats)) {
      if (!Array.isArray(threadMessages)) continue;

      for (const raw of threadMessages as RawSmsMessage[]) {
        const direction = raw.direction === "outbound" ? "outbound" : "inbound";

        if (direction !== "inbound") continue;

        const text = raw.text || raw.message || "";
        if (!text.trim()) continue;

        const date = normalizeDate(raw.timestamp);

        if (date.getTime() > latestInboundDate.getTime()) {
          latestInboundDate = date;
          latestInboundThreadName = threadName;
          latestInboundMessage = raw;
        }
      }
    }

    const targetThreadName = latestInboundThreadName || "inbound_unmatched";
    const safeTargetThreadName = escapeMongoPathSegment(targetThreadName);

    const sendResult = await sendMessage(phone, message, imageUrl, forceMMS);

    const outboundSmsChatMessage = {
      text: message,
      direction: "outbound" as const,
      timestamp: new Date(),
      ...(imageUrl ? { imageUrl } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(sendResult.sid ? { twilioSid: sendResult.sid } : {}),
      ...(sendResult.status ? { twilioStatus: sendResult.status } : {}),
      replyToInboundTimestamp: latestInboundMessage?.timestamp || null,
      replyToInboundText:
        latestInboundMessage?.text || latestInboundMessage?.message || null,
    };

    const updateDoc: any = {
      $push: {
        [`sms_chats.${safeTargetThreadName}`]: outboundSmsChatMessage,
      },
      $set: {
        last_sms_sent_at: new Date(),
        last_sms_thread: safeTargetThreadName,
      },
    };

    await votersCollection.updateOne(
      { _id: new ObjectId(voterId) },
      updateDoc
    );

    let messageCollectionId: ObjectId | null = null;

    if (campaignId) {
      const outboundMessage = {
        voterId: new ObjectId(voterId),
        campaignId: new ObjectId(campaignId),
        phone,
        message,
        imageUrl: imageUrl || null,
        direction: "outbound",
        timestamp: new Date(),
        smsChatThread: safeTargetThreadName,
        twilioSid: sendResult.sid,
        twilioStatus: sendResult.status,
        relatedInboundText:
          latestInboundMessage?.text || latestInboundMessage?.message || null,
        relatedInboundTimestamp: latestInboundMessage?.timestamp || null,
      };

      const result = await db.collection("messages").insertOne(outboundMessage);
      messageCollectionId = result.insertedId;
    }

    return NextResponse.json(
      {
        ok: true,
        smsChatThread: safeTargetThreadName,
        messageId: messageCollectionId,
        twilioResponse: sendResult,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Route handler error:", err);

    return NextResponse.json(
      {
        error: "Internal server error",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}