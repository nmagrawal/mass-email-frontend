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

  contact?: {
    phone_primary?: string;
    phone_secondary?: string;
    email?: string;
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
    frequent_voter?: boolean;
  };
};

export type AddressGroup = {
  addressKey: string;
  representativeVoterId: string;

  address: {
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    zip?: string;
  };

  location: {
    type: "Point";
    coordinates: [number, number];
  };

  distanceMeters: number;
  voterCount: number;
  voters: Voter[];
};

type Props = {
  searchLocation: SearchLocation;
  searchLabel: string;
  addressGroups: AddressGroup[];
  routePath?: SearchLocation[];
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

function getAddressText(group: AddressGroup) {
  return [
    group.address.address_line1,
    group.address.address_line2,
    group.address.city,
    group.address.state,
    group.address.zip,
  ]
    .filter(Boolean)
    .join(", ");
}

function createAddressInfoContent(group: AddressGroup) {
  const container = document.createElement("div");

  container.style.minWidth = "280px";
  container.style.maxWidth = "360px";
  container.style.padding = "6px";

  const heading = document.createElement("div");
  heading.style.fontWeight = "700";
  heading.style.fontSize = "14px";
  heading.textContent = getAddressText(group);
  container.appendChild(heading);

  const count = document.createElement("div");
  count.style.marginTop = "4px";
  count.style.fontSize = "12px";
  count.style.color = "#6b7280";
  count.textContent = `${group.voterCount} ${
    group.voterCount === 1 ? "voter" : "voters"
  } at this address`;
  container.appendChild(count);

  group.voters.forEach((voter) => {
    const voterContainer = document.createElement("div");

    voterContainer.style.marginTop = "10px";
    voterContainer.style.paddingTop = "10px";
    voterContainer.style.borderTop = "1px solid #e5e7eb";

    const name = document.createElement("div");
    name.style.fontWeight = "600";
    name.style.fontSize = "13px";
    name.textContent = getVoterName(voter);
    voterContainer.appendChild(name);

    if (voter.contact?.phone_primary) {
      const phone = document.createElement("a");

      phone.href = `tel:${voter.contact.phone_primary}`;
      phone.textContent = `📞 ${voter.contact.phone_primary}`;
      phone.style.display = "block";
      phone.style.marginTop = "4px";
      phone.style.fontSize = "12px";
      phone.style.color = "#2563eb";

      voterContainer.appendChild(phone);
    }

    if (voter.contact?.phone_secondary) {
      const phone = document.createElement("a");

      phone.href = `tel:${voter.contact.phone_secondary}`;
      phone.textContent = `📞 ${voter.contact.phone_secondary}`;
      phone.style.display = "block";
      phone.style.marginTop = "3px";
      phone.style.fontSize = "12px";
      phone.style.color = "#2563eb";

      voterContainer.appendChild(phone);
    }

    if (voter.contact?.email) {
      const email = document.createElement("a");

      email.href = `mailto:${voter.contact.email}`;
      email.textContent = `✉️ ${voter.contact.email}`;
      email.style.display = "block";
      email.style.marginTop = "3px";
      email.style.fontSize = "12px";
      email.style.color = "#2563eb";
      email.style.wordBreak = "break-all";

      voterContainer.appendChild(email);
    }

    const labels: string[] = [];

    if (voter.flags?.super_voter) {
      labels.push("Super Voter");
    }

    if (voter.flags?.frequent_voter) {
      labels.push("Frequent Voter");
    }

    if (voter.flags?.srd2) {
      labels.push("District 2");
    }

    if (voter.registration?.party_abbr) {
      labels.push(voter.registration.party_abbr);
    }

    if (voter.precinct?.name) {
      labels.push(voter.precinct.name);
    }

    if (labels.length > 0) {
      const flags = document.createElement("div");

      flags.style.marginTop = "5px";
      flags.style.fontSize = "11px";
      flags.style.color = "#4b5563";
      flags.textContent = labels.join(" • ");

      voterContainer.appendChild(flags);
    }

    container.appendChild(voterContainer);
  });

  return container;
}

export default function NearestVotersMap({
  searchLocation,
  searchLabel,
  addressGroups,
  routePath = [],
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

      const [
        { Map, InfoWindow, Polyline },
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
      bounds.extend(searchLocation);

      let activeInfoWindow: any = null;

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
        title: searchLabel || "Start location",
        content: blueDot,
        zIndex: 1000,
        gmpClickable: true,
      });

      const searchInfoContent = document.createElement("div");
      searchInfoContent.style.padding = "6px";

      const searchInfoHeading = document.createElement("div");
      searchInfoHeading.style.fontWeight = "600";
      searchInfoHeading.textContent = "Start Location";
      searchInfoContent.appendChild(searchInfoHeading);

      if (searchLabel) {
        const searchInfoLabel = document.createElement("div");

        searchInfoLabel.style.marginTop = "5px";
        searchInfoLabel.style.fontSize = "13px";
        searchInfoLabel.textContent = searchLabel;

        searchInfoContent.appendChild(searchInfoLabel);
      }

      const searchInfo = new InfoWindow({
        content: searchInfoContent,
      });

      searchMarker.addEventListener("gmp-click", () => {
        if (activeInfoWindow) {
          activeInfoWindow.close();
        }

        activeInfoWindow = searchInfo;

        searchInfo.open({
          map,
          anchor: searchMarker,
        });
      });

      addressGroups.forEach((group) => {
        const coordinates = group.location?.coordinates;

        if (!coordinates || coordinates.length !== 2) {
          console.warn("Missing coordinates:", group.addressKey);
          return;
        }

        const [lngRaw, latRaw] = coordinates;

        const lat = Number(latRaw);
        const lng = Number(lngRaw);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          console.warn("Invalid coordinates:", group.addressKey, coordinates);
          return;
        }

        const position = {
          lat,
          lng,
        };

        bounds.extend(position);

        const address = getAddressText(group);

        const pin = new PinElement({
          glyphText: String(group.voterCount),
          scale: group.voterCount > 1 ? 1.2 : 1.05,
        });

        const marker = new AdvancedMarkerElement({
          map,
          position,
          title: `${group.voterCount} voter${
            group.voterCount === 1 ? "" : "s"
          } — ${address}`,
          content: pin,
          gmpClickable: true,
        });

        const infoWindow = new InfoWindow({
          content: createAddressInfoContent(group),
        });

        marker.addEventListener("gmp-click", () => {
          if (activeInfoWindow) {
            activeInfoWindow.close();
          }

          activeInfoWindow = infoWindow;

          infoWindow.open({
            map,
            anchor: marker,
          });
        });
      });

      if (routePath.length > 1) {
        new Polyline({
          map,
          path: routePath,
          geodesic: false,
          strokeColor: "#2563eb",
          strokeOpacity: 0.9,
          strokeWeight: 5,
        });

        routePath.forEach((point) => {
          bounds.extend(point);
        });
      }

      if (addressGroups.length > 0 || routePath.length > 1) {
        map.fitBounds(bounds, 60);
      }
    }

    void initializeMap();

    return () => {
      cancelled = true;
    };
  }, [searchLocation, searchLabel, addressGroups, routePath]);

  return (
    <div
      ref={mapRef}
      className="h-[520px] w-full overflow-hidden rounded-xl border bg-gray-100"
    />
  );
}
