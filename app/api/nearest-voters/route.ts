import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/api/mongo";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return NextResponse.json(
        {
          error: "Invalid location coordinates",
        },
        {
          status: 400,
        }
      );
    }

    const db = await getDb("voter_db_v2");

    const voters = await db
      .collection("voters")
      .find({
        "flags.srd2": true,

        "residence.location": {
          $near: {
            $geometry: {
              type: "Point",

              // MongoDB GeoJSON:
              // [longitude, latitude]
              coordinates: [lng, lat],
            },
          },
        },
      })
      .limit(10)
      .project({
        _id: 1,
        county: 1,

        "name.full": 1,
        "name.first": 1,
        "name.middle": 1,
        "name.last": 1,

        "residence.address_line1": 1,
        "residence.address_line2": 1,
        "residence.city": 1,
        "residence.state": 1,
        "residence.zip": 1,
        "residence.location": 1,

        "precinct.id": 1,
        "precinct.name": 1,

        "registration.party_name": 1,
        "registration.party_abbr": 1,

        flags: 1,
      })
      .toArray();

    return NextResponse.json({
      searchLocation: {
        lat,
        lng,
      },

      voters,
    });
  } catch (err: any) {
    console.error(
      "Nearest voters error:",
      err
    );

    return NextResponse.json(
      {
        error:
          err?.message ||
          "Failed to find nearest voters",
      },
      {
        status: 500,
      }
    );
  }
}