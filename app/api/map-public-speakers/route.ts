import { NextRequest } from "next/server";
import { getDb } from "@/lib/api/mongo";
import { MongoClient } from "mongodb";
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

    // First, unset public_speaker and public_speaker_id for all voters
    await mainDb.collection("voters").updateMany(
      {},
      { $unset: { public_speaker: "", public_speaker_id: "" } }
    );

    // Get all speakers
    const speakers = await opgovDb.collection("speakers_history").find({}).toArray();
    // Build a city-to-speakers map for efficient lookup
    const cityToSpeakers = new Map<string, Array<{ name: string; _id: any }>>();
    for (const s of speakers) {
      const name = (typeof s._id === "string" ? s._id : (s.speaker_name || String(s._id))).toLowerCase();
      for (const org of s.organizations || []) {
        const orgLower = org.toLowerCase();
        // For each substring (word) in org, add to map
        // But for our use-case, just add the whole org string
        if (!cityToSpeakers.has(orgLower)) cityToSpeakers.set(orgLower, []);
        cityToSpeakers.get(orgLower)!.push({ name, _id: s._id });
      }
    }

    const voterCursor = mainDb.collection("voters").find({});
    let updated = 0;
    const matched = [];
    const skipped = [];
    let processed = 0;
    while (await voterCursor.hasNext()) {
      const voter = await voterCursor.next();
      if (!voter) continue;
      processed++;
      if (processed % 10000 === 0) {
        console.log(`Processed ${processed} voters...`);
      }
      const first = voter.demographics?.name_first || "";
      const last = voter.demographics?.name_last || "";
      const city = voter.demographics?.city || "";
      if (!first.trim() || !last.trim() || !city.trim()) {
        skipped.push({
          voterId: voter._id,
          first_name: first,
          last_name: last,
          city,
        });
        continue;
      }
      const fullName = `${first} ${last}`.trim().toLowerCase();
      const cityLower = city.toLowerCase();
      // Efficient lookup: find all orgs that contain the city name as a substring
      let possibleSpeakers: Array<{ name: string; _id: any }> = [];
      for (const [org, speakersArr] of cityToSpeakers.entries()) {
        if (org.includes(cityLower)) {
          possibleSpeakers = possibleSpeakers.concat(speakersArr);
        }
      }
      // Now, check if any of these speakers' names are present in the voter's full name
      const speaker = possibleSpeakers.find(s => fullName.includes(s.name));
      if (speaker) {
        await mainDb.collection("voters").updateOne(
          { _id: voter._id },
          {
            $set: {
              public_speaker: true,
              public_speaker_id: speaker._id,
            },
          }
        );
        updated++;
        matched.push({
          voterId: voter._id,
          public_speaker_id: speaker._id,
          first_name: first,
          last_name: last,
          city,
        });
      } else {
        // No need to unset again, already done above
      }
    }
    await voterCursor.close();
    // Write log file (only mapped/matched voters)
    const log = {
      timestamp: new Date().toISOString(),
      updated,
      mapped: matched,
    };
    await writeFile("./public-speaker-mapping-log-new.json", JSON.stringify(log, null, 2), "utf-8");

    return new Response(
      JSON.stringify({ success: true, updated, logFile: "public-speaker-mapping-log-new.json" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// curl -X POST http://localhost:3000/api/map-public-speakers
