import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI!;
const dbName = "voter_db";
const collectionName = "emails";

// Create or update an email template
export async function POST(req: NextRequest) {
  const client = new MongoClient(uri);
  try {
    const body = await req.json();
    const { _id, name, subject, body: content, sequence } = body;
    if (!name || !subject || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    let result;
    if (_id) {
      // Update existing template
      result = await collection.updateOne(
        { _id: new ObjectId(_id) },
        { $set: { name, subject, body: content, sequence } }
      );
      if (result.matchedCount === 0) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, updated: true });
    } else {
      // Assign next sequence if not provided
      let seq = sequence;
      if (seq == null) {
        const maxSeq = await collection.find().sort({ sequence: -1 }).limit(1).toArray();
        seq = maxSeq.length > 0 && maxSeq[0].sequence != null ? maxSeq[0].sequence + 1 : 1;
      }
      const insertResult = await collection.insertOne({ name, subject, body: content, sequence: seq });
      return NextResponse.json({ success: true, _id: insertResult.insertedId, sequence: seq });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : err }, { status: 500 });
  } finally {
    await client.close();
  }
}

// Retrieve all templates, sorted by sequence
export async function GET(req: NextRequest) {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const templates = await collection.find().sort({ sequence: 1 }).toArray();
    return NextResponse.json({ templates });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : err }, { status: 500 });
  } finally {
    await client.close();
  }
}
