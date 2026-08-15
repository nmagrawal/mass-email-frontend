import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const address =
      body.address?.trim();

    if (!address) {
      return NextResponse.json(
        {
          error: "Address is required",
        },
        {
          status: 400,
        }
      );
    }

    const apiKey =
      process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      throw new Error(
        "GOOGLE_MAPS_API_KEY is missing"
      );
    }

    const url =
      "https://maps.googleapis.com/maps/api/geocode/json" +
      `?address=${encodeURIComponent(address)}` +
      `&region=us` +
      `&key=${apiKey}`;

    const response = await fetch(
      url,
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(
        "Google Geocoding request failed"
      );
    }

    const data =
      await response.json();

    if (
      data.status !== "OK" ||
      !data.results?.length
    ) {
      console.error(
        "Google Geocoding status:",
        data.status,
        data.error_message
      );

      return NextResponse.json(
        {
          error:
            data.status === "ZERO_RESULTS"
              ? "Could not find that address"
              : "Address lookup failed",
        },
        {
          status: 400,
        }
      );
    }

    const result =
      data.results[0];

    const location =
      result.geometry.location;

    return NextResponse.json({
      lat: location.lat,
      lng: location.lng,

      formattedAddress:
        result.formatted_address,
    });
  } catch (err: any) {
    console.error(
      "Geocoding error:",
      err
    );

    return NextResponse.json(
      {
        error:
          err?.message ||
          "Failed to geocode address",
      },
      {
        status: 500,
      }
    );
  }
}