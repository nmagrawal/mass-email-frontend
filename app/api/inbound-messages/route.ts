import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/api/mongo";

const dbName = "voter_db";
const collectionName = "voters";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function normalizeLimit(value: string | null) {
  const parsed = Number.parseInt(value || String(DEFAULT_LIMIT), 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function normalizeSkip(value: string | null) {
  const parsed = Number.parseInt(value || "0", 10);

  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: NextRequest) {
  try {
    const db = await getDb(dbName);
    const collection = db.collection(collectionName);

    const { searchParams } = new URL(req.url);

    const skip = normalizeSkip(searchParams.get("skip"));
    const limit = normalizeLimit(searchParams.get("limit"));
    const search = searchParams.get("search")?.trim() || "";

    const safeSearch = escapeRegex(search);
    const numericSearch = search.replace(/\D/g, "");

    const searchFilter = search
      ? {
          $or: [
            { full_name: { $regex: safeSearch, $options: "i" } },
            { "demographics.PhoneNumber": { $regex: safeSearch, $options: "i" } },
            ...(numericSearch
              ? [
                  {
                    "demographics.PhoneNumberNormalized": {
                      $regex: numericSearch,
                      $options: "i",
                    },
                  },
                ]
              : []),
            {
              "sms_chats.inbound_unmatched.text": {
                $regex: safeSearch,
                $options: "i",
              },
            },
          ],
        }
      : {};

    const baseMatch = {
      "sms_chats.inbound_unmatched.0": { $exists: true },
      ...searchFilter,
    };

    const pipeline = [
      {
        $match: baseMatch,
      },
      {
        $project: {
          full_name: 1,
          phone: "$demographics.PhoneNumber",
          normalizedPhone: "$demographics.PhoneNumberNormalized",
          inboundMessages: {
            $filter: {
              input: {
                $ifNull: ["$sms_chats.inbound_unmatched", []],
              },
              as: "msg",
              cond: {
                $not: {
                  $in: [
                    {
                      $toLower: {
                        $trim: {
                          input: {
                            $ifNull: ["$$msg.text", ""],
                          },
                        },
                      },
                    },
                    ["stop", "op"],
                  ],
                },
              },
            },
          },
        },
      },
      {
        $match: {
          "inboundMessages.0": { $exists: true },
        },
      },
      {
        $addFields: {
          inboundCount: { $size: "$inboundMessages" },
          latestInboundMessage: {
            $arrayElemAt: [
              {
                $sortArray: {
                  input: "$inboundMessages",
                  sortBy: {
                    timestamp: -1,
                  },
                },
              },
              0,
            ],
          },
        },
      },
      {
        $project: {
          _id: 1,
          full_name: 1,
          phone: 1,
          normalizedPhone: 1,
          inboundCount: 1,
          lastMessage: "$latestInboundMessage.text",
          lastMessageTime: "$latestInboundMessage.timestamp",
        },
      },
      {
        $sort: {
          lastMessageTime: -1,
        },
      },
      {
        $facet: {
          conversations: [{ $skip: skip }, { $limit: limit }],
          totalResult: [{ $count: "total" }],
        },
      },
      {
        $project: {
          conversations: 1,
          total: {
            $ifNull: [{ $arrayElemAt: ["$totalResult.total", 0] }, 0],
          },
        },
      },
    ];

    const result = await collection.aggregate(pipeline).toArray();

    const conversations =
      result[0]?.conversations?.map((item: any) => ({
        id: String(item._id),
        name: item.full_name || "Unknown Sender",
        phone: item.phone || item.normalizedPhone || "",
        normalizedPhone: item.normalizedPhone || "",
        lastMessage: item.lastMessage || "",
        lastMessageTime: item.lastMessageTime || null,
        unreadCount: item.inboundCount || 0,
      })) || [];

    return NextResponse.json({
      conversations,
      total: result[0]?.total || 0,
      skip,
      limit,
      search,
    });
  } catch (err) {
    console.error("Inbound messages list error:", err);

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load inbox",
      },
      { status: 500 }
    );
  }
}