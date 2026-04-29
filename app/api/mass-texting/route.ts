

import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { getDb } from '@/lib/api/mongo';
import { ObjectId } from 'mongodb';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

async function sendMessage(phone: string, message: string, imageUrl?: string) {
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio credentials are not set.');
  }
  try {
    const opts: any = {
      body: message,
      from: fromNumber,
      to: phone,
    };
    if (imageUrl) {
      opts.mediaUrl = [imageUrl];
    }
    await client.messages.create(opts);
    return { ok: true };
  } catch (err) {
    console.error('Twilio send error:', err);
    return { ok: false, error: err };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message, contacts, imageUrl } = await req.json();
    if (!message || !contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ error: 'Missing message or contacts.' }, { status: 400 });
    }
    // Send SMS or MMS to each contact (sequentially), personalizing message
    const db = await getDb(process.env.MONGODB_DB || 'opgov');
    const voters = db.collection('voters');
    for (const contact of contacts) {
      const phone = contact.phone;
      if (!phone) continue;
      // Replace {name} with contact name or phone
      const personalized = message.replace(/\{name\}/gi, contact.name || contact.phone);
      if (personalized.length > 1600) {
        return NextResponse.json({ error: `Message to ${phone} exceeds 1600 character limit after personalization.` }, { status: 400 });
      }
      // If imageUrl is present or message is too long, send as MMS
      const useMMS = !!imageUrl || personalized.length > 160;
      const result = await sendMessage(phone, personalized, useMMS ? imageUrl : undefined);
      if (!result.ok) {
        // Always mark as invalid_phone: true
        try {
          await voters.updateOne(
            { $or: [
              { 'demographics.phone': phone },
              { 'demographics.PhoneNumber': phone },
              { 'demographics.phone_1': phone },
              { phone: phone }
            ] },
            { $set: { invalid_phone: true } }
          );
        } catch (dbErr) {
          console.error('Failed to mark invalid_phone in DB:', dbErr);
        }
        return NextResponse.json({ error: `Failed to send to ${phone}` }, { status: 500 });
      }
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to send messages.' }, { status: 500 });
  }
}
