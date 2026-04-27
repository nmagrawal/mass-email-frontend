
import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

async function sendMessage(phone: string, message: string, imageUrl?: string): Promise<boolean> {
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
    return true;
  } catch (err) {
    console.error('Twilio send error:', err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message, contacts, imageUrl } = await req.json();
    if (!message || !contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ error: 'Missing message or contacts.' }, { status: 400 });
    }
    // Send SMS or MMS to each contact (sequentially), personalizing message
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
      const ok = await sendMessage(phone, personalized, useMMS ? imageUrl : undefined);
      if (!ok) {
        return NextResponse.json({ error: `Failed to send to ${phone}` }, { status: 500 });
      }
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to send messages.' }, { status: 500 });
  }
}
