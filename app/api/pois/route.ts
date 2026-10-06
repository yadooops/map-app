// app/api/pois/route.ts
import { NextRequest, NextResponse } from "next/server";

// Multiple Overpass mirrors — tries each in order on failure
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];

export async function POST(req: NextRequest) {
  let query = "";
  try {
    const body = await req.json();
    query = body.query ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  let lastError = "";

  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);

      // URLSearchParams sets Content-Type: application/x-www-form-urlencoded
      // This avoids the 406 Not Acceptable response from Apache
      const formBody = new URLSearchParams();
      formBody.append("data", query);

      const res = await fetch(url, {
        method: "POST",
        body: formBody,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "MyMapsApp/1.0",
        },
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timer);

      if (!res.ok) {
        lastError = `${url} → HTTP ${res.status}`;
        continue;
      }

      const data = await res.json();
      return NextResponse.json(data);
    } catch (e: any) {
      lastError = `${url} → ${e?.message ?? "unknown error"}`;
      continue;
    }
  }

  return NextResponse.json(
    { error: "All Overpass mirrors failed", detail: lastError },
    { status: 502 }
  );
}