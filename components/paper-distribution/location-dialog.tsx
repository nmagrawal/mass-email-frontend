"use client";

import { useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { PlaceSearch, fetchPlaceDetails } from "./place-search";
import {
  STATUS_STYLES,
  WEEKDAY_LABELS,
  postJson,
  readJson,
  type City,
  type DropLocation,
  type PlaceDetails,
} from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  city: City;
  /* null → add a new location */
  location: DropLocation | null;
  areas: string[];
  onSaved: (location: DropLocation, note?: string) => void;
  onShowExisting: (location: DropLocation) => void;
};

type Form = {
  label: string;
  area: string;
  defaultQuantity: string;
  instructions: string;
  contactName: string;
  contactPhone: string;
  days: string[];
  hours: string;
  status: "active" | "paused" | "inactive";
};

const EMPTY_FORM: Form = {
  label: "",
  area: "",
  defaultQuantity: "10",
  instructions: "",
  contactName: "",
  contactPhone: "",
  days: [],
  hours: "",
  status: "active",
};

function formFromLocation(loc: DropLocation): Form {
  return {
    label: loc.label,
    area: loc.area,
    defaultQuantity: String(loc.defaultQuantity),
    instructions: loc.instructions,
    contactName: loc.contact?.name || "",
    contactPhone: loc.contact?.phone || "",
    days: (loc.availability?.days as string[]) || [],
    hours: loc.availability?.hours || "",
    status: loc.status,
  };
}

export function LocationDialog({
  open,
  onOpenChange,
  city,
  location,
  areas,
  onSaved,
  onShowExisting,
}: Props) {
  const isEdit = Boolean(location);
  const [place, setPlace] = useState<PlaceDetails | null>(null);
  const [duplicates, setDuplicates] = useState<DropLocation[]>([]);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [loadingPlace, setLoadingPlace] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPlace(null);
    setDuplicates([]);
    setError("");
    setConfirmDuplicate(false);
    setForm(location ? formFromLocation(location) : EMPTY_FORM);
  }, [open, location]);

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handlePick(placeId: string, sessionToken: string) {
    setLoadingPlace(true);
    setError("");
    setConfirmDuplicate(false);
    try {
      const data = await fetchPlaceDetails(placeId, sessionToken, city.id);
      setPlace(data.place);
      setDuplicates(data.duplicates);
      setForm((f) => ({ ...f, label: f.label || data.place.name }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingPlace(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const fields = {
      label: form.label,
      area: form.area,
      defaultQuantity: Number(form.defaultQuantity || 0),
      instructions: form.instructions,
      contact: { name: form.contactName, phone: form.contactPhone },
      availability: { days: form.days, hours: form.hours },
      status: form.status,
    };

    try {
      if (location) {
        const data = await readJson<{ location: DropLocation; usedInRoutes: string[] }>(
          await postJson(`/api/paper/locations/${location.id}`, fields, "PATCH"),
        );
        onSaved(
          data.location,
          data.usedInRoutes.length
            ? `Still a stop in saved route${data.usedInRoutes.length > 1 ? "s" : ""}: ${data.usedInRoutes.join(", ")}`
            : undefined,
        );
      } else {
        if (!place) throw new Error("Search and pick a place first");
        const data = await readJson<{ location: DropLocation }>(
          await postJson("/api/paper/locations", {
            cityId: city.id,
            place,
            ...fields,
            confirmDuplicate,
          }),
        );
        onSaved(data.location);
      }
      onOpenChange(false);
    } catch (err: any) {
      if (err.data?.code === "duplicate") setConfirmDuplicate(false);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const needsDuplicateConfirm = !isEdit && duplicates.length > 0 && !confirmDuplicate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit drop location" : `Add drop location · ${city.name}`}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? location!.address
              : "Search Google for the business or address, check it, then add delivery details."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <PlaceSearch
                bias={city.center}
                autoFocus
                onSelect={(s, token) => handlePick(s.placeId, token)}
              />
              {loadingPlace && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Looking up place…
                </div>
              )}
              {place && (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <div className="font-medium">{place.name}</div>
                  <div className="text-xs text-muted-foreground">{place.formattedAddress}</div>
                  {place.city && city.name && place.city.toLowerCase() !== city.name.toLowerCase() && (
                    <div className="mt-1 text-xs text-amber-700">
                      Google lists this in {place.city}, not {city.name}.
                    </div>
                  )}
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}&query_place_id=${place.placeId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-primary underline"
                  >
                    Check position on Google Maps
                  </a>
                </div>
              )}

              {duplicates.length > 0 && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <div className="flex items-center gap-2 font-medium">
                    <TriangleAlert className="h-4 w-4" /> Possible duplicate
                    {duplicates.length > 1 ? "s" : ""} already in {city.name}
                  </div>
                  <ul className="space-y-1">
                    {duplicates.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {d.label} <span className="text-xs text-amber-800">· {d.address}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <span className={cn("rounded-full px-2 py-0.5 text-xs", STATUS_STYLES[d.status])}>
                            {d.status}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              onOpenChange(false);
                              onShowExisting(d);
                            }}
                          >
                            {d.status === "inactive" ? "Reactivate" : "Open"}
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={confirmDuplicate}
                      onChange={(e) => setConfirmDuplicate(e.target.checked)}
                    />
                    This is a different drop location — add it anyway
                  </label>
                </div>
              )}
            </div>
          )}

          {(isEdit || place) && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Location label">
                  <Input value={form.label} onChange={(e) => update("label", e.target.value)} required maxLength={120} />
                </Field>
                <Field label="Area">
                  <Input
                    value={form.area}
                    onChange={(e) => update("area", e.target.value)}
                    list="paper-areas"
                    placeholder="e.g. Downtown"
                    maxLength={80}
                  />
                  <datalist id="paper-areas">
                    {areas.map((a) => (
                      <option key={a} value={a} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Default quantity">
                  <Input
                    type="number"
                    min={0}
                    max={10000}
                    inputMode="numeric"
                    value={form.defaultQuantity}
                    onChange={(e) => update("defaultQuantity", e.target.value)}
                  />
                </Field>
                <Field label="Status">
                  <select
                    value={form.status}
                    onChange={(e) => update("status", e.target.value as Form["status"])}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Temporarily paused</option>
                    <option value="inactive">Inactive (removed)</option>
                  </select>
                </Field>
              </div>

              <Field label="Delivery instructions">
                <Textarea
                  value={form.instructions}
                  onChange={(e) => update("instructions", e.target.value)}
                  placeholder="Entrance, counter, rack, parking…"
                  rows={3}
                  maxLength={1000}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Contact name (optional)">
                  <Input value={form.contactName} onChange={(e) => update("contactName", e.target.value)} maxLength={120} />
                </Field>
                <Field label="Contact phone (optional)">
                  <Input
                    type="tel"
                    value={form.contactPhone}
                    onChange={(e) => update("contactPhone", e.target.value)}
                    maxLength={40}
                  />
                </Field>
              </div>

              <Field label="Delivery days">
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_LABELS.map((d) => {
                    const on = form.days.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() =>
                          update("days", on ? form.days.filter((x) => x !== d.value) : [...form.days, d.value])
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium",
                          on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
                        )}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Receiving hours">
                <Input
                  value={form.hours}
                  onChange={(e) => update("hours", e.target.value)}
                  placeholder="e.g. 6am–11am"
                  maxLength={120}
                />
              </Field>
            </>
          )}

          {error && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || (!isEdit && !place) || needsDuplicateConfirm}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Save changes" : "Add location"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}
