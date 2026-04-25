import { NextRequest } from "next/server";
import { MongoClient } from "mongodb";
import { getDb } from "@/lib/api/mongo";
import { writeFile } from "fs/promises";

// Helper to get opgov-prod DB from a different URI
async function getOpgovProdDb() {
  const uri = process.env.MONGODB_URI_1;
  if (!uri) throw new Error("MONGODB_URI_1 not set");
  const client = new MongoClient(uri);
  await client.connect();
  return client.db("opgov-prod");
}

export async function POST(req: NextRequest) {
  try {
    const mainDb = await getDb("voter_db");
    const opgovDb = await getOpgovProdDb();

    // First, unset opgovUser and opgovUserId for all voters
    await mainDb.collection("voters").updateMany(
      {},
      { $unset: { opgovUser: "", opgovUserId: "" } }
    );

    const users = await opgovDb.collection("users").find({}).toArray();
    const voterCursor = mainDb.collection("voters").find({});

    // Build a lookup map for users by first+last name (lowercased, trimmed)
    const userMap = new Map();
    for (const u of users) {
      const key = `${(u.firstName || "").trim().toLowerCase()}|${(u.lastName || "").trim().toLowerCase()}`;
      userMap.set(key, u);
    }

    let updated = 0;
    const matched: any[] = [];
    const skipped: any[] = [];
    let processed = 0;
    while (await voterCursor.hasNext()) {
      const voter = await voterCursor.next();
      if (!voter) continue;
      processed++;
      if (processed % 10000 === 0) {
        console.log(`Processed ${processed} voters...`);
      }
      const firstName = voter.demographics?.name_first || "";
      const lastName = voter.demographics?.name_last || "";
      const city = voter.demographics?.city || null;
      if (!firstName.trim() || !lastName.trim()) {
        // Skip mapping if first or last name is missing
        skipped.push({
          voterId: voter._id,
          first_name: firstName,
          last_name: lastName,
          city,
        });
        continue;
      }
      const key = `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}`;
      const match = userMap.get(key);
      if (match) {
        console.log(`Match found: voterId=${voter._id}, opgovUserId=${match._id}, name=${firstName} ${lastName}`);
        await mainDb.collection("voters").updateOne(
          { _id: voter._id },
          {
            $set: {
              opgovUserId: match._id,
              opgovUser: true,
            },
          }
        );
        updated++;
        matched.push({
          voterId: voter._id,
          opgovUserId: match._id,
          first_name: firstName,
          last_name: lastName,
          city,
        });
      } else {
        // No need to unset again, already done above
      }
    }
    await voterCursor.close();
    // Write log file (mapped/matched users and skipped voters)
    const log = {
      timestamp: new Date().toISOString(),
      updated,
      mapped: matched,
      skipped,
    };
    await writeFile("./opgov-voter-mapping-log.json", JSON.stringify(log, null, 2), "utf-8");

    return new Response(
      JSON.stringify({ success: true, updated, logFile: "opgov-voter-mapping-log.json" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}


// curl -X POST http://localhost:3000/api/map-opgov-users