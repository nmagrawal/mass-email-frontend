"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

import { useEffect, useRef } from "react";

export type SearchLocation = {
  lat: number;
  lng: number;
};

export type Voter = {
  _id: string;

  county?: string;

  name?: {
    full?: string;
    first?: string;
    middle?: string;
    last?: string;
  };

  residence?: {
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    zip?: string;

    location?: {
      type: "Point";
      coordinates: [number, number];
    };
  };

  precinct?: {
    id?: string;
    name?: string;
  };

  registration?: {
    party_name?: string;
    party_abbr?: string;
  };

  flags?: {
    srd2?: boolean;
    super_voter?: boolean;
  };
};

type Props = {
  searchLocation: SearchLocation;
  searchLabel: string;
  voters: Voter[];
};

let googleMapsConfigured = false;

function getVoterName(voter: Voter) {
  if (voter.name?.full) {
    return voter.name.full;
  }

  return (
    [voter.name?.first, voter.name?.middle, voter.name?.last]
      .filter(Boolean)
      .join(" ") || "Unknown"
  );
}

function getVoterAddress(voter: Voter) {
  return [
    voter.residence?.address_line1,
    voter.residence?.address_line2,
    voter.residence?.city,
    voter.residence?.state,
    voter.residence?.zip,
  ]
    .filter(Boolean)
    .join(", ");
}

function createInfoContent(title: string, subtitle?: string) {
  const container = document.createElement("div");

  container.style.minWidth = "220px";

  container.style.padding = "6px";

  const heading = document.createElement("div");

  heading.style.fontWeight = "600";

  heading.style.fontSize = "14px";

  heading.textContent = title;

  container.appendChild(heading);

  if (subtitle) {
    const text = document.createElement("div");

    text.style.marginTop = "6px";

    text.style.fontSize = "13px";

    text.textContent = subtitle;

    container.appendChild(text);
  }

  return container;
}

export default function NearestVotersMap({
  searchLocation,
  searchLabel,
  voters,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

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

      //
      // IMPORTANT:
      // Keep this import style.
      // This avoids the TypeScript
      // google namespace problem.
      //
      const [
        { Map, InfoWindow },

        { AdvancedMarkerElement, PinElement },

        { LatLngBounds },
      ] = await Promise.all([
        importLibrary("maps"),
        importLibrary("marker"),
        importLibrary("core"),
      ]);

      if (cancelled || !mapRef.current) {
        return;
      }

      const map = new Map(mapRef.current, {
        center: searchLocation,

        zoom: 15,

        mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID",
      });

      const bounds = new LatLngBounds();

      //
      // SEARCH LOCATION
      //

      bounds.extend(searchLocation);

      const blueDot = document.createElement("div");

      blueDot.style.width = "18px";
      blueDot.style.height = "18px";
      blueDot.style.background = "#4285F4";
      blueDot.style.border = "3px solid white";
      blueDot.style.borderRadius = "50%";
      blueDot.style.boxShadow = "0 0 0 8px rgba(66, 133, 244, 0.20)";

      const searchMarker = new AdvancedMarkerElement({
        map,
        position: searchLocation,
        title: "Your current location",
        content: blueDot,
        zIndex: 1000,
      });

      const searchInfo = new InfoWindow({
        content: createInfoContent("Search Location", searchLabel),
      });

      searchMarker.addEventListener("gmp-click", () => {
        searchInfo.open({
          map,
          anchor: searchMarker,
        });
      });

      //
      // NEAREST 10 SRD2 RECORDS
      //

      voters.forEach((voter, index) => {
        const coordinates = voter.residence?.location?.coordinates;

        if (!coordinates || coordinates.length !== 2) {
          console.warn("Missing coordinates:", voter._id);

          return;
        }

        //
        // MongoDB:
        // [longitude, latitude]
        //

        const [lngRaw, latRaw] = coordinates;

        const lat = Number(latRaw);

        const lng = Number(lngRaw);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          console.warn("Invalid coordinates:", voter._id, coordinates);

          return;
        }

        const position = {
          lat,
          lng,
        };

        bounds.extend(position);

        const name = getVoterName(voter);

        const address = getVoterAddress(voter);

        //
        // Numbered marker:
        // 1 - 10
        //

        const pin = new PinElement({
          glyphText: String(index + 1),

          scale: 1.05,
        });

        const marker = new AdvancedMarkerElement({
          map,

          position,

          title: `#${index + 1} ${name}`,

          content: pin,

          gmpClickable: true,
        });

        const infoWindow = new InfoWindow({
          content: createInfoContent(`#${index + 1} ${name}`, address),
        });

        marker.addEventListener("gmp-click", () => {
          infoWindow.open({
            map,
            anchor: marker,
          });
        });
      });

      //
      // FIT SEARCH LOCATION
      // + ALL 10 RESULTS
      //

      if (voters.length > 0) {
        map.fitBounds(bounds, 60);
      }
    }

    void initializeMap();

    return () => {
      cancelled = true;
    };
  }, [searchLocation, searchLabel, voters]);

  return (
    <div
      ref={mapRef}
      className="
        h-[520px]
        w-full
        overflow-hidden
        rounded-xl
        border
        bg-gray-100
      "
    />
  );
}
