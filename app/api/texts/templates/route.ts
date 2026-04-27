import { NextRequest, NextResponse } from 'next/server';
import { getTextTemplatesCollection } from '../../../../lib/api/mongo';
import { ObjectId } from 'mongodb';

// GET: List all templates
export async function GET() {
  try {
    const collection = await getTextTemplatesCollection();
    const templates = await collection.find({}).sort({ name: 1 }).toArray();
    return NextResponse.json({ templates });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 });
  }
}

// POST: Save or update a template
export async function POST(req: NextRequest) {
  try {
    const { name, body, _id } = await req.json();
    if (!name || !body) {
      return NextResponse.json({ error: 'Missing name or body' }, { status: 400 });
    }
    const collection = await getTextTemplatesCollection();
    if (_id) {
      // Validate ObjectId
      let objectId: ObjectId | null = null;
      if (typeof _id === 'string' && ObjectId.isValid(_id)) {
        objectId = new ObjectId(_id);
      } else if (_id instanceof ObjectId) {
        objectId = _id;
      } else {
        return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
      }
      // Update existing
      const result: any = await collection.findOneAndUpdate(
        { _id: objectId },
        { $set: { name, body } },
        { returnDocument: 'after', upsert: false }
      );
      if (!result.value || !result.value._id) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }
      return NextResponse.json({ _id: result.value._id });
    } else {
      // Insert new
      const insertResult = await collection.insertOne({ name, body });
      return NextResponse.json({ _id: insertResult.insertedId });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Failed to save template' }, { status: 500 });
  }
}
