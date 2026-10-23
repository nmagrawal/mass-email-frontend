import { NextRequest, NextResponse } from "next/server";

import {
  MAX_BODY_LENGTH,
  MAX_SUBJECT_LENGTH,
  cleanString,
  getSignedInUser,
  getTemplatesCollection,
  isOutreachChannel,
  serializeTemplate,
} from "@/lib/outreach";

export const runtime = "nodejs";

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "template"
  );
}

// GET /api/outreach/templates?channel=sms
export async function GET(req: NextRequest) {
  try {
    const channel = req.nextUrl.searchParams.get("channel");
    const filter: Record<string, unknown> = {};

    if (channel) {
      if (!isOutreachChannel(channel)) {
        return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
      }
      filter.channel = channel;
    }

    const collection = await getTemplatesCollection();
    const templates = await collection.find(filter).sort({ name: 1 }).toArray();

    return NextResponse.json({ templates: templates.map(serializeTemplate) });
  } catch (err: any) {
    console.error("Outreach templates list error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load templates" },
      { status: 500 },
    );
  }
}

// POST /api/outreach/templates  { name, channel, body, subject? } → version 1
export async function POST(req: NextRequest) {
  try {
    const user = await getSignedInUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const name = cleanString(body.name);
    const channel = body.channel;
    const text = cleanString(body.body);
    const subject = cleanString(body.subject);

    if (!name || name.length > 120) {
      return NextResponse.json(
        { error: "Name is required (max 120 characters)" },
        { status: 400 },
      );
    }

    if (!isOutreachChannel(channel)) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    }

    if (!text || text.length > MAX_BODY_LENGTH) {
      return NextResponse.json(
        { error: `Message is required (max ${MAX_BODY_LENGTH} characters)` },
        { status: 400 },
      );
    }

    if (channel === "email" && (!subject || subject.length > MAX_SUBJECT_LENGTH)) {
      return NextResponse.json(
        { error: "Email templates need a subject" },
        { status: 400 },
      );
    }

    const collection = await getTemplatesCollection();
    const now = new Date();
    const baseId = `${channel}_${slugify(name)}`;

    // Readable ids like "sms_initial_outreach"; suffix on collision.
    for (let attempt = 0; attempt < 20; attempt++) {
      const id = attempt === 0 ? baseId : `${baseId}_${attempt + 1}`;

      try {
        const doc = {
          _id: id,
          name,
          channel,
          active_version: 1,
          versions: [
            {
              version: 1,
              ...(channel === "email" ? { subject } : {}),
              body: text,
              created_by: user.id,
              created_by_name: user.name,
              created_at: now,
            },
          ],
          created_at: now,
          updated_at: now,
        };

        await collection.insertOne(doc);

        return NextResponse.json({ template: serializeTemplate(doc) });
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
      }
    }

    return NextResponse.json(
      { error: "Could not create a unique template id" },
      { status: 409 },
    );
  } catch (err: any) {
    console.error("Outreach template create error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to create template" },
      { status: 500 },
    );
  }
}
