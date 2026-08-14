import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/api/mongo";

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();

    if (!address?.trim()) {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 }
      );
    }

    // -----------------------------------------
    // 1. Geocode the address entered by user
    // -----------------------------------------

    const googleApiKey =
      process.env.GOOGLE_MAPS_API_KEY;

    if (!googleApiKey) {
      throw new Error(
        "GOOGLE_MAPS_API_KEY is not configured"
      );
    }

    const geocodeUrl =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?address=${encodeURIComponent(address)}` +
      `&key=${googleApiKey}`;

    const geocodeResponse = await fetch(
      geocodeUrl,
      {
        cache: "no-store",
      }
    );

    const geocodeData =
      await geocodeResponse.json();

    if (
      geocodeData.status !== "OK" ||
      !geocodeData.results?.length
    ) {
      return NextResponse.json(
        {
          error: "Could not locate that address",
        },
        { status: 400 }
      );
    }

    const {
      lat,
      lng,
    } =
      geocodeData.results[0].geometry.location;

    // -----------------------------------------
    // 2. Use YOUR EXISTING Mongo helper
    // -----------------------------------------

    const db = await getDb("voter_db_v2");

    // -----------------------------------------
    // 3. Find nearest 10 voters
    // -----------------------------------------

    const voters = await db
      .collection("voters")
      .find({
        "residence.location": {
          $near: {
            $geometry: {
              type: "Point",

              // Mongo GeoJSON = longitude first
              coordinates: [lng, lat],
            },
          },
        },
      })
      .limit(10)
      .project({
        _id: 1,

        "name.full": 1,
        "name.first": 1,
        "name.last": 1,

        "residence.address_line1": 1,
        "residence.city": 1,
        "residence.state": 1,
        "residence.zip": 1,
        "residence.location": 1,

        "precinct.id": 1,
        "precinct.name": 1,

        "registration.party_name": 1,
        "registration.party_abbr": 1,
      })
      .toArray();

    return NextResponse.json({
      searchedAddress:
        geocodeData.results[0]
          .formatted_address,

      coordinates: {
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
          err.message ||
          "Failed to find nearest voters",
      },
      { status: 500 }
    );
  }
}