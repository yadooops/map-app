// app/api/pois/route.ts
import { NextRequest, NextResponse } from "next/server";

const PHOTON_ENDPOINTS = [
  "https://photon.komoot.io/api/",
  "https://photon.komoot.de/api/",
];

type CacheEntry = { data: any; expires: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

const CATEGORY_QUERIES: Record<string, string> = {
  restaurant: "restaurant",
  cafe: "cafe",
  fast_food: "fast food",
  bar: "bar",
  fuel: "fuel",
  atm: "atm",
  bank: "bank",
  pharmacy: "pharmacy",
  hospital: "hospital",
  clinic: "clinic",
  hotel: "hotel",
  parking: "parking",
  school: "school",
  supermarket: "supermarket",
  mall: "mall",
  gym: "fitness",
  park: "park",
  mosque: "mosque",
  church: "church",
  police: "police",
};

export async function POST(req: NextRequest) {
  let category = "";
  let bounds: { south: number; west: number; north: number; east: number } | null = null;
  let limit = 200;

  try {
    const body = await req.json();
    category = body.category ?? "";
    bounds = body.bounds ?? null;
    limit = Math.min(250, Math.max(10, body.limit ?? 200));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!category) {
    return NextResponse.json({ error: "Missing category" }, { status: 400 });
  }

  const q = CATEGORY_QUERIES[category] ?? category;
  const cacheKey = `${q}|${bounds?.south}|${bounds?.west}|${bounds?.north}|${bounds?.east}|${limit}`;

  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > now) {
    return NextResponse.json(cached.data, { headers: { "X-Cache": "HIT" } });
  }

  const errors: string[] = [];

  const centerLat = bounds ? (bounds.south + bounds.north) / 2 : null;
  const centerLng = bounds ? (bounds.west + bounds.east) / 2 : null;

  for (const url of PHOTON_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const params = new URLSearchParams({ q, limit: String(limit) });
      if (centerLat !== null && centerLng !== null) {
        params.set("lat", String(centerLat));
        params.set("lon", String(centerLng));
      }

      const res = await fetch(`${url}?${params.toString()}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "PalterMap/1.0",
        },
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timer);

      if (!res.ok) {
        errors.push(`${url} → HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();

      const features = (data.features ?? []).filter((f: any) => {
        if (!f.geometry || f.geometry.type !== "Point") return false;
        const [lng, lat] = f.geometry.coordinates;
        if (typeof lng !== "number" || typeof lat !== "number") return false;
        if (bounds) {
          if (lat < bounds.south || lat > bounds.north || lng < bounds.west || lng > bounds.east) {
            return false;
          }
        }
        return true;
      });

      const result = {
        type: "FeatureCollection" as const,
        features: features.map((f: any) => ({
          type: "Feature" as const,
          properties: {
            name: f.properties?.name ?? f.properties?.street ?? category,
            category,
          },
          geometry: {
            type: "Point" as const,
            coordinates: f.geometry.coordinates,
          },
        })),
      };

      cache.set(cacheKey, { data: result, expires: now + CACHE_TTL_MS });
      if (cache.size > 200) {
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
      }

      return NextResponse.json(result, { headers: { "X-Cache": "MISS" } });
    } catch (e: any) {
      errors.push(`${url} → ${e?.message ?? "unknown"}`);
      continue;
    }
  }

  return NextResponse.json(
    { error: "All Photon mirrors failed", detail: errors.join(" | ") },
    { status: 502 }
  );
}