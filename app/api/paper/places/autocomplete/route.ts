import { NextRequest, NextResponse } from "next/server";

import { cleanString, requireUser } from "@/lib/paper-distribution";

export const runtime = "nodejs";

/*
 * POST /api/paper/places/autocomplete
 * { input, sessionToken, bias?: {lat,lng}, citiesOnly?: boolean }
 * Google Places (New) autocomplete — businesses and addresses, US only.
 * The same sessionToken must be passed to /api/paper/places/details.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await requireUser())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const input = cleanString(body.input, 200);
    const sessionToken = cleanString(body.sessionToken, 100);
    const lat = Number(body.bias?.lat);
    const lng = Number(body.bias?.lng);

    if (input.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is missing");

    const googleBody: Record<string, unknown> = {
      input,
      includedRegionCodes: ["us"],
      ...(sessionToken ? { sessionToken } : {}),
      ...(body.citiesOnly ? { includedPrimaryTypes: ["locality"] } : {}),
      ...(Number.isFinite(lat) && Number.isFinite(lng)
        ? { locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 15000 } } }
        : {}),
    };

    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
      body: JSON.stringify(googleBody),
      cache: "no-store",
    });
    const data = await res.json();

    if (!res.ok) {
      console.error("Places autocomplete:", data);
      return NextResponse.json(
        { error: data?.error?.message || "Place search failed" },
        { status: 502 },
      );
    }

    const suggestions = (data.suggestions || [])
      .map((s: any) => s.placePrediction)
      .filter(Boolean)
      .map((p: any) => ({
        placeId: p.placeId,
        primary: p.structuredFormat?.mainText?.text || p.text?.text || "",
        secondary: p.structuredFormat?.secondaryText?.text || "",
        types: p.types || [],
      }));

    return NextResponse.json({ suggestions });
  } catch (err: any) {
    console.error("Places autocomplete error:", err);
    return NextResponse.json({ error: err?.message || "Place search failed" }, { status: 500 });
  }
}
