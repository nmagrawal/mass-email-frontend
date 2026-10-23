import { NextRequest, NextResponse } from "next/server";

import {
  MAX_BODY_LENGTH,
  MAX_SUBJECT_LENGTH,
  cleanString,
  getSignedInUser,
  getTemplatesCollection,
  serializeTemplate,
} from "@/lib/outreach";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/*
 * POST /api/outreach/templates/:id  { body, subject?, activate? = true }
 * Adds a new version. Existing versions are never modified (audit history).
 */
export async function POST(req: NextRequest, { params }: Context) {
  try {
    const user = await getSignedInUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const text = cleanString(body.body);
    const subject = cleanString(body.subject);
    const activate = body.activate !== false;

    if (!text || text.length > MAX_BODY_LENGTH) {
      return NextResponse.json(
        { error: `Message is required (max ${MAX_BODY_LENGTH} characters)` },
        { status: 400 },
      );
    }

    const collection = await getTemplatesCollection();

    // Retry if two people add a version at the same moment.
    for (let attempt = 0; attempt < 5; attempt++) {
      const template = await collection.findOne({ _id: id });

      if (!template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }

      if (
        template.channel === "email" &&
        (!subject || subject.length > MAX_SUBJECT_LENGTH)
      ) {
        return NextResponse.json(
          { error: "Email templates need a subject" },
          { status: 400 },
        );
      }

      const latest = template.versions.reduce(
        (max, v) => Math.max(max, v.version),
        0,
      );
      const nextVersion = latest + 1;
      const now = new Date();

      const result = await collection.findOneAndUpdate(
        { _id: id, "versions.version": { $ne: nextVersion } },
        {
          $push: {
            versions: {
              version: nextVersion,
              ...(template.channel === "email" ? { subject } : {}),
              body: text,
              created_by: user.id,
              created_by_name: user.name,
              created_at: now,
            },
          },
          $set: {
            updated_at: now,
            ...(activate ? { active_version: nextVersion } : {}),
          },
        },
        { returnDocument: "after" },
      );

      if (result) {
        return NextResponse.json({ template: serializeTemplate(result) });
      }
    }

    return NextResponse.json(
      { error: "Template was being edited by someone else, try again" },
      { status: 409 },
    );
  } catch (err: any) {
    console.error("Outreach template version error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to save new version" },
      { status: 500 },
    );
  }
}

// PATCH /api/outreach/templates/:id  { activeVersion } — switch / roll back
export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const user = await getSignedInUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const activeVersion = Number(body.activeVersion);

    if (!Number.isInteger(activeVersion) || activeVersion < 1) {
      return NextResponse.json({ error: "Invalid version" }, { status: 400 });
    }

    const collection = await getTemplatesCollection();
    const result = await collection.findOneAndUpdate(
      { _id: id, "versions.version": activeVersion },
      { $set: { active_version: activeVersion, updated_at: new Date() } },
      { returnDocument: "after" },
    );

    if (!result) {
      return NextResponse.json(
        { error: "Template or version not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ template: serializeTemplate(result) });
  } catch (err: any) {
    console.error("Outreach template activate error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to update template" },
      { status: 500 },
    );
  }
}
