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
        },
      );
    }

    const db = await getDb("voter_db_v2");

    const addresses = await db
      .collection("voters")
      .aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [lng, lat],
            },
            key: "residence.location",
            spherical: true,
            distanceField: "distanceMeters",
            query: {
              "residence.city": "San Ramon",
              $or: [
                {
                  "flags.super_voter": true,
                },
                {
                  "flags.frequent_voter": true,
                },
              ],
            },
          },
        },
        {
          $match: {
            "residence.address_line1": {
              $type: "string",
              $ne: "",
            },
          },
        },
        {
          $set: {
            addressKey: {
              $concat: [
                {
                  $toLower: {
                    $trim: {
                      input: {
                        $ifNull: ["$residence.address_line1", ""],
                      },
                    },
                  },
                },
                "|",
                {
                  $toLower: {
                    $trim: {
                      input: {
                        $ifNull: ["$residence.address_line2", ""],
                      },
                    },
                  },
                },
                "|",
                {
                  $toLower: {
                    $trim: {
                      input: {
                        $ifNull: ["$residence.city", ""],
                      },
                    },
                  },
                },
                "|",
                {
                  $toLower: {
                    $trim: {
                      input: {
                        $ifNull: ["$residence.state", ""],
                      },
                    },
                  },
                },
                "|",
                {
                  $toString: {
                    $ifNull: ["$residence.zip", ""],
                  },
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: "$addressKey",

            distanceMeters: {
              $min: "$distanceMeters",
            },

            representativeVoterId: {
              $first: "$_id",
            },

            address: {
              $first: {
                address_line1: "$residence.address_line1",
                address_line2: "$residence.address_line2",
                city: "$residence.city",
                state: "$residence.state",
                zip: "$residence.zip",
              },
            },

            location: {
              $first: "$residence.location",
            },

            voters: {
              $push: {
                _id: "$_id",
                county: "$county",
                name: "$name",
                contact: "$contact",
                precinct: "$precinct",
                registration: "$registration",
                flags: "$flags",
              },
            },
          },
        },
        {
          $set: {
            voterCount: {
              $size: "$voters",
            },
          },
        },
        {
          $sort: {
            distanceMeters: 1,
          },
        },
        {
          $limit: 10,
        },
        {
          $project: {
            _id: 0,
            addressKey: "$_id",
            representativeVoterId: 1,
            address: 1,
            location: 1,
            distanceMeters: 1,
            voterCount: 1,
            voters: 1,
          },
        },
      ])
      .toArray();

    return NextResponse.json({
      searchLocation: {
        lat,
        lng,
      },
      addresses,
    });
  } catch (err: any) {
    console.error("Nearest address groups error:", err);

    return NextResponse.json(
      {
        error: err?.message || "Failed to find nearest addresses",
      },
      {
        status: 500,
      },
    );
  }
}
