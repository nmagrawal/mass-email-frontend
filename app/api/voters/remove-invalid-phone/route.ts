import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/api/mongo";

export async function POST(req: NextRequest) {
  try {
    const db = await getDb(process.env.MONGODB_DB || "opgov");
    const voters = db.collection("voters");
    const result = await voters.updateMany(
      { invalid_phone: true },
      { $unset: { invalid_phone: "" } }
    );
    const log = { success: true, modifiedCount: result.modifiedCount };
    console.log(JSON.stringify(log));
    return NextResponse.json(log);
  } catch (error) {
    let message = 'Unknown error';
    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    }
    const log = { success: false, error: message };
    console.log(JSON.stringify(log));
    return NextResponse.json(log, { status: 500 });
  }
}
