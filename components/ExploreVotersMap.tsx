"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import {
  MarkerClusterer,
  SuperClusterAlgorithm,
} from "@googlemaps/markerclusterer";
import { useEffect, useRef } from "react";

export type ExploreMapStats = {
  addressCount: number;
  voterCount: number;
  zoom: number;
};

type AddressSummary = {
  addressKey: string;
  voterIds?: string[];

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

  voterCount: number;
  superVoterCount: number;
  frequentVoterCount: number;
  district2Count: number;
};

type Voter = {
  _id: string;

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
    super_voter?: boolean;
    frequent_voter?: boolean;
    srd2?: boolean;
  };
};

type AddressDetails = {
  addressKey: string;
  voterCount: number;
  voters: Voter[];
};

type Props = {
  onStatsChange?: (stats: ExploreMapStats) => void;
  onLoadingChange?: (loading: boolean) => void;
  onError?: (message: string) => void;
};

const SAN_RAMON_CENTER = {
  lat: 37.7799,
  lng: -121.978,
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

function getAddressText(address: AddressSummary["address"]) {
  return [
    address.address_line1,
    address.address_line2,
    address.city,
    address.state,
    address.zip,
  ]
    .filter(Boolean)
    .join(", ");
}

function makeLoadingInfoContent(address: AddressSummary) {
  const container = document.createElement("div");
  container.style.minWidth = "250px";
  container.style.padding = "6px";

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.style.fontSize = "14px";
  title.textContent = getAddressText(address.address);
  container.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.style.marginTop = "5px";
  subtitle.style.fontSize = "12px";
  subtitle.style.color = "#6b7280";
  subtitle.textContent = `${address.voterCount} ${
    address.voterCount === 1 ? "voter" : "voters"
  } at this address`;
  container.appendChild(subtitle);

  const loading = document.createElement("div");
  loading.style.marginTop = "12px";
  loading.style.fontSize = "12px";
  loading.textContent = "Loading household details...";
  container.appendChild(loading);

  return container;
}

function makeAddressDetailsContent(
  address: AddressSummary,
  details: AddressDetails,
) {
  const container = document.createElement("div");

  container.style.minWidth = "280px";
  container.style.maxWidth = "380px";
  container.style.maxHeight = "420px";
  container.style.overflowY = "auto";
  container.style.padding = "6px";

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.style.fontSize = "14px";
  title.textContent = getAddressText(address.address);
  container.appendChild(title);

  const summary = document.createElement("div");
  summary.style.marginTop = "5px";
  summary.style.fontSize = "12px";
  summary.style.color = "#6b7280";
  summary.textContent = `${details.voterCount} ${
    details.voterCount === 1 ? "voter" : "voters"
  } at this address`;
  container.appendChild(summary);

  details.voters.forEach((voter) => {
    const voterSection = document.createElement("div");
    voterSection.style.marginTop = "10px";
    voterSection.style.paddingTop = "10px";
    voterSection.style.borderTop = "1px solid #e5e7eb";

    const name = document.createElement("div");
    name.style.fontWeight = "600";
    name.style.fontSize = "13px";
    name.textContent = getVoterName(voter);
    voterSection.appendChild(name);

    if (voter.contact?.phone_primary) {
      const phone = document.createElement("a");
      phone.href = `tel:${voter.contact.phone_primary}`;
      phone.textContent = `📞 ${voter.contact.phone_primary}`;
      phone.style.display = "block";
      phone.style.marginTop = "5px";
      phone.style.fontSize = "12px";
      phone.style.color = "#2563eb";
      voterSection.appendChild(phone);
    }

    if (voter.contact?.phone_secondary) {
      const phone = document.createElement("a");
      phone.href = `tel:${voter.contact.phone_secondary}`;
      phone.textContent = `📞 ${voter.contact.phone_secondary}`;
      phone.style.display = "block";
      phone.style.marginTop = "3px";
      phone.style.fontSize = "12px";
      phone.style.color = "#2563eb";
      voterSection.appendChild(phone);
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
      voterSection.appendChild(email);
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
      flags.style.marginTop = "6px";
      flags.style.fontSize = "11px";
      flags.style.color = "#4b5563";
      flags.textContent = labels.join(" • ");
      voterSection.appendChild(flags);
    }

    container.appendChild(voterSection);
  });

  const mapLink = document.createElement("a");
  mapLink.href =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(getAddressText(address.address));
  mapLink.target = "_blank";
  mapLink.rel = "noopener noreferrer";
  mapLink.textContent = "Open address in Google Maps";
  mapLink.style.display = "inline-block";
  mapLink.style.marginTop = "12px";
  mapLink.style.fontSize = "12px";
  mapLink.style.fontWeight = "600";
  mapLink.style.color = "#2563eb";
  container.appendChild(mapLink);

  return container;
}

export default function ExploreVotersMap({
  onStatsChange,
  onLoadingChange,
  onError,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  const mapRef = useRef<any>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const infoWindowRef = useRef<any>(null);
  const idleListenerRef = useRef<any>(null);

  const viewportRequestRef = useRef<AbortController | null>(null);
  const detailsRequestRef = useRef<AbortController | null>(null);

  /*
   * Cache household details for the lifetime of this Explore page.
   * Reopening the same address is then instant and does not hit Mongo again.
   */
  const householdCacheRef = useRef<Map<string, AddressDetails>>(new Map());

  const onStatsChangeRef = useRef(onStatsChange);
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onStatsChangeRef.current = onStatsChange;
  }, [onStatsChange]);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
  }, [onLoadingChange]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!mapContainerRef.current) {
      return;
    }

    let cancelled = false;

    async function initializeMap() {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

      if (!apiKey) {
        onErrorRef.current?.("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing");
        onLoadingChangeRef.current?.(false);
        return;
      }

      if (!googleMapsConfigured) {
        setOptions({
          key: apiKey,
          v: "weekly",
        });

        googleMapsConfigured = true;
      }

      /*
       * Keep direct importLibrary() usage so this remains consistent with your
       * existing map component and avoids explicit google.maps namespace types.
       */
      const [{ Map, InfoWindow }, { AdvancedMarkerElement, PinElement }] =
        await Promise.all([importLibrary("maps"), importLibrary("marker")]);

      if (cancelled || !mapContainerRef.current) {
        return;
      }

      const map = new Map(mapContainerRef.current, {
        center: SAN_RAMON_CENTER,
        zoom: 12,
        minZoom: 10,
        maxZoom: 21,
        mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID",
        streetViewControl: false,
        mapTypeControl: false,
      });

      mapRef.current = map;

      const infoWindow = new InfoWindow();
      infoWindowRef.current = infoWindow;

      /*
       * Custom cluster renderer.
       *
       * MarkerClusterer normally counts address markers. Instead, each address
       * marker carries __voterCount and the cluster bubble sums those values so
       * the cluster number means VOTERS, not ADDRESSES.
       */
      const voterCountRenderer = {
        render(cluster: any) {
          const markers = Array.isArray(cluster.markers) ? cluster.markers : [];

          const totalVoters = markers.reduce(
            (sum: number, marker: any) =>
              sum + Number(marker.__voterCount || 0),
            0,
          );

          const bubble = document.createElement("div");
          bubble.style.display = "flex";
          bubble.style.alignItems = "center";
          bubble.style.justifyContent = "center";
          bubble.style.width = totalVoters >= 100 ? "50px" : "44px";
          bubble.style.height = totalVoters >= 100 ? "50px" : "44px";
          bubble.style.borderRadius = "9999px";
          bubble.style.background = "#111827";
          bubble.style.border = "3px solid white";
          bubble.style.boxShadow = "0 2px 8px rgba(0,0,0,.28)";
          bubble.style.color = "white";
          bubble.style.fontWeight = "700";
          bubble.style.fontSize = totalVoters >= 1000 ? "10px" : "12px";
          bubble.textContent = String(totalVoters);

          const clusterMarker = new AdvancedMarkerElement({
            position: cluster.position,
            title: `${totalVoters} eligible voters`,
            content: bubble,
            zIndex: 1000 + totalVoters,
            gmpClickable: true,
          });

          return clusterMarker as any;
        },
      };

      const clusterer = new MarkerClusterer({
        map,
        markers: [],
        algorithm: new SuperClusterAlgorithm({
          maxZoom: 16,
          radius: 80,
        }),
        renderer: voterCountRenderer,
      });

      clustererRef.current = clusterer;

      async function openAddressDetails(marker: any, address: AddressSummary) {
        /*
         * Instant path for a household that has already been opened during
         * this page session.
         */
        const cached = householdCacheRef.current.get(address.addressKey);

        if (cached) {
          detailsRequestRef.current?.abort();

          infoWindow.setContent(makeAddressDetailsContent(address, cached));

          infoWindow.open({
            map,
            anchor: marker,
          });

          return;
        }

        detailsRequestRef.current?.abort();

        const controller = new AbortController();
        detailsRequestRef.current = controller;

        infoWindow.setContent(makeLoadingInfoContent(address));
        infoWindow.open({
          map,
          anchor: marker,
        });

        try {
          const response = await fetch("/api/address-voters", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              voterIds: Array.isArray(address.voterIds) ? address.voterIds : [],
              address: address.address,
            }),
            signal: controller.signal,
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Could not load household details");
          }

          if (controller.signal.aborted) {
            return;
          }

          const details = data as AddressDetails;

          householdCacheRef.current.set(address.addressKey, details);

          infoWindow.setContent(makeAddressDetailsContent(address, details));
        } catch (err: any) {
          if (err?.name === "AbortError") {
            return;
          }

          const errorContent = document.createElement("div");
          errorContent.style.padding = "8px";
          errorContent.style.fontSize = "12px";
          errorContent.style.color = "#b91c1c";
          errorContent.textContent =
            err?.message || "Could not load household details";
          infoWindow.setContent(errorContent);
        }
      }

      function renderAddressMarkers(addresses: AddressSummary[]) {
        const markers = addresses
          .map((address) => {
            const coordinates = address.location?.coordinates;

            if (!coordinates || coordinates.length !== 2) {
              return null;
            }

            const lng = Number(coordinates[0]);
            const lat = Number(coordinates[1]);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              return null;
            }

            const pin = new PinElement({
              glyphText: String(address.voterCount),
              scale: address.voterCount > 1 ? 1.15 : 1.0,
            });

            const marker = new AdvancedMarkerElement({
              position: {
                lat,
                lng,
              },
              title: `${address.voterCount} ${
                address.voterCount === 1 ? "voter" : "voters"
              } — ${getAddressText(address.address)}`,
              content: pin,
              gmpClickable: true,
            });

            /*
             * Custom metadata consumed by the cluster renderer.
             */
            (marker as any).__voterCount = address.voterCount;
            (marker as any).__addressKey = address.addressKey;

            marker.addEventListener("gmp-click", () => {
              void openAddressDetails(marker, address);
            });

            return marker;
          })
          .filter(Boolean) as any[];

        clusterer.clearMarkers(true);
        clusterer.addMarkers(markers, true);
        clusterer.render();
      }

      async function loadVisibleArea() {
        const bounds = map.getBounds();

        if (!bounds) {
          return;
        }

        const northEast = bounds.getNorthEast();
        const southWest = bounds.getSouthWest();
        const zoom = Number(map.getZoom() ?? 12);

        viewportRequestRef.current?.abort();

        const controller = new AbortController();
        viewportRequestRef.current = controller;

        onLoadingChangeRef.current?.(true);
        onErrorRef.current?.("");

        try {
          const response = await fetch("/api/map-voters", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              north: northEast.lat(),
              east: northEast.lng(),
              south: southWest.lat(),
              west: southWest.lng(),
              zoom,
            }),
            signal: controller.signal,
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Could not load visible voters");
          }

          if (controller.signal.aborted) {
            return;
          }

          const addresses: AddressSummary[] = Array.isArray(data.addresses)
            ? data.addresses
            : [];

          infoWindow.close();
          detailsRequestRef.current?.abort();

          renderAddressMarkers(addresses);

          onStatsChangeRef.current?.({
            addressCount: Number(data.addressCount || 0),
            voterCount: Number(data.voterCount || 0),
            zoom,
          });
        } catch (err: any) {
          if (err?.name === "AbortError") {
            return;
          }

          onErrorRef.current?.(
            err?.message || "Could not load voters for this map area",
          );
        } finally {
          if (!controller.signal.aborted) {
            onLoadingChangeRef.current?.(false);
          }
        }
      }

      /*
       * idle fires after pan/zoom settles, which avoids querying while the user
       * is continuously dragging the map.
       */
      idleListenerRef.current = map.addListener("idle", () => {
        void loadVisibleArea();
      });
    }

    void initializeMap();

    return () => {
      cancelled = true;

      viewportRequestRef.current?.abort();
      detailsRequestRef.current?.abort();

      if (idleListenerRef.current) {
        idleListenerRef.current.remove();
        idleListenerRef.current = null;
      }

      if (clustererRef.current) {
        clustererRef.current.clearMarkers();
        (clustererRef.current as any).setMap(null);
        clustererRef.current = null;
      }

      if (infoWindowRef.current) {
        infoWindowRef.current.close();
        infoWindowRef.current = null;
      }

      mapRef.current = null;
    };
  }, []);

  return (
    <div
      ref={mapContainerRef}
      className="h-[72vh] min-h-[560px] w-full overflow-hidden rounded-2xl border bg-gray-100 shadow-sm"
    />
  );
}
