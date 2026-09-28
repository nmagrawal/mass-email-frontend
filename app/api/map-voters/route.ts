import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/api/mongo";

export const runtime = "nodejs";

type BoundsBody = {
  north?: unknown;
  south?: unknown;
  east?: unknown;
  west?: unknown;
  zoom?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as BoundsBody;

    const north = Number(body.north);
    const south = Number(body.south);
    const east = Number(body.east);
    const west = Number(body.west);
    const zoom = Number(body.zoom);

    if (
      !Number.isFinite(north) ||
      !Number.isFinite(south) ||
      !Number.isFinite(east) ||
      !Number.isFinite(west) ||
      north < -90 ||
      north > 90 ||
      south < -90 ||
      south > 90 ||
      east < -180 ||
      east > 180 ||
      west < -180 ||
      west > 180 ||
      south >= north
    ) {
      return NextResponse.json(
        {
          error: "Invalid map bounds",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * San Ramon does not cross the international date line. If the viewport
     * somehow does, use the world longitude range and let the city filter keep
     * results restricted to San Ramon.
     */
    const polygonWest = west <= east ? west : -180;
    const polygonEast = west <= east ? east : 180;

    const db = await getDb("voter_db_v2");

    const addresses = await db
      .collection("voters")
      .aggregate([
        {
          $match: {
            "residence.city": "San Ramon",

            $or: [
              {
                "flags.super_voter": true,
              },
              {
                "flags.frequent_voter": true,
              },
            ],

            "residence.location": {
              $geoWithin: {
                $geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [polygonWest, south],
                      [polygonEast, south],
                      [polygonEast, north],
                      [polygonWest, north],
                      [polygonWest, south],
                    ],
                  ],
                },
              },
            },

            "residence.address_line1": {
              $type: "string",
              $ne: "",
            },
          },
        },

        /*
         * Build one stable household key. address_line2 is included so units
         * and apartments at the same street address stay separate.
         */
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

            /*
             * These IDs make household-detail clicks fast. The details API can
             * now use MongoDB's built-in _id index instead of rebuilding the
             * normalized address key across many documents on every click.
             */
            voterIds: {
              $push: "$_id",
            },

            voterCount: {
              $sum: 1,
            },

            superVoterCount: {
              $sum: {
                $cond: [
                  {
                    $eq: ["$flags.super_voter", true],
                  },
                  1,
                  0,
                ],
              },
            },

            frequentVoterCount: {
              $sum: {
                $cond: [
                  {
                    $eq: ["$flags.frequent_voter", true],
                  },
                  1,
                  0,
                ],
              },
            },

            district2Count: {
              $sum: {
                $cond: [
                  {
                    $eq: ["$flags.srd2", true],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },

        {
          $project: {
            _id: 0,
            addressKey: "$_id",
            address: 1,
            location: 1,
            voterIds: 1,
            voterCount: 1,
            superVoterCount: 1,
            frequentVoterCount: 1,
            district2Count: 1,
          },
        },
      ])
      .toArray();

    const voterCount = addresses.reduce(
      (total, address) => total + Number(address.voterCount || 0),
      0,
    );

    return NextResponse.json({
      addresses,
      addressCount: addresses.length,
      voterCount,
      zoom: Number.isFinite(zoom) ? zoom : null,
    });
  } catch (err: any) {
    console.error("Map voters error:", err);

    return NextResponse.json(
      {
        error: err?.message || "Failed to load voters for visible map area",
      },
      {
        status: 500,
      },
    );
  }
}
