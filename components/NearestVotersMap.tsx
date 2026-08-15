"use client";

import { useEffect, useRef } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

type UserLocation = {
  lat: number;
  lng: number;
};

type Voter = {
  _id: string;

  name?: {
    full?: string;
    first?: string;
    last?: string;
  };

  residence?: {
    address_line1?: string;
    city?: string;
    state?: string;
    zip?: string;

    location?: {
      type: "Point";
      coordinates: [number, number];
    };
  };
};

type Props = {
  userLocation: UserLocation;
  voters: Voter[];
};

let googleMapsConfigured = false;

export default function NearestVotersMap({ userLocation, voters }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    let cancelled = false;

    async function initializeMap() {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

      if (!apiKey) {
        console.error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing");

        return;
      }

      if (!googleMapsConfigured) {
        setOptions({
          key: apiKey,
          v: "weekly",
        });

        googleMapsConfigured = true;
      }

      const [{ Map, InfoWindow }, { AdvancedMarkerElement }, { LatLngBounds }] =
        await Promise.all([
          importLibrary("maps"),
          importLibrary("marker"),
          importLibrary("core"),
        ]);

      if (cancelled || !mapRef.current) {
        return;
      }

      const map = new Map(mapRef.current, {
        center: userLocation,
        zoom: 15,

        mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID",
      });

      const bounds = new LatLngBounds();

      bounds.extend(userLocation);

      // ----------------------------------------
      // User's current location
      // ----------------------------------------

      const userMarker = new AdvancedMarkerElement({
        map,
        position: userLocation,
        title: "Your current location",
        gmpClickable: true,
      });

      const userInfo = new InfoWindow({
        content: `
            <div style="padding:4px">
              <strong>Your current location</strong>
            </div>
          `,
      });

      userMarker.addEventListener("gmp-click", () => {
        userInfo.open({
          map,
          anchor: userMarker,
        });
      });

      // ----------------------------------------
      // Nearest SRD2 voters
      // ----------------------------------------

      voters.forEach((voter, index) => {
        const coordinates = voter.residence?.location?.coordinates;

        if (!coordinates || coordinates.length !== 2) {
          return;
        }

        const [lng, lat] = coordinates;

        const position = {
          lat,
          lng,
        };

        bounds.extend(position);

        const name =
          voter.name?.full ||
          [voter.name?.first, voter.name?.last].filter(Boolean).join(" ") ||
          "Unknown";

        const address = [
          voter.residence?.address_line1,
          voter.residence?.city,
          voter.residence?.state,
          voter.residence?.zip,
        ]
          .filter(Boolean)
          .join(", ");

        const marker = new AdvancedMarkerElement({
          map,
          position,
          title: `${index + 1}. ${name}`,
          gmpClickable: true,
        });

        const infoWindow = new InfoWindow({
          content: `
              <div style="min-width:200px;padding:4px">
                <strong>
                  #${index + 1} ${name}
                </strong>

                <div style="margin-top:6px">
                  ${address}
                </div>
              </div>
            `,
        });

        marker.addEventListener("gmp-click", () => {
          infoWindow.open({
            map,
            anchor: marker,
          });
        });
      });

      if (voters.length > 0) {
        map.fitBounds(bounds, 60);
      }
    }

    void initializeMap();

    return () => {
      cancelled = true;
    };
  }, [userLocation, voters]);

  return <div ref={mapRef} className="h-[500px] w-full rounded-xl border" />;
}
