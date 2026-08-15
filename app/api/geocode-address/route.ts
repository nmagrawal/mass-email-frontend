import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();

    if (!address?.trim()) {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      throw new Error("GOOGLE_MAPS_API_KEY is missing");
    }

    const url =
      "https://maps.googleapis.com/maps/api/geocode/json" +
      `?address=${encodeURIComponent(address)}` +
      `&key=${apiKey}`;

    const response = await fetch(url, {
      cache: "no-store",
    });

    const data = await response.json();

    if (
      data.status !== "OK" ||
      !data.results?.length
    ) {
      return NextResponse.json(
        {
          error: "Could not find that address",
        },
        { status: 400 }
      );
    }

    const location =
      data.results[0].geometry.location;

    return NextResponse.json({
      lat: location.lat,
      lng: location.lng,

      formattedAddress:
        data.results[0].formatted_address,
    });
  } catch (err: any) {
    console.error(
      "Geocoding error:",
      err
    );

    return NextResponse.json(
      {
        error:
          err.message ||
          "Failed to geocode address",
      },
      { status: 500 }
    );
  }
}