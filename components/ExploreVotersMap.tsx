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

type InteractionUser = {
  clerkUserId: string;
  name: string;
};

type VoterInteraction = {
  visited: boolean;
  contacted: {
    phone: boolean;
    email: boolean;
  };
  notes: string;
  createdBy?: InteractionUser | null;
  createdAt?: string | null;
  updatedBy?: InteractionUser | null;
  updatedAt?: string | null;
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

  interaction?: VoterInteraction;
};

type AddressDetails = {
  addressKey?: string;
  voterCount: number;
  voters: Voter[];
};

type InteractionInput = {
  visited: boolean;
  contactedPhone: boolean;
  contactedEmail: boolean;
  notes: string;
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

function normalizeInteraction(voter: Voter): VoterInteraction {
  return {
    visited: voter.interaction?.visited ?? false,
    contacted: {
      phone: voter.interaction?.contacted?.phone ?? false,
      email: voter.interaction?.contacted?.email ?? false,
    },
    notes: voter.interaction?.notes ?? "",
    createdBy: voter.interaction?.createdBy ?? null,
    createdAt: voter.interaction?.createdAt ?? null,
    updatedBy: voter.interaction?.updatedBy ?? null,
    updatedAt: voter.interaction?.updatedAt ?? null,
  };
}

function formatUpdatedAt(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function interactionSummary(interaction: VoterInteraction) {
  const labels: string[] = [];

  if (interaction.visited) {
    labels.push("Visited");
  }

  if (interaction.contacted.phone) {
    labels.push("Phone contacted");
  }

  if (interaction.contacted.email) {
    labels.push("Email contacted");
  }

  if (interaction.notes.trim()) {
    labels.push("Notes saved");
  }

  return labels.length > 0 ? labels.join(" • ") : "No activity recorded";
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
  saveInteraction: (
    voterId: string,
    input: InteractionInput,
  ) => Promise<VoterInteraction>,
) {
  const container = document.createElement("div");

  container.style.minWidth = "310px";
  container.style.maxWidth = "430px";
  container.style.maxHeight = "520px";
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
    let currentInteraction = normalizeInteraction(voter);

    const voterCard = document.createElement("div");
    voterCard.style.marginTop = "10px";
    voterCard.style.border = "1px solid #e5e7eb";
    voterCard.style.borderRadius = "10px";
    voterCard.style.overflow = "hidden";
    voterCard.style.background = "#ffffff";

    /*
     * Clickable collapsed voter card header.
     */
    const header = document.createElement("button");
    header.type = "button";
    header.style.display = "block";
    header.style.width = "100%";
    header.style.padding = "10px";
    header.style.border = "0";
    header.style.background = "transparent";
    header.style.textAlign = "left";
    header.style.cursor = "pointer";

    const headerTop = document.createElement("div");
    headerTop.style.display = "flex";
    headerTop.style.alignItems = "center";
    headerTop.style.justifyContent = "space-between";
    headerTop.style.gap = "10px";

    const name = document.createElement("div");
    name.style.fontWeight = "600";
    name.style.fontSize = "13px";
    name.textContent = getVoterName(voter);
    headerTop.appendChild(name);

    const chevron = document.createElement("span");
    chevron.style.fontSize = "12px";
    chevron.style.color = "#6b7280";
    chevron.textContent = "▸";
    headerTop.appendChild(chevron);

    header.appendChild(headerTop);

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
      const meta = document.createElement("div");
      meta.style.marginTop = "4px";
      meta.style.fontSize = "11px";
      meta.style.color = "#6b7280";
      meta.textContent = labels.join(" • ");
      header.appendChild(meta);
    }

    const activitySummary = document.createElement("div");
    activitySummary.style.marginTop = "5px";
    activitySummary.style.fontSize = "11px";
    activitySummary.style.fontWeight = "600";
    activitySummary.style.color = "#2563eb";
    activitySummary.textContent = interactionSummary(currentInteraction);
    header.appendChild(activitySummary);

    voterCard.appendChild(header);

    /*
     * Expanded voter activity form.
     */
    const body = document.createElement("div");
    body.style.display = "none";
    body.style.padding = "0 10px 12px 10px";
    body.style.borderTop = "1px solid #f3f4f6";

    const contactSection = document.createElement("div");
    contactSection.style.paddingTop = "10px";

    if (voter.contact?.phone_primary) {
      const phone = document.createElement("a");
      phone.href = `tel:${voter.contact.phone_primary}`;
      phone.textContent = `📞 ${voter.contact.phone_primary}`;
      phone.style.display = "block";
      phone.style.fontSize = "12px";
      phone.style.color = "#2563eb";
      phone.style.marginBottom = "4px";
      contactSection.appendChild(phone);
    }

    if (voter.contact?.phone_secondary) {
      const phone = document.createElement("a");
      phone.href = `tel:${voter.contact.phone_secondary}`;
      phone.textContent = `📞 ${voter.contact.phone_secondary}`;
      phone.style.display = "block";
      phone.style.fontSize = "12px";
      phone.style.color = "#2563eb";
      phone.style.marginBottom = "4px";
      contactSection.appendChild(phone);
    }

    if (voter.contact?.email) {
      const email = document.createElement("a");
      email.href = `mailto:${voter.contact.email}`;
      email.textContent = `✉️ ${voter.contact.email}`;
      email.style.display = "block";
      email.style.fontSize = "12px";
      email.style.color = "#2563eb";
      email.style.wordBreak = "break-all";
      contactSection.appendChild(email);
    }

    if (contactSection.childNodes.length > 0) {
      body.appendChild(contactSection);
    }

    const form = document.createElement("div");
    form.style.marginTop = "10px";
    form.style.paddingTop = "10px";
    form.style.borderTop = "1px solid #e5e7eb";

    const visitedLabel = document.createElement("label");
    visitedLabel.style.display = "flex";
    visitedLabel.style.alignItems = "center";
    visitedLabel.style.gap = "8px";
    visitedLabel.style.fontSize = "12px";
    visitedLabel.style.fontWeight = "600";
    visitedLabel.style.cursor = "pointer";

    const visitedCheckbox = document.createElement("input");
    visitedCheckbox.type = "checkbox";
    visitedCheckbox.checked = currentInteraction.visited;
    visitedLabel.appendChild(visitedCheckbox);
    visitedLabel.appendChild(document.createTextNode("Visited"));
    form.appendChild(visitedLabel);

    const contactedHeading = document.createElement("div");
    contactedHeading.style.marginTop = "10px";
    contactedHeading.style.marginBottom = "5px";
    contactedHeading.style.fontSize = "11px";
    contactedHeading.style.fontWeight = "700";
    contactedHeading.style.color = "#4b5563";
    contactedHeading.textContent = "Contacted";
    form.appendChild(contactedHeading);

    const phoneContactLabel = document.createElement("label");
    phoneContactLabel.style.display = "flex";
    phoneContactLabel.style.alignItems = "center";
    phoneContactLabel.style.gap = "8px";
    phoneContactLabel.style.fontSize = "12px";
    phoneContactLabel.style.cursor = "pointer";

    const phoneContactCheckbox = document.createElement("input");
    phoneContactCheckbox.type = "checkbox";
    phoneContactCheckbox.checked = currentInteraction.contacted.phone;
    phoneContactLabel.appendChild(phoneContactCheckbox);
    phoneContactLabel.appendChild(document.createTextNode("Phone"));
    form.appendChild(phoneContactLabel);

    const emailContactLabel = document.createElement("label");
    emailContactLabel.style.display = "flex";
    emailContactLabel.style.alignItems = "center";
    emailContactLabel.style.gap = "8px";
    emailContactLabel.style.marginTop = "5px";
    emailContactLabel.style.fontSize = "12px";
    emailContactLabel.style.cursor = "pointer";

    const emailContactCheckbox = document.createElement("input");
    emailContactCheckbox.type = "checkbox";
    emailContactCheckbox.checked = currentInteraction.contacted.email;
    emailContactLabel.appendChild(emailContactCheckbox);
    emailContactLabel.appendChild(document.createTextNode("Email"));
    form.appendChild(emailContactLabel);

    const notesLabel = document.createElement("label");
    notesLabel.style.display = "block";
    notesLabel.style.marginTop = "10px";
    notesLabel.style.marginBottom = "5px";
    notesLabel.style.fontSize = "11px";
    notesLabel.style.fontWeight = "700";
    notesLabel.style.color = "#4b5563";
    notesLabel.textContent = "Additional notes";
    form.appendChild(notesLabel);

    const notes = document.createElement("textarea");
    notes.value = currentInteraction.notes;
    notes.maxLength = 5000;
    notes.rows = 3;
    notes.placeholder = "Add notes...";
    notes.style.display = "block";
    notes.style.width = "100%";
    notes.style.boxSizing = "border-box";
    notes.style.resize = "vertical";
    notes.style.border = "1px solid #d1d5db";
    notes.style.borderRadius = "7px";
    notes.style.padding = "8px";
    notes.style.fontSize = "12px";
    notes.style.fontFamily = "inherit";
    form.appendChild(notes);

    const saveRow = document.createElement("div");
    saveRow.style.display = "flex";
    saveRow.style.alignItems = "center";
    saveRow.style.justifyContent = "space-between";
    saveRow.style.gap = "10px";
    saveRow.style.marginTop = "10px";

    const saveStatus = document.createElement("div");
    saveStatus.style.fontSize = "11px";
    saveStatus.style.color = "#6b7280";

    function updateAuditText() {
      const updatedBy = currentInteraction.updatedBy?.name;
      const updatedAt = formatUpdatedAt(currentInteraction.updatedAt);

      if (updatedBy && updatedAt) {
        saveStatus.textContent = `Updated by ${updatedBy} • ${updatedAt}`;
      } else if (updatedBy) {
        saveStatus.textContent = `Updated by ${updatedBy}`;
      } else if (updatedAt) {
        saveStatus.textContent = `Updated ${updatedAt}`;
      } else {
        saveStatus.textContent = "";
      }
    }

    updateAuditText();

    saveRow.appendChild(saveStatus);

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.style.border = "0";
    saveButton.style.borderRadius = "7px";
    saveButton.style.background = "#111827";
    saveButton.style.color = "white";
    saveButton.style.padding = "7px 12px";
    saveButton.style.fontSize = "12px";
    saveButton.style.fontWeight = "600";
    saveButton.style.cursor = "pointer";
    saveRow.appendChild(saveButton);

    form.appendChild(saveRow);
    body.appendChild(form);
    voterCard.appendChild(body);

    let expanded = false;

    header.addEventListener("click", () => {
      expanded = !expanded;
      body.style.display = expanded ? "block" : "none";
      chevron.textContent = expanded ? "▾" : "▸";
    });

    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      saveButton.style.opacity = "0.6";
      saveButton.style.cursor = "not-allowed";
      saveButton.textContent = "Saving...";
      saveStatus.style.color = "#6b7280";
      saveStatus.textContent = "";

      try {
        const savedInteraction = await saveInteraction(voter._id, {
          visited: visitedCheckbox.checked,
          contactedPhone: phoneContactCheckbox.checked,
          contactedEmail: emailContactCheckbox.checked,
          notes: notes.value,
        });

        currentInteraction = savedInteraction;
        voter.interaction = savedInteraction;

        visitedCheckbox.checked = savedInteraction.visited;
        phoneContactCheckbox.checked = savedInteraction.contacted.phone;
        emailContactCheckbox.checked = savedInteraction.contacted.email;
        notes.value = savedInteraction.notes;

        activitySummary.textContent = interactionSummary(savedInteraction);
        saveStatus.style.color = "#15803d";
        updateAuditText();
      } catch (err: any) {
        saveStatus.style.color = "#b91c1c";
        saveStatus.textContent = err?.message || "Could not save";
      } finally {
        saveButton.disabled = false;
        saveButton.style.opacity = "1";
        saveButton.style.cursor = "pointer";
        saveButton.textContent = "Save";
      }
    });

    container.appendChild(voterCard);
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
   * Shared interaction state can be changed by another signed-in user.
   * Keep a short cache for speed, but refresh household details after 15 sec.
   */
  const HOUSEHOLD_CACHE_TTL_MS = 15_000;

  const householdCacheRef = useRef<
    Map<string, { details: AddressDetails; fetchedAt: number }>
  >(new Map());

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

          return new AdvancedMarkerElement({
            position: cluster.position,
            title: `${totalVoters} eligible voters`,
            content: bubble,
            zIndex: 1000 + totalVoters,
            gmpClickable: true,
          }) as any;
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

      async function saveVoterInteraction(
        address: AddressSummary,
        voterId: string,
        input: InteractionInput,
      ): Promise<VoterInteraction> {
        const response = await fetch("/api/voter-interactions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            voterId,
            addressKey: address.addressKey,
            visited: input.visited,
            contactedPhone: input.contactedPhone,
            contactedEmail: input.contactedEmail,
            notes: input.notes,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Could not save voter activity");
        }

        const interaction: VoterInteraction = {
          visited: data.interaction?.visited === true,
          contacted: {
            phone: data.interaction?.contacted?.phone === true,
            email: data.interaction?.contacted?.email === true,
          },
          notes:
            typeof data.interaction?.notes === "string"
              ? data.interaction.notes
              : "",
          createdBy:
            data.interaction?.createdBy &&
            typeof data.interaction.createdBy.name === "string"
              ? data.interaction.createdBy
              : null,
          createdAt:
            typeof data.interaction?.createdAt === "string"
              ? data.interaction.createdAt
              : null,
          updatedBy:
            data.interaction?.updatedBy &&
            typeof data.interaction.updatedBy.name === "string"
              ? data.interaction.updatedBy
              : null,
          updatedAt:
            typeof data.interaction?.updatedAt === "string"
              ? data.interaction.updatedAt
              : null,
        };

        const cached = householdCacheRef.current.get(address.addressKey);

        if (cached) {
          const cachedVoter = cached.details.voters.find(
            (voter) => voter._id === voterId,
          );

          if (cachedVoter) {
            cachedVoter.interaction = interaction;
            cached.fetchedAt = Date.now();
          }
        }

        return interaction;
      }

      async function openAddressDetails(marker: any, address: AddressSummary) {
        const cached = householdCacheRef.current.get(address.addressKey);
        const cacheIsFresh =
          cached && Date.now() - cached.fetchedAt < HOUSEHOLD_CACHE_TTL_MS;

        if (cached && cacheIsFresh) {
          detailsRequestRef.current?.abort();

          infoWindow.setContent(
            makeAddressDetailsContent(
              address,
              cached.details,
              (voterId, input) => saveVoterInteraction(address, voterId, input),
            ),
          );

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
              addressKey: address.addressKey,
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

          householdCacheRef.current.set(address.addressKey, {
            details,
            fetchedAt: Date.now(),
          });

          infoWindow.setContent(
            makeAddressDetailsContent(address, details, (voterId, input) =>
              saveVoterInteraction(address, voterId, input),
            ),
          );
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
