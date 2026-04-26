
import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

async function sendSMS(phone: string, message: string): Promise<boolean> {
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio credentials are not set.');
  }
  try {
    await client.messages.create({
      body: message,
      from: fromNumber,
      to: phone,
    });
    return true;
  } catch (err) {
    console.error('Twilio SMS error:', err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message, contacts } = await req.json();
    if (!message || !contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ error: 'Missing message or contacts.' }, { status: 400 });
    }
    // Send SMS to each contact (sequentially)
    for (const contact of contacts) {
      const phone = contact.phone;
      if (!phone) continue;
      const ok = await sendSMS(phone, message);
      if (!ok) {
        return NextResponse.json({ error: `Failed to send to ${phone}` }, { status: 500 });
      }
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to send messages.' }, { status: 500 });
  }
}
