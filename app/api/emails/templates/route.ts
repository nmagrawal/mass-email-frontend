import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/api/mongo";

const dbName = "voter_db";
const collectionName = "emails";

// Create or update an email template
export async function POST(req: NextRequest) {
  try {
    const db = await getDb(dbName);
    const collection = db.collection(collectionName);
    const requestBody = await req.json();

    const { _id, name, subject, body: content, sequence } = requestBody;

    if (!name || !subject || !content) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (_id) {
      // Update existing template
      const result = await collection.updateOne(
        { _id: new ObjectId(_id) },
        { $set: { name, subject, body: content, sequence } }
      );

      if (result.matchedCount === 0) {
        return NextResponse.json(
          { error: "Template not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, updated: true });
    }

    // Assign next sequence if not provided
    let seq = sequence;

    if (seq == null) {
      const maxSeq = await collection
        .find()
        .sort({ sequence: -1 })
        .limit(1)
        .toArray();

      seq =
        maxSeq.length > 0 && maxSeq[0].sequence != null
          ? maxSeq[0].sequence + 1
          : 1;
    }

    const insertResult = await collection.insertOne({
      name,
      subject,
      body: content,
      sequence: seq,
    });

    return NextResponse.json({
      success: true,
      _id: insertResult.insertedId,
      sequence: seq,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// Retrieve all templates, sorted by sequence
export async function GET(req: NextRequest) {
  try {
    const db = await getDb(dbName);
    const collection = db.collection(collectionName);

    const projection = { name: 1, subject: 1, body: 1, sequence: 1 };

    const templates = await collection
      .find({}, { projection })
      .sort({ sequence: 1 })
      .toArray();

    return NextResponse.json({ templates });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}