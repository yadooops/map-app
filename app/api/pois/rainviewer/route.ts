import { NextResponse } from "next/server";

let cached: { data: any; expires: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET() {
  const now = Date.now();
  if (cached && cached.expires > now) {
    return NextResponse.json(cached.data, {
      headers: { "X-Cache": "HIT" },
    });
  }

  try {
    const res = await fetch("https://api.rainviewer.com/public/weather-maps.json", {
      headers: { "User-Agent": "PalterMap/1.0" },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `RainViewer index failed: ${res.status}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    cached = { data, expires: now + CACHE_TTL_MS };
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } });
  } catch (e: any) {
    return NextResponse.json(
      { error: "RainViewer fetch failed", detail: e?.message ?? "unknown" },
      { status: 502 }
    );
  }
}