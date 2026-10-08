// app/page.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import MaplibreGeocoder from "@maplibre/maplibre-gl-geocoder";
import "@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css";

// ===========================================================================
// COORDINATE CONVENTIONS
// MapLibre API:      [lng, lat]
// GeoJSON:           [lng, lat]
// Nominatim JSON:    { lat: string, lon: string }  -> parseFloat both
// Photon GeoJSON:    coordinates = [lng, lat]
// OSRM URL:          /route/v1/.../{lng},{lat};{lng},{lat}
// Open-Meteo:        { latitude, longitude } — max ~64 coords per request
// GPS API:           { latitude, longitude } -> convert to [lng, lat]
// ===========================================================================

const MAPTILER_KEY = "TYASrHzRBDUEA63XTMiR";

const STYLES: Record<string, { url: string; label: string }> = {
  Liberty:  { url: "https://tiles.openfreemap.org/styles/liberty",  label: "Liberty" },
  Positron: { url: "https://tiles.openfreemap.org/styles/positron", label: "Positron" },
  Bright:   { url: "https://tiles.openfreemap.org/styles/bright",   label: "Bright" },
  Dark:     { url: "https://tiles.openfreemap.org/styles/dark",     label: "Dark" },
};

const ESRI_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const MAPTILER_S2_TILES =
  `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`;

const POI_CATEGORIES = [
  { id: "restaurant",  label: "Restaurants", icon: "🍽️", color: "#f97316" },
  { id: "cafe",        label: "Cafes",       icon: "☕", color: "#a16207" },
  { id: "fast_food",   label: "Fast Food",   icon: "🍔", color: "#ef4444" },
  { id: "bar",         label: "Bars",        icon: "🍺", color: "#b45309" },
  { id: "fuel",        label: "Fuel",        icon: "⛽", color: "#0ea5e9" },
  { id: "atm",         label: "ATMs",        icon: "🏧", color: "#22c55e" },
  { id: "bank",        label: "Banks",       icon: "🏦", color: "#0891b2" },
  { id: "pharmacy",    label: "Pharmacies",  icon: "💊", color: "#14b8a6" },
  { id: "hospital",    label: "Hospitals",   icon: "🏥", color: "#dc2626" },
  { id: "clinic",      label: "Clinics",     icon: "🩺", color: "#ef4444" },
  { id: "hotel",       label: "Hotels",      icon: "🏨", color: "#8b5cf6" },
  { id: "parking",     label: "Parking",     icon: "🅿️", color: "#475569" },
  { id: "school",      label: "Schools",     icon: "🏫", color: "#7c3aed" },
  { id: "supermarket", label: "Markets",     icon: "🛒", color: "#16a34a" },
  { id: "mall",        label: "Malls",       icon: "🏬", color: "#db2777" },
  { id: "gym",         label: "Gyms",        icon: "🏋️", color: "#ea580c" },
  { id: "park",        label: "Parks",       icon: "🌳", color: "#22c55e" },
  { id: "mosque",      label: "Mosques",     icon: "🕌", color: "#059669" },
  { id: "church",      label: "Churches",    icon: "⛪", color: "#7c3aed" },
  { id: "police",      label: "Police",      icon: "🚓", color: "#1d4ed8" },
];

type WeatherLayerDef = {
  id: string;
  label: string;
  icon: string;
  dataField: string;
  colorLow: string;
  colorHigh: string;
  minValue: number;
  maxValue: number;
  legend: { stops: { at: number; color: string; label: string }[]; unit: string };
};

const WEATHER_LAYERS: WeatherLayerDef[] = [
  {
    id: "temp",
    label: "Temperature",
    icon: "🌡️",
    dataField: "temperature_2m",
    colorLow: "#3b82f6",
    colorHigh: "#ef4444",
    minValue: -10,
    maxValue: 45,
    legend: {
      unit: "°C",
      stops: [
        { at: -10, color: "#3b82f6", label: "-10" },
        { at: 0,   color: "#22d3ee", label: "0" },
        { at: 15,  color: "#22c55e", label: "15" },
        { at: 25,  color: "#eab308", label: "25" },
        { at: 35,  color: "#f97316", label: "35" },
        { at: 45,  color: "#ef4444", label: "45" },
      ],
    },
  },
  {
    id: "wind",
    label: "Wind",
    icon: "💨",
    dataField: "wind_speed_10m",
    colorLow: "#e0f2fe",
    colorHigh: "#0c4a6e",
    minValue: 0,
    maxValue: 40,
    legend: {
      unit: "km/h",
      stops: [
        { at: 0,  color: "#e0f2fe", label: "0" },
        { at: 10, color: "#7dd3fc", label: "10" },
        { at: 20, color: "#3b82f6", label: "20" },
        { at: 30, color: "#8b5cf6", label: "30" },
        { at: 40, color: "#0c4a6e", label: "40+" },
      ],
    },
  },
  {
    id: "clouds",
    label: "Clouds",
    icon: "☁️",
    dataField: "cloud_cover",
    colorLow: "#0f172a",
    colorHigh: "#f1f5f9",
    minValue: 0,
    maxValue: 100,
    legend: {
      unit: "%",
      stops: [
        { at: 0,   color: "#0f172a", label: "0" },
        { at: 50,  color: "#64748b", label: "50" },
        { at: 100, color: "#f1f5f9", label: "100" },
      ],
    },
  },
  {
    id: "pressure",
    label: "Pressure",
    icon: "📊",
    dataField: "pressure_msl",
    colorLow: "#7c3aed",
    colorHigh: "#ef4444",
    minValue: 970,
    maxValue: 1050,
    legend: {
      unit: "hPa",
      stops: [
        { at: 970,  color: "#7c3aed", label: "970" },
        { at: 1000, color: "#3b82f6", label: "1000" },
        { at: 1013, color: "#22c55e", label: "1013" },
        { at: 1030, color: "#eab308", label: "1030" },
        { at: 1050, color: "#ef4444", label: "1050+" },
      ],
    },
  },
  {
    id: "humidity",
    label: "Humidity",
    icon: "💧",
    dataField: "relative_humidity_2m",
    colorLow: "#fef3c7",
    colorHigh: "#0369a1",
    minValue: 0,
    maxValue: 100,
    legend: {
      unit: "%",
      stops: [
        { at: 0,   color: "#fef3c7", label: "0" },
        { at: 40,  color: "#7dd3fc", label: "40" },
        { at: 70,  color: "#0ea5e9", label: "70" },
        { at: 100, color: "#0369a1", label: "100" },
      ],
    },
  },
];

type BasemapMode = "vector" | "satellite-esri" | "satellite-s2";
type MeasureMode = "distance" | "area";

type LngLat = { lng: number; lat: number };
type Coord = [number, number];

type RouteStep = {
  distance: number;
  duration: number;
  name: string;
  maneuver: { type: string; modifier?: string; location: Coord };
};

type Favorite = {
  id: string;
  name: string;
  center: Coord;
  zoom: number;
  bearing: number;
  pitch: number;
  basemap: BasemapMode;
  style: string;
  createdAt: number;
};

type WeatherPoint = {
  lng: number;
  lat: number;
  temperature: number;
  windSpeed: number;
  windDirection: number;
  precipitation: number;
  cloudCover: number;
  humidity: number;
  pressure: number;
  code: number;
};

type RainFrame = { path: string; time: number };

const FAV_KEY = "mymaps:favorites";

function loadFavorites(): Favorite[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFavorites(list: Favorite[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(list));
  } catch {}
}

function haversine(a: Coord, b: Coord): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function polygonArea(coords: Coord[]): number {
  if (coords.length < 3) return 0;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 0; i < coords.length; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[(i + 1) % coords.length];
    total +=
      toRad(lon2 - lon1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return Math.abs((total * R * R) / 2);
}

function formatDistance(m: number) {
  if (m < 1000) return `${m.toFixed(0)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

function formatArea(m2: number) {
  if (m2 < 10000) return `${m2.toFixed(0)} m²`;
  if (m2 < 1_000_000) return `${(m2 / 10000).toFixed(2)} ha`;
  return `${(m2 / 1_000_000).toFixed(2)} km²`;
}

function formatDuration(s: number) {
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function stepIcon(step: RouteStep) {
  const { type, modifier } = step.maneuver;
  if (type === "arrive") return "🏁";
  if (type === "depart") return "▶";
  if (modifier?.includes("left")) return "↰";
  if (modifier?.includes("right")) return "↱";
  if (type === "roundabout" || type === "rotary") return "⟳";
  if (modifier === "uturn") return "↺";
  if (modifier === "straight") return "↑";
  return "→";
}

function weatherCodeLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95 && code <= 99) return "Thunderstorm";
  return "Unknown";
}

function windDirectionLabel(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function PalterLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="palterGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#palterGrad)" />
      <path
        d="M20 44V20h9.5c4.5 0 7.5 3 7.5 7.5S34 35 29.5 35H26v9h-6z"
        fill="white"
      />
      <circle cx="44" cy="22" r="3.5" fill="white" />
      <circle cx="44" cy="34" r="3.5" fill="white" />
      <circle cx="44" cy="46" r="3.5" fill="white" />
    </svg>
  );
}

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const basemapRef = useRef<BasemapMode>("vector");
  const userMarkerRef = useRef<any>(null);
  const userWatchRef = useRef<number | null>(null);
  const measurePointsRef = useRef<Coord[]>([]);
  const measureMarkersRef = useRef<any[]>([]);
  const measureHandlerRef = useRef<((e: any) => void) | null>(null);
  const routeFromMarkerRef = useRef<any>(null);
  const routeToMarkerRef = useRef<any>(null);
  const poiAbortRef = useRef<AbortController | null>(null);
  const poiCacheRef = useRef<Map<string, any>>(new Map());
  const weatherPointMarkerRef = useRef<any>(null);
  const weatherGridAbortRef = useRef<AbortController | null>(null);
  const weatherRefreshTimerRef = useRef<any>(null);
  const rainFramesRef = useRef<RainFrame[]>([]);
  const rainPlayTimerRef = useRef<any>(null);

  const [styleName, setStyleName] = useState<string>("Liberty");
  const currentStyleRef = useRef<string>("Liberty");
  const [basemap, setBasemap] = useState<BasemapMode>("vector");

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [poiLoading, setPoiLoading] = useState(false);
  const [poiCount, setPoiCount] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);

  const [measureActive, setMeasureActive] = useState(false);
  const [measureMode, setMeasureMode] = useState<MeasureMode>("distance");
  const [measureValue, setMeasureValue] = useState<string>("");

  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");

  const [routeFrom, setRouteFrom] = useState<LngLat | null>(null);
  const [routeTo, setRouteTo] = useState<LngLat | null>(null);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{
    distance: number;
    duration: number;
    steps: RouteStep[];
  } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [pickMode, setPickMode] = useState<"from" | "to" | null>(null);

  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromResults, setFromResults] = useState<{ display_name: string; lat: number; lon: number }[]>([]);
  const [toResults, setToResults] = useState<{ display_name: string; lat: number; lon: number }[]>([]);
  const [activeInput, setActiveInput] = useState<"from" | "to" | null>(null);

  const [panelOpen, setPanelOpen] = useState(false);

  const [weatherOpen, setWeatherOpen] = useState(false);
  const [activeWeatherLayer, setActiveWeatherLayer] = useState<string | null>(null);
  const [weatherOpacity, setWeatherOpacity] = useState(0.75);
  const [weatherPoint, setWeatherPoint] = useState<WeatherPoint | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherFetching, setWeatherFetching] = useState(false);

  const [rainFrames, setRainFrames] = useState<RainFrame[]>([]);
  const [rainFrameIdx, setRainFrameIdx] = useState(0);
  const [rainPlaying, setRainPlaying] = useState(true);

  useEffect(() => {
    basemapRef.current = basemap;
  }, [basemap]);

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  // MAP INIT
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const styleParam = params.get("style");
    const initialStyle = styleParam && STYLES[styleParam] ? styleParam : "Liberty";
    setStyleName(initialStyle);
    currentStyleRef.current = initialStyle;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLES[initialStyle].url,
      center: [44.36, 33.31],
      zoom: 5,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const installRasterLayers = () => {
      const styleLayers = map.getStyle()?.layers ?? [];
      const firstSymbolId = styleLayers.find((l: any) => l.type === "symbol")?.id;

      if (!map.getSource("esri-sat")) {
        map.addSource("esri-sat", {
          type: "raster",
          tiles: [ESRI_TILES],
          tileSize: 256,
          attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
        });
      }
      if (!map.getLayer("esri-sat-layer")) {
        map.addLayer(
          { id: "esri-sat-layer", type: "raster", source: "esri-sat" },
          firstSymbolId
        );
      }

      if (!map.getSource("s2-sat")) {
        map.addSource("s2-sat", {
          type: "raster",
          tiles: [MAPTILER_S2_TILES],
          tileSize: 256,
          attribution: "© MapTiler © OpenStreetMap contributors",
        });
      }
      if (!map.getLayer("s2-sat-layer")) {
        map.addLayer(
          { id: "s2-sat-layer", type: "raster", source: "s2-sat" },
          firstSymbolId
        );
      }

      if (!map.getSource("measure-line")) {
        map.addSource("measure-line", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer("measure-line-layer")) {
        map.addLayer({
          id: "measure-line-layer",
          type: "line",
          source: "measure-line",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#f59e0b",
            "line-width": 3,
            "line-dasharray": [2, 1],
          },
        });
      }
      if (!map.getSource("measure-fill")) {
        map.addSource("measure-fill", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer("measure-fill-layer")) {
        map.addLayer({
          id: "measure-fill-layer",
          type: "fill",
          source: "measure-fill",
          paint: { "fill-color": "#f59e0b", "fill-opacity": 0.15 },
        });
      }

      if (!map.getSource("route")) {
        map.addSource("route", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer("route-casing")) {
        map.addLayer(
          {
            id: "route-casing",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": "#1e3a8a",
              "line-width": 9,
              "line-opacity": 0.6,
            },
          },
          firstSymbolId
        );
      }
      if (!map.getLayer("route-layer")) {
        map.addLayer(
          {
            id: "route-layer",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": "#3b82f6",
              "line-width": 5,
              "line-opacity": 1,
            },
          },
          firstSymbolId
        );
      }

      if (!map.getSource("pois")) {
        map.addSource("pois", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: false,
        });
      }
      if (!map.getLayer("poi-points")) {
        map.addLayer({
          id: "poi-points",
          type: "circle",
          source: "pois",
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": 8,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
      }

      // Weather heatmap grid
      if (!map.getSource("weather-grid")) {
        map.addSource("weather-grid", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer("weather-grid-layer")) {
        map.addLayer(
          {
            id: "weather-grid-layer",
            type: "circle",
            source: "weather-grid",
            layout: { visibility: "none" },
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 22, 6, 34, 10, 50, 14, 70],
              "circle-opacity": 0.85,
              "circle-blur": 0.6,
              "circle-color": [
                "interpolate",
                ["linear"],
                ["get", "value"],
                0, ["get", "colorLow"],
                1, ["get", "colorHigh"],
              ] as any,
            },
          },
          firstSymbolId
        );
      }

      // Wind arrows
      if (!map.getSource("weather-wind-arrows")) {
        map.addSource("weather-wind-arrows", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer("weather-wind-arrows-layer")) {
        map.addLayer({
          id: "weather-wind-arrows-layer",
          type: "symbol",
          source: "weather-wind-arrows",
          layout: {
            visibility: "none",
            "icon-image": "wind-arrow",
            "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.4, 8, 0.6, 12, 0.85],
            "icon-rotate": ["get", "bearing"],
            "icon-rotation-alignment": "map",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: { "icon-opacity": 0.9 },
        });
      }

      const current = basemapRef.current;
      if (map.getLayer("esri-sat-layer")) {
        map.setLayoutProperty(
          "esri-sat-layer",
          "visibility",
          current === "satellite-esri" ? "visible" : "none"
        );
      }
      if (map.getLayer("s2-sat-layer")) {
        map.setLayoutProperty(
          "s2-sat-layer",
          "visibility",
          current === "satellite-s2" ? "visible" : "none"
        );
      }
    };

    map.on("style.load", installRasterLayers);
    map.on("load", installRasterLayers);

    map.on("load", () => {
      // Wind arrow sprite
      const size = 48;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = "#0f172a";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(size / 2, 6);
      ctx.lineTo(size - 10, size - 6);
      ctx.lineTo(size / 2, size - 14);
      ctx.lineTo(10, size - 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (!map.hasImage("wind-arrow")) {
        map.addImage("wind-arrow", {
          width: size,
          height: size,
          data: ctx.getImageData(0, 0, size, size).data,
        } as any);
      }

      const geocoderApi = {
        forwardGeocode: async (config: any) => {
          const features: any[] = [];
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
                config.query
              )}&format=geojson&polygon_geojson=1&addressdetails=1&limit=6`
            );
            const data = await res.json();
            for (const f of data.features) {
              features.push({
                type: "Feature",
                geometry: f.geometry,
                place_name: f.properties.display_name,
                properties: f.properties,
                text: f.properties.display_name,
                center: f.geometry.coordinates,
              });
            }
          } catch (e) {
            console.error(e);
          }
          return { features };
        },
      };

      map.addControl(
        new (MaplibreGeocoder as any)(geocoderApi, {
          maplibregl,
          marker: true,
          showResultsWhileTyping: true,
          placeholder: "Search places...",
        }),
        "top-left"
      );

      map.on("click", "poi-points", (e: any) => {
        const f = e.features[0];
        const coords = f.geometry.coordinates.slice() as Coord;
        const props = f.properties;
        new maplibregl.Popup({ offset: 15 })
          .setLngLat(coords)
          .setHTML(
            `<div style="font-weight:600;margin-bottom:2px">${props.name ?? props.category}</div>
             <div style="color:#9ca3af;font-size:11px">${props.icon ?? ""} ${props.category}</div>`
          )
          .addTo(map);
      });

      map.on("mouseenter", "poi-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "poi-points", () => {
        map.getCanvas().style.cursor = "";
      });

      // Point forecast on click
      map.on("click", async (e: any) => {
        if (!weatherOpen) return;
        const lat = e.lngLat.lat;
        const lng = e.lngLat.lng;
        setWeatherLoading(true);

        if (weatherPointMarkerRef.current) weatherPointMarkerRef.current.remove();
        const el = document.createElement("div");
        el.style.cssText = `
          width: 14px; height: 14px; border-radius: 50%;
          background: #f97316; border: 2px solid white;
          box-shadow: 0 0 0 3px rgba(249,115,22,0.35);
        `;
        weatherPointMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);

        try {
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,weather_code`
          );
          const data = await res.json();
          const c = data?.current;
          if (!c) {
            setWeatherLoading(false);
            return;
          }
          setWeatherPoint({
            lng,
            lat,
            temperature: c.temperature_2m ?? 0,
            humidity: c.relative_humidity_2m ?? 0,
            precipitation: c.precipitation ?? 0,
            cloudCover: c.cloud_cover ?? 0,
            pressure: c.pressure_msl ?? 0,
            windSpeed: c.wind_speed_10m ?? 0,
            windDirection: c.wind_direction_10m ?? 0,
            code: c.weather_code ?? 0,
          });
        } catch (err) {
          console.error(err);
          showToast("Weather fetch failed");
        } finally {
          setWeatherLoading(false);
        }
      });
    });

    mapRef.current = map;

    return () => {
      if (userWatchRef.current !== null) {
        navigator.geolocation.clearWatch(userWatchRef.current);
        userWatchRef.current = null;
      }
      if (weatherRefreshTimerRef.current) clearTimeout(weatherRefreshTimerRef.current);
      if (rainPlayTimerRef.current) clearInterval(rainPlayTimerRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, [weatherOpen]);

  // Basemap toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer("esri-sat-layer")) {
        map.setLayoutProperty(
          "esri-sat-layer",
          "visibility",
          basemap === "satellite-esri" ? "visible" : "none"
        );
      }
      if (map.getLayer("s2-sat-layer")) {
        map.setLayoutProperty(
          "s2-sat-layer",
          "visibility",
          basemap === "satellite-s2" ? "visible" : "none"
        );
      }
    };
    if (map.isStyleLoaded() && map.getLayer("esri-sat-layer")) apply();
    else map.once("style.load", apply);
  }, [basemap]);

  // Load RainViewer frames once
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/rainviewer");
        if (!res.ok) return;
        const data = await res.json();
        const host: string = data.host ?? "https://tilecache.rainviewer.com";
        const radar = data.radar;
        const past = radar?.past ?? [];
        const nowcast = radar?.nowcast ?? [];
        const frames: RainFrame[] = [...past, ...nowcast].map((f: any) => ({
          path: host + f.path + "/256/{z}/{x}/{y}/2/1_1.png",
          time: f.time * 1000,
        }));
        if (cancelled || frames.length === 0) return;
        rainFramesRef.current = frames;
        setRainFrames(frames);
        setRainFrameIdx(Math.max(0, past.length - 1));

        const install = () => {
          if (cancelled) return;
          if (!map.getSource("weather-rain")) {
            map.addSource("weather-rain", {
              type: "raster",
              tiles: [frames[Math.max(0, past.length - 1)].path],
              tileSize: 256,
            });
          }
          if (!map.getLayer("weather-rain-layer")) {
            const styleLayers = map.getStyle()?.layers ?? [];
            const firstSymbolId = styleLayers.find((l: any) => l.type === "symbol")?.id;
            map.addLayer(
              {
                id: "weather-rain-layer",
                type: "raster",
                source: "weather-rain",
                paint: { "raster-opacity": 0.75 },
                layout: { visibility: "none" },
              },
              firstSymbolId
            );
          }
        };
        if (map.isStyleLoaded()) install();
        else map.once("style.load", install);
      } catch (e) {
        console.error("RainViewer load failed:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Apply rain frame
  useEffect(() => {
    const map = mapRef.current;
    if (!map || rainFrames.length === 0) return;
    const frame = rainFrames[Math.min(rainFrameIdx, rainFrames.length - 1)];
    const src = map.getSource("weather-rain") as any;
    if (src) src.setTiles([frame.path]);
  }, [rainFrameIdx, rainFrames]);

  // Rain animation loop
  useEffect(() => {
    if (!rainPlaying || rainFrames.length === 0) return;
    const id = setInterval(() => {
      setRainFrameIdx((i) => (i + 1) % rainFrames.length);
    }, 500);
    rainPlayTimerRef.current = id;
    return () => clearInterval(id);
  }, [rainPlaying, rainFrames]);

  // Weather grid + wind arrows
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const def = WEATHER_LAYERS.find((l) => l.id === activeWeatherLayer);
    const isHeatmap = activeWeatherLayer && activeWeatherLayer !== "rain" && def;

    if (map.getLayer("weather-rain-layer")) {
      map.setLayoutProperty(
        "weather-rain-layer",
        "visibility",
        activeWeatherLayer === "rain" ? "visible" : "none"
      );
    }

    if (map.getLayer("weather-wind-arrows-layer")) {
      map.setLayoutProperty(
        "weather-wind-arrows-layer",
        "visibility",
        activeWeatherLayer === "wind" ? "visible" : "none"
      );
    }

    if (!isHeatmap || !def) {
      if (map.getLayer("weather-grid-layer")) {
        map.setLayoutProperty("weather-grid-layer", "visibility", "none");
      }
      return;
    }

    weatherGridAbortRef.current?.abort();
    const controller = new AbortController();
    weatherGridAbortRef.current = controller;

    setWeatherFetching(true);

    const doFetch = async () => {
      const bounds = map.getBounds();
      const south = bounds.getSouth();
      const west = bounds.getWest();
      const north = bounds.getNorth();
      const east = bounds.getEast();

      // 8x8 grid = 64 points — safe for Open-Meteo free tier
      const GRID = 8;
      const lats: number[] = [];
      const lngs: number[] = [];
      for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
          lats.push(south + ((north - south) * i) / (GRID - 1));
          lngs.push(west + ((east - west) * j) / (GRID - 1));
        }
      }

      const field =
        activeWeatherLayer === "wind"
          ? "wind_speed_10m,wind_direction_10m"
          : def.dataField;

      const url =
        `https://api.open-meteo.com/v1/forecast?` +
        `latitude=${lats.map((v) => v.toFixed(3)).join(",")}` +
        `&longitude=${lngs.map((v) => v.toFixed(3)).join(",")}` +
        `&current=${field}`;

      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          setWeatherFetching(false);
          return;
        }
        const data = await res.json();

        // Open-Meteo returns an array when multiple coords are given
        const items = Array.isArray(data) ? data : [data];
        const heatFeatures: any[] = [];
        const arrowFeatures: any[] = [];

        for (const item of items) {
          if (!item) continue;
          const lat = item.latitude;
          const lng = item.longitude;
          const cur = item.current;
          if (!cur || typeof lat !== "number" || typeof lng !== "number") continue;

          const value = cur[def.dataField];
          if (typeof value !== "number") continue;

          const norm = Math.max(
            0,
            Math.min(1, (value - def.minValue) / (def.maxValue - def.minValue))
          );
          heatFeatures.push({
            type: "Feature",
            properties: {
              value: norm,
              colorLow: def.colorLow,
              colorHigh: def.colorHigh,
            },
            geometry: { type: "Point", coordinates: [lng, lat] },
          });

          if (activeWeatherLayer === "wind") {
            const dir = cur.wind_direction_10m;
            if (typeof dir === "number") {
              arrowFeatures.push({
                type: "Feature",
                properties: { bearing: dir },
                geometry: { type: "Point", coordinates: [lng, lat] },
              });
            }
          }
        }

        (map.getSource("weather-grid") as any)?.setData({
          type: "FeatureCollection",
          features: heatFeatures,
        });
        (map.getSource("weather-wind-arrows") as any)?.setData({
          type: "FeatureCollection",
          features: arrowFeatures,
        });

        if (map.getLayer("weather-grid-layer")) {
          map.setLayoutProperty("weather-grid-layer", "visibility", "visible");
          map.setPaintProperty(
            "weather-grid-layer",
            "circle-opacity",
            weatherOpacity * 0.9
          );
        }
        if (map.getLayer("weather-rain-layer")) {
          map.setPaintProperty("weather-rain-layer", "raster-opacity", weatherOpacity);
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") console.error("Weather grid failed:", err);
      } finally {
        setWeatherFetching(false);
      }
    };

    doFetch();

    const onMoveEnd = () => {
      if (weatherRefreshTimerRef.current) clearTimeout(weatherRefreshTimerRef.current);
      weatherRefreshTimerRef.current = setTimeout(() => {
        doFetch();
      }, 800);
    };
    map.on("moveend", onMoveEnd);

    return () => {
      map.off("moveend", onMoveEnd);
      if (weatherRefreshTimerRef.current) clearTimeout(weatherRefreshTimerRef.current);
    };
  }, [activeWeatherLayer, weatherOpacity, weatherOpen]);

  // Style switch
  useEffect(() => {
    const map = mapRef.current;
    if (!map || currentStyleRef.current === styleName) return;
    currentStyleRef.current = styleName;
    map.setStyle(STYLES[styleName].url);
    const params = new URLSearchParams(window.location.search);
    params.set("style", styleName);
    window.history.replaceState({}, "", `?${params.toString()}`);
  }, [styleName]);

  function showToast(msg: string, ms = 2600) {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  }

  const makeRouteDot = (color: string) => {
    const el = document.createElement("div");
    el.style.cssText = `
      width: 22px; height: 22px; border-radius: 50%;
      background: ${color}; border: 3px solid white;
      box-shadow: 0 0 0 4px ${color}33, 0 4px 12px rgba(0,0,0,0.4);
      cursor: grab;
    `;
    return el;
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickMode) return;
    const handler = (e: any) => {
      const pt: LngLat = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      if (pickMode === "from") {
        setRouteFrom(pt);
        setFromQuery(`${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}`);
      } else {
        setRouteTo(pt);
        setToQuery(`${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}`);
      }
      setPickMode(null);
    };
    map.on("click", handler);
    return () => map.off("click", handler);
  }, [pickMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routeFrom) {
      const ll: Coord = [routeFrom.lng, routeFrom.lat];
      if (routeFromMarkerRef.current) {
        routeFromMarkerRef.current.setLngLat(ll);
      } else {
        const m = new maplibregl.Marker({
          element: makeRouteDot("#22c55e"),
          draggable: true,
        })
          .setLngLat(ll)
          .addTo(map);
        m.on("dragend", () => {
          const pos = m.getLngLat();
          setRouteFrom({ lng: pos.lng, lat: pos.lat });
        });
        routeFromMarkerRef.current = m;
      }
    } else {
      routeFromMarkerRef.current?.remove();
      routeFromMarkerRef.current = null;
    }

    if (routeTo) {
      const ll: Coord = [routeTo.lng, routeTo.lat];
      if (routeToMarkerRef.current) {
        routeToMarkerRef.current.setLngLat(ll);
      } else {
        const m = new maplibregl.Marker({
          element: makeRouteDot("#ef4444"),
          draggable: true,
        })
          .setLngLat(ll)
          .addTo(map);
        m.on("dragend", () => {
          const pos = m.getLngLat();
          setRouteTo({ lng: pos.lng, lat: pos.lat });
        });
        routeToMarkerRef.current = m;
      }
    } else {
      routeToMarkerRef.current?.remove();
      routeToMarkerRef.current = null;
    }
  }, [routeFrom, routeTo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!routeFrom || !routeTo) {
      setRouteInfo(null);
      (map.getSource("route") as any)?.setData({
        type: "FeatureCollection",
        features: [],
      });
      return;
    }
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${routeFrom.lng},${routeFrom.lat};${routeTo.lng},${routeTo.lat}` +
      `?overview=full&geometries=geojson&steps=true`;
    setRouteLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const route = data.routes?.[0];
        if (!route) {
          showToast("No route found");
          setRouteInfo(null);
          return;
        }
        const steps: RouteStep[] = route.legs?.[0]?.steps ?? [];
        setRouteInfo({ distance: route.distance, duration: route.duration, steps });
        (map.getSource("route") as any)?.setData({
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: route.geometry }],
        });
        const coords = route.geometry.coordinates as Coord[];
        const bounds = coords.reduce(
          (b: any, c: Coord) => b.extend(c),
          new maplibregl.LngLatBounds(coords[0], coords[0])
        );
        map.fitBounds(bounds, {
          padding: { top: 120, bottom: 120, left: 400, right: 120 },
        });
      })
      .catch((err) => {
        console.error(err);
        showToast("Routing failed");
      })
      .finally(() => setRouteLoading(false));
  }, [routeFrom, routeTo]);

  function clearRoute() {
    setRouteFrom(null);
    setRouteTo(null);
    setRouteInfo(null);
    setFromQuery("");
    setToQuery("");
  }

  async function searchAddress(query: string, which: "from" | "to") {
    if (!query.trim()) {
      if (which === "from") setFromResults([]);
      else setToResults([]);
      return;
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&limit=5`
      );
      const data = await res.json();
      const mapped = data.map((d: any) => ({
        display_name: d.display_name,
        lat: parseFloat(d.lat),
        lon: parseFloat(d.lon),
      }));
      if (which === "from") setFromResults(mapped);
      else setToResults(mapped);
    } catch (e) {
      console.error(e);
    }
  }

  function pickAddress(
    r: { lat: number; lon: number; display_name: string },
    which: "from" | "to"
  ) {
    const pt: LngLat = { lng: r.lon, lat: r.lat };
    if (which === "from") {
      setRouteFrom(pt);
      setFromQuery(r.display_name);
      setFromResults([]);
    } else {
      setRouteTo(pt);
      setToQuery(r.display_name);
      setToResults([]);
    }
    setActiveInput(null);
  }

  function openSaveDialog() {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    setSaveName(`${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}`);
    setShowSaveDialog(true);
  }

  function commitSave() {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const fav: Favorite = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: saveName.trim() || "Untitled",
      center: [c.lng, c.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      basemap,
      style: styleName,
      createdAt: Date.now(),
    };
    const next = [fav, ...favorites].slice(0, 20);
    setFavorites(next);
    saveFavorites(next);
    setShowSaveDialog(false);
    showToast(`Saved "${fav.name}"`);
  }

  function deleteFavorite(id: string) {
    const next = favorites.filter((f) => f.id !== id);
    setFavorites(next);
    saveFavorites(next);
  }

  function goToFavorite(fav: Favorite) {
    const map = mapRef.current;
    if (!map) return;
    if (fav.basemap !== basemap) setBasemap(fav.basemap);
    if (fav.style !== styleName && fav.basemap === "vector") setStyleName(fav.style);
    map.flyTo({
      center: fav.center,
      zoom: fav.zoom,
      bearing: fav.bearing,
      pitch: fav.pitch,
      duration: 1500,
    });
  }

  function makeUserDot() {
    const wrap = document.createElement("div");
    wrap.style.cssText = `position: relative; width: 20px; height: 20px;`;
    const ring = document.createElement("div");
    ring.style.cssText = `
      position: absolute; inset: -12px; border-radius: 50%;
      background: rgba(59, 130, 246, 0.25);
      animation: pulse-ring 2s ease-out infinite;
    `;
    const dot = document.createElement("div");
    dot.style.cssText = `
      position: absolute; inset: 0; border-radius: 50%;
      background: #3b82f6; border: 3px solid white;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.4), 0 4px 12px rgba(0,0,0,0.4);
    `;
    wrap.appendChild(ring);
    wrap.appendChild(dot);
    return wrap;
  }

  function toggleTracking() {
    const map = mapRef.current;
    if (!map) return;
    if (!("geolocation" in navigator)) {
      showToast("Geolocation is not supported");
      return;
    }
    if (tracking) {
      if (userWatchRef.current !== null) {
        navigator.geolocation.clearWatch(userWatchRef.current);
        userWatchRef.current = null;
      }
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      setTracking(false);
      showToast("Location tracking off");
      return;
    }
    setTracking(true);
    showToast("Getting your location…", 1500);
    userWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords;
        const ll: Coord = [longitude, latitude];
        if (!userMarkerRef.current) {
          const el = makeUserDot();
          userMarkerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat(ll)
            .addTo(map);
          map.flyTo({ center: ll, zoom: 15, duration: 1500 });
        } else {
          userMarkerRef.current.setLngLat(ll);
        }
      },
      (err) => {
        console.error(err);
        if (err.code === 1) showToast("Location permission denied");
        else if (err.code === 2) showToast("Location unavailable");
        else showToast("Location request timed out");
        setTracking(false);
        if (userWatchRef.current !== null) {
          navigator.geolocation.clearWatch(userWatchRef.current);
          userWatchRef.current = null;
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }

  function updateMeasureLayers() {
    const map = mapRef.current;
    if (!map) return;
    const pts = measurePointsRef.current;

    const lineData = {
      type: "FeatureCollection" as const,
      features:
        pts.length >= 2
          ? [
              {
                type: "Feature" as const,
                properties: {},
                geometry: { type: "LineString" as const, coordinates: pts },
              },
            ]
          : [],
    };
    const fillData = {
      type: "FeatureCollection" as const,
      features:
        measureMode === "area" && pts.length >= 3
          ? [
              {
                type: "Feature" as const,
                properties: {},
                geometry: {
                  type: "Polygon" as const,
                  coordinates: [[...pts, pts[0]]],
                },
              },
            ]
          : [],
    };
    (map.getSource("measure-line") as any)?.setData(lineData);
    (map.getSource("measure-fill") as any)?.setData(fillData);
    if (measureMode === "distance") {
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += haversine(pts[i - 1], pts[i]);
      setMeasureValue(pts.length >= 2 ? formatDistance(total) : "");
    } else {
      setMeasureValue(pts.length >= 3 ? formatArea(polygonArea(pts)) : "");
    }
  }

  function clearMeasure() {
    measurePointsRef.current = [];
    measureMarkersRef.current.forEach((m) => m.remove());
    measureMarkersRef.current = [];
    updateMeasureLayers();
  }

  function undoMeasure() {
    measurePointsRef.current.pop();
    measureMarkersRef.current.pop()?.remove();
    updateMeasureLayers();
  }

  function toggleMeasure() {
    const map = mapRef.current;
    if (!map) return;
    if (measureActive) {
      if (measureHandlerRef.current) {
        map.off("click", measureHandlerRef.current);
        measureHandlerRef.current = null;
      }
      clearMeasure();
      setMeasureValue("");
      setMeasureActive(false);
      showToast("Measure off");
      return;
    }
    setMeasureActive(true);
    setMeasureValue("");
    showToast(
      measureMode === "distance"
        ? "Click map to measure distance"
        : "Click map to measure area (3+ points)",
      2500
    );
    const handler = (e: any) => {
      const pt: Coord = [e.lngLat.lng, e.lngLat.lat];
      measurePointsRef.current.push(pt);
      const el = document.createElement("div");
      el.style.cssText = `
        width: 14px; height: 14px; border-radius: 50%;
        background: #f59e0b; border: 2px solid white;
        box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.4);
      `;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(pt)
        .addTo(map);
      measureMarkersRef.current.push(marker);
      updateMeasureLayers();
    };
    map.on("click", handler);
    measureHandlerRef.current = handler;
  }

  async function loadPOIs(categoryId: string) {
    const map = mapRef.current;
    if (!map) return;

    if (activeCategory === categoryId) {
      (map.getSource("pois") as any)?.setData({
        type: "FeatureCollection",
        features: [],
      });
      setActiveCategory(null);
      setPoiCount(null);
      return;
    }

    const zoom = map.getZoom();
    if (zoom < 8) {
      showToast("Zoom in to search for nearby places", 3000);
      return;
    }

    poiAbortRef.current?.abort();
    const controller = new AbortController();
    poiAbortRef.current = controller;

    setActiveCategory(categoryId);
    setPoiLoading(true);
    setPoiCount(null);

    const cat = POI_CATEGORIES.find((c) => c.id === categoryId)!;
    const bounds = map.getBounds();

    const south = parseFloat(bounds.getSouth().toFixed(4));
    const west  = parseFloat(bounds.getWest().toFixed(4));
    const north = parseFloat(bounds.getNorth().toFixed(4));
    const east  = parseFloat(bounds.getEast().toFixed(4));

    const cacheKey = `${categoryId}|${south}|${west}|${north}|${east}`;
    const cached = poiCacheRef.current.get(cacheKey);
    if (cached) {
      applyPOIsToMap(cached);
      setPoiCount(cached.length);
      if (cached.length === 0) showToast(`No ${cat.label.toLowerCase()} found`);
      setPoiLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/pois", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: cat.id,
          bounds: { south, west, north, east },
          limit: 200,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      const data = await res.json();
      const rawFeatures = data.features ?? [];
      if (rawFeatures.length === 0) showToast(`No ${cat.label.toLowerCase()} found`);
      setPoiCount(rawFeatures.length);

      const features = rawFeatures.map((f: any) => ({
        type: "Feature" as const,
        properties: {
          name: f.properties?.name ?? cat.label,
          category: cat.label,
          icon: cat.icon,
          color: cat.color,
        },
        geometry: { type: "Point" as const, coordinates: f.geometry.coordinates as Coord },
      }));

      poiCacheRef.current.set(cacheKey, features);
      if (poiCacheRef.current.size > 100) {
        const firstKey = poiCacheRef.current.keys().next().value;
        if (firstKey) poiCacheRef.current.delete(firstKey);
      }
      applyPOIsToMap(features);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      console.error("POI search failed:", e);
      showToast("Search failed — try again", 3000);
      setPoiCount(0);
    } finally {
      setPoiLoading(false);
    }
  }

  function applyPOIsToMap(features: any[]) {
    const map = mapRef.current;
    if (!map) return;
    (map.getSource("pois") as any)?.setData({
      type: "FeatureCollection",
      features,
    });
  }

  const activeLayerDef = WEATHER_LAYERS.find((l) => l.id === activeWeatherLayer) || null;

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 glass rounded-2xl px-3 py-2 md:px-4 md:py-2.5 flex items-center gap-2 md:gap-3 fade-in pointer-events-none">
        <div className="rounded-lg shadow-lg palter-logo flex items-center justify-center p-0.5">
          <PalterLogo size={28} />
        </div>
        <div>
          <div className="font-semibold tracking-tight text-xs md:text-sm">Palter Map</div>
          <div className="text-[9px] md:text-[10px] text-white/40 -mt-0.5">
            Explore the world, faster
          </div>
        </div>
      </div>

      <div className="hidden md:flex absolute top-4 right-16 z-10 gap-2 justify-end">
        <div className="glass rounded-xl p-1 flex gap-0.5">
          {Object.keys(STYLES).map((name) => (
            <button
              key={name}
              onClick={() => {
                setStyleName(name);
                if (basemap !== "vector") setBasemap("vector");
              }}
              className={`px-3 py-1.5 text-[11px] rounded-lg font-medium transition-all ${
                styleName === name && basemap === "vector"
                  ? "bg-indigo-500 text-white shadow"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              {STYLES[name].label}
            </button>
          ))}
        </div>

        <div className="glass rounded-xl p-1 flex gap-0.5">
          <button
            onClick={() =>
              setBasemap((v) => (v === "satellite-esri" ? "vector" : "satellite-esri"))
            }
            className={`px-3 py-1.5 text-[11px] rounded-lg font-medium transition-all ${
              basemap === "satellite-esri"
                ? "bg-emerald-500 text-white shadow"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            🛰️ Esri
          </button>
          <button
            onClick={() =>
              setBasemap((v) => (v === "satellite-s2" ? "vector" : "satellite-s2"))
            }
            className={`px-3 py-1.5 text-[11px] rounded-lg font-medium transition-all ${
              basemap === "satellite-s2"
                ? "bg-sky-500 text-white shadow"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            🌍 MapTiler
          </button>
        </div>
      </div>

      <div className="md:hidden absolute bottom-0 left-0 right-0 z-20">
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="w-full flex flex-col items-center pt-2 pb-1.5 glass rounded-t-2xl"
          aria-label="Toggle controls"
        >
          <div className="w-12 h-1.5 rounded-full bg-white/30" />
          <div className="text-[10px] text-white/50 mt-1.5 font-medium">
            {panelOpen ? "Tap to hide" : "Tap for tools"}
          </div>
        </button>
      </div>

      <div className="absolute z-10 w-[280px] flex-col gap-3 left-4 top-20 max-h-[calc(100vh-7rem)] overflow-y-auto fancy-scroll pr-1 hidden md:flex">
        <div className="glass rounded-2xl p-3 fade-in">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">
              Nearby
            </div>
            {poiLoading && (
              <div className="text-[10px] text-indigo-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 pulse-dot" />
                Searching
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {POI_CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => loadPOIs(c.id)}
                disabled={poiLoading}
                className={`flex items-center gap-2 px-2 py-2 text-[11px] rounded-lg transition-all text-left ${
                  activeCategory === c.id
                    ? "bg-indigo-500 text-white shadow"
                    : "bg-white/5 hover:bg-white/10 text-white/80"
                } ${poiLoading ? "opacity-50 cursor-wait" : ""}`}
              >
                <span className="text-sm">{c.icon}</span>
                <span className="truncate">{c.label}</span>
              </button>
            ))}
          </div>
          {poiCount !== null && (
            <div className="mt-2 pt-2 border-t border-white/10 text-[11px] text-white/60 text-center">
              {poiCount === 0 ? "No results" : `${poiCount} result${poiCount === 1 ? "" : "s"} in view`}
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-3 fade-in">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">
              ⭐ Favorites
            </div>
            <div className="text-[10px] text-white/40">{favorites.length}/20</div>
          </div>
          {favorites.length === 0 ? (
            <div className="text-[11px] text-white/40 text-center py-3">
              Save a view with the ⭐ button
            </div>
          ) : (
            <ul className="flex flex-col gap-1 max-h-56 overflow-y-auto fancy-scroll -mx-1 px-1">
              {favorites.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group"
                >
                  <button
                    onClick={() => goToFavorite(f)}
                    className="flex-1 text-left text-[11px] truncate text-white/90"
                  >
                    {f.name}
                  </button>
                  <button
                    onClick={() => deleteFavorite(f.id)}
                    className="w-5 h-5 rounded flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div
        className={`
          md:hidden fixed left-0 right-0 bottom-0 z-20
          transition-transform duration-300 ease-out
          ${panelOpen ? "translate-y-0" : "translate-y-full"}
        `}
        style={{ paddingBottom: "3.25rem" }}
      >
        <div className="glass rounded-t-3xl px-4 pt-5 pb-6 max-h-[70vh] overflow-y-auto fancy-scroll">
          <div className="flex flex-col gap-2 mb-4">
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
              Map style
            </div>
            <div className="glass rounded-xl p-1 flex gap-0.5">
              {Object.keys(STYLES).map((name) => (
                <button
                  key={name}
                  onClick={() => {
                    setStyleName(name);
                    if (basemap !== "vector") setBasemap("vector");
                  }}
                  className={`flex-1 px-2 py-2 text-[11px] rounded-lg font-medium transition-all ${
                    styleName === name && basemap === "vector"
                      ? "bg-indigo-500 text-white shadow"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {STYLES[name].label}
                </button>
              ))}
            </div>

            <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mt-2">
              Satellite
            </div>
            <div className="glass rounded-xl p-1 flex gap-0.5">
              <button
                onClick={() =>
                  setBasemap((v) => (v === "satellite-esri" ? "vector" : "satellite-esri"))
                }
                className={`flex-1 px-2 py-2 text-[11px] rounded-lg font-medium transition-all ${
                  basemap === "satellite-esri"
                    ? "bg-emerald-500 text-white shadow"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                🛰️ Esri
              </button>
              <button
                onClick={() =>
                  setBasemap((v) => (v === "satellite-s2" ? "vector" : "satellite-s2"))
                }
                className={`flex-1 px-2 py-2 text-[11px] rounded-lg font-medium transition-all ${
                  basemap === "satellite-s2"
                    ? "bg-sky-500 text-white shadow"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                🌍 MapTiler
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">
              Nearby places
            </div>
            {poiLoading && (
              <div className="text-[10px] text-indigo-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 pulse-dot" />
                Searching
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5 mb-4">
            {POI_CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => loadPOIs(c.id)}
                disabled={poiLoading}
                className={`flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] rounded-lg transition-all ${
                  activeCategory === c.id
                    ? "bg-indigo-500 text-white shadow"
                    : "bg-white/5 hover:bg-white/10 text-white/80"
                } ${poiLoading ? "opacity-50 cursor-wait" : ""}`}
              >
                <span className="text-lg">{c.icon}</span>
                <span className="truncate w-full text-center">{c.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">
              ⭐ Favorites
            </div>
            <div className="text-[10px] text-white/40">{favorites.length}/20</div>
          </div>
          {favorites.length === 0 ? (
            <div className="text-[11px] text-white/40 text-center py-3">
              Save a view with the ⭐ button on the map
            </div>
          ) : (
            <ul className="flex flex-col gap-1 max-h-56 overflow-y-auto fancy-scroll -mx-1 px-1">
              {favorites.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group"
                >
                  <button
                    onClick={() => {
                      goToFavorite(f);
                      setPanelOpen(false);
                    }}
                    className="flex-1 text-left text-[12px] truncate text-white/90"
                  >
                    {f.name}
                  </button>
                  <button
                    onClick={() => deleteFavorite(f.id)}
                    className="w-6 h-6 rounded flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-white/5"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Weather switcher */}
      <div className="absolute top-20 right-4 z-20 flex flex-col gap-1.5">
        <button
          onClick={() => {
            const next = !weatherOpen;
            setWeatherOpen(next);
            if (!next) setActiveWeatherLayer(null);
          }}
          title="Weather mode"
          className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-lg transition-all backdrop-blur-md border border-white/10 ${
            weatherOpen
              ? "bg-orange-500 text-white"
              : "bg-[rgba(20,20,25,0.85)] text-white/80 hover:bg-[rgba(40,40,50,0.9)]"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17.5 19a4.5 4.5 0 100-9 6 6 0 10-11.7 2A4 4 0 007 19h10.5z" />
          </svg>
        </button>

        {weatherOpen && (
          <>
            <button
              onClick={() => setActiveWeatherLayer((v) => (v === "rain" ? null : "rain"))}
              title="Rain radar (animated)"
              className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shadow-lg transition-all backdrop-blur-md border border-white/10 ${
                activeWeatherLayer === "rain"
                  ? "bg-sky-500 text-white"
                  : "bg-[rgba(20,20,25,0.85)] text-white/70 hover:bg-[rgba(40,40,50,0.9)]"
              }`}
            >
              <span className="text-base leading-none">🌧️</span>
            </button>
            {WEATHER_LAYERS.map((w) => (
              <button
                key={w.id}
                onClick={() =>
                  setActiveWeatherLayer((v) => (v === w.id ? null : w.id))
                }
                title={w.label}
                className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shadow-lg transition-all backdrop-blur-md border border-white/10 ${
                  activeWeatherLayer === w.id
                    ? "bg-sky-500 text-white"
                    : "bg-[rgba(20,20,25,0.85)] text-white/70 hover:bg-[rgba(40,40,50,0.9)]"
                }`}
              >
                <span className="text-base leading-none">{w.icon}</span>
              </button>
            ))}
          </>
        )}
      </div>

      {/* Rain animation controls */}
      {weatherOpen && activeWeatherLayer === "rain" && rainFrames.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 glass rounded-2xl px-4 py-3 w-[min(440px,92vw)] fade-in">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => setRainPlaying((v) => !v)}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white"
            >
              {rainPlaying ? "⏸" : "▶"}
            </button>
            <div className="text-[11px] font-semibold text-white flex-1">
              Rain radar
            </div>
            <div className="text-[10px] text-white/60 tabular-nums">
              {new Date(rainFrames[rainFrameIdx]?.time ?? Date.now()).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={rainFrames.length - 1}
            value={rainFrameIdx}
            onChange={(e) => {
              setRainPlaying(false);
              setRainFrameIdx(parseInt(e.target.value));
            }}
            className="w-full accent-sky-400"
          />
          <div className="flex justify-between text-[9px] text-white/40 mt-1">
            <span>-2h</span>
            <span>Now</span>
            <span>+30m</span>
          </div>
        </div>
      )}

      {/* Weather legend + opacity */}
      {weatherOpen && activeLayerDef && (
        <div className="absolute bottom-6 left-4 z-20 glass rounded-2xl p-3 w-[220px] fade-in">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">{activeLayerDef.icon}</span>
            <div className="text-xs font-semibold">{activeLayerDef.label}</div>
            <div className="text-[10px] text-white/40 ml-auto">
              {activeLayerDef.legend.unit}
            </div>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden mb-1.5">
            {activeLayerDef.legend.stops.map((s, i) => (
              <div key={i} style={{ backgroundColor: s.color, flex: 1 }} />
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-white/50">
            {activeLayerDef.legend.stops.map((s, i) => (
              <span key={i}>{s.label}</span>
            ))}
          </div>

          {weatherFetching && (
            <div className="mt-2 text-[10px] text-sky-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 pulse-dot" />
              Loading layer…
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="text-[10px] text-white/40 mb-1.5">Opacity</div>
            <input
              type="range"
              min={10}
              max={100}
              value={Math.round(weatherOpacity * 100)}
              onChange={(e) => setWeatherOpacity(parseInt(e.target.value) / 100)}
              className="w-full accent-sky-400"
            />
          </div>
        </div>
      )}

      {/* Weather point popup */}
      {weatherOpen && weatherPoint && (
        <div className="absolute bottom-6 right-4 z-20 glass rounded-2xl p-3 w-[240px] fade-in">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">
              Point forecast
            </div>
            {weatherLoading && (
              <div className="text-[10px] text-orange-400">Loading…</div>
            )}
            <button
              onClick={() => {
                setWeatherPoint(null);
                weatherPointMarkerRef.current?.remove();
                weatherPointMarkerRef.current = null;
              }}
              className="w-5 h-5 rounded flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="bg-white/5 rounded-lg p-2">
              <div className="text-white/40 text-[9px] uppercase">Temp</div>
              <div className="font-semibold">{weatherPoint.temperature.toFixed(1)}°C</div>
            </div>
            <div className="bg-white/5 rounded-lg p-2">
              <div className="text-white/40 text-[9px] uppercase">Wind</div>
              <div className="font-semibold">
                {weatherPoint.windSpeed.toFixed(0)} km/h {windDirectionLabel(weatherPoint.windDirection)}
              </div>
            </div>
            <div className="bg-white/5 rounded-lg p-2">
              <div className="text-white/40 text-[9px] uppercase">Cloud</div>
              <div className="font-semibold">{weatherPoint.cloudCover.toFixed(0)}%</div>
            </div>
            <div className="bg-white/5 rounded-lg p-2">
              <div className="text-white/40 text-[9px] uppercase">Humidity</div>
              <div className="font-semibold">{weatherPoint.humidity.toFixed(0)}%</div>
            </div>
            <div className="bg-white/5 rounded-lg p-2">
              <div className="text-white/40 text-[9px] uppercase">Pressure</div>
              <div className="font-semibold">{weatherPoint.pressure.toFixed(0)}</div>
            </div>
            <div className="bg-white/5 rounded-lg p-2">
              <div className="text-white/40 text-[9px] uppercase">Weather</div>
              <div className="font-semibold truncate">{weatherCodeLabel(weatherPoint.code)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Directions */}
      {directionsOpen && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 mt-16 md:mt-20 w-[380px] max-w-[calc(100vw-2rem)] glass rounded-2xl p-4 fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-sm">Directions</div>
            <div className="flex gap-1">
              {routeInfo && (
                <button
                  onClick={clearRoute}
                  className="px-2.5 py-1 text-[11px] rounded-lg bg-white/5 hover:bg-white/10"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => {
                  setDirectionsOpen(false);
                  setPickMode(null);
                }}
                className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="relative mb-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500 ring-4 ring-green-500/20 shrink-0" />
              <input
                type="text"
                value={fromQuery}
                onChange={(e) => {
                  setFromQuery(e.target.value);
                  setActiveInput("from");
                  searchAddress(e.target.value, "from");
                }}
                onFocus={() => setActiveInput("from")}
                placeholder="From — type or pick on map"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => setPickMode(pickMode === "from" ? null : "from")}
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  pickMode === "from"
                    ? "bg-indigo-500 text-white"
                    : "bg-white/5 hover:bg-white/10 text-white/70"
                }`}
              >
                📍
              </button>
            </div>
            {activeInput === "from" && fromResults.length > 0 && (
              <ul className="absolute top-full left-0 right-0 mt-1 bg-[rgba(20,20,25,0.98)] border border-white/10 rounded-lg overflow-hidden max-h-48 overflow-y-auto fancy-scroll z-30 shadow-xl">
                {fromResults.map((r, i) => (
                  <li
                    key={i}
                    onClick={() => pickAddress(r, "from")}
                    className="px-3 py-2 text-[11px] hover:bg-indigo-500/20 cursor-pointer border-b border-white/5 last:border-b-0 truncate"
                  >
                    {r.display_name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="relative mb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 ring-4 ring-red-500/20 shrink-0" />
              <input
                type="text"
                value={toQuery}
                onChange={(e) => {
                  setToQuery(e.target.value);
                  setActiveInput("to");
                  searchAddress(e.target.value, "to");
                }}
                onFocus={() => setActiveInput("to")}
                placeholder="To — type or pick on map"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => setPickMode(pickMode === "to" ? null : "to")}
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  pickMode === "to"
                    ? "bg-indigo-500 text-white"
                    : "bg-white/5 hover:bg-white/10 text-white/70"
                }`}
              >
                📍
              </button>
            </div>
            {activeInput === "to" && toResults.length > 0 && (
              <ul className="absolute top-full left-0 right-0 mt-1 bg-[rgba(20,20,25,0.98)] border border-white/10 rounded-lg overflow-hidden max-h-48 overflow-y-auto fancy-scroll z-30 shadow-xl">
                {toResults.map((r, i) => (
                  <li
                    key={i}
                    onClick={() => pickAddress(r, "to")}
                    className="px-3 py-2 text-[11px] hover:bg-indigo-500/20 cursor-pointer border-b border-white/5 last:border-b-0 truncate"
                  >
                    {r.display_name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {pickMode && (
            <div className="text-[11px] text-indigo-400 mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 pulse-dot" />
              Click the map to set {pickMode} point
            </div>
          )}

          {routeLoading && (
            <div className="text-[11px] text-indigo-400 mb-2">Calculating route…</div>
          )}

          {routeInfo && (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-white/5 rounded-xl px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">Distance</div>
                  <div className="text-base font-semibold">{formatDistance(routeInfo.distance)}</div>
                </div>
                <div className="bg-white/5 rounded-xl px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">Duration</div>
                  <div className="text-base font-semibold">{formatDuration(routeInfo.duration)}</div>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto fancy-scroll -mx-1 px-1 border-t border-white/10 pt-2">
                {routeInfo.steps.map((s, i) => (
                  <div
                    key={i}
                    className="flex gap-2.5 items-start py-2 border-b border-white/5 last:border-b-0"
                  >
                    <span className="text-base leading-none mt-0.5">{stepIcon(s)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white/90 truncate">
                        {s.name || s.maneuver.type}
                      </div>
                      <div className="text-[11px] text-white/40">{formatDistance(s.distance)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Measure */}
      {measureActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 mt-32 md:mt-20 z-30 glass rounded-2xl px-3 py-2 md:px-4 md:py-3 fade-in flex items-center gap-2 md:gap-3 max-w-[calc(100vw-2rem)] overflow-x-auto fancy-scroll">
          <div className="flex gap-0.5 rounded-lg p-0.5 bg-white/5 shrink-0">
            <button
              onClick={() => {
                setMeasureMode("distance");
                clearMeasure();
              }}
              className={`px-2.5 py-1.5 text-[11px] rounded-md font-medium transition-all ${
                measureMode === "distance" ? "bg-amber-500 text-white" : "text-white/60"
              }`}
            >
              Distance
            </button>
            <button
              onClick={() => {
                setMeasureMode("area");
                clearMeasure();
              }}
              className={`px-2.5 py-1.5 text-[11px] rounded-md font-medium transition-all ${
                measureMode === "area" ? "bg-amber-500 text-white" : "text-white/60"
              }`}
            >
              Area
            </button>
          </div>
          {measureValue && (
            <div className="text-sm md:text-base font-bold text-amber-400 tabular-nums shrink-0">
              {measureValue}
            </div>
          )}
          <button
            onClick={undoMeasure}
            disabled={measurePointsRef.current.length === 0}
            className="px-2.5 py-1 text-[11px] rounded-lg bg-white/5 hover:bg-white/10 text-white/80 disabled:opacity-30 shrink-0"
          >
            Undo
          </button>
          <button
            onClick={clearMeasure}
            disabled={measurePointsRef.current.length === 0}
            className="px-2.5 py-1 text-[11px] rounded-lg bg-white/5 hover:bg-white/10 text-white/80 disabled:opacity-30 shrink-0"
          >
            Clear
          </button>
          <button
            onClick={toggleMeasure}
            className="px-2.5 py-1 text-[11px] rounded-lg bg-white/5 hover:bg-white/10 text-white/80 shrink-0"
          >
            Done
          </button>
        </div>
      )}

      {/* Desktop bottom-right buttons */}
      <div className="hidden md:flex absolute bottom-24 right-4 z-10 flex-col gap-2">
        <button
          onClick={() => setDirectionsOpen((v) => !v)}
          title="Directions"
          className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-lg transition-all backdrop-blur-md border border-white/10 ${
            directionsOpen
              ? "bg-indigo-500 text-white"
              : "bg-[rgba(20,20,25,0.85)] text-white/80 hover:bg-[rgba(40,40,50,0.9)]"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </button>

        <button
          onClick={openSaveDialog}
          title="Save this view"
          className="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg transition-all backdrop-blur-md border border-white/10 bg-[rgba(20,20,25,0.85)] text-white/80 hover:bg-[rgba(40,40,50,0.9)]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>

        <button
          onClick={toggleMeasure}
          title={measureActive ? "Stop measuring" : "Measure"}
          className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-lg transition-all backdrop-blur-md border border-white/10 ${
            measureActive
              ? "bg-amber-500 text-white"
              : "bg-[rgba(20,20,25,0.85)] text-white/80 hover:bg-[rgba(40,40,50,0.9)]"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 17l3-3 2 2 3-3 2 2 3-3 2 2 3-3" />
            <line x1="3" y1="21" x2="21" y2="21" />
          </svg>
        </button>

        <button
          onClick={toggleTracking}
          title={tracking ? "Stop tracking" : "Show my location"}
          className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-lg transition-all backdrop-blur-md border border-white/10 ${
            tracking
              ? "bg-blue-500 text-white"
              : "bg-[rgba(20,20,25,0.85)] text-white/80 hover:bg-[rgba(40,40,50,0.9)]"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="1" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="23" />
            <line x1="1" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="23" y2="12" />
          </svg>
        </button>
      </div>

      {/* Mobile right-side buttons */}
      <div className="md:hidden absolute top-3 right-3 z-10 flex flex-col gap-2">
        <button
          onClick={() => setDirectionsOpen((v) => !v)}
          className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all backdrop-blur-md border border-white/10 ${
            directionsOpen ? "bg-indigo-500 text-white" : "bg-[rgba(20,20,25,0.85)] text-white/80"
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </button>

        <button
          onClick={openSaveDialog}
          className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all backdrop-blur-md border border-white/10 bg-[rgba(20,20,25,0.85)] text-white/80"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>

        <button
          onClick={toggleMeasure}
          className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all backdrop-blur-md border border-white/10 ${
            measureActive ? "bg-amber-500 text-white" : "bg-[rgba(20,20,25,0.85)] text-white/80"
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 17l3-3 2 2 3-3 2 2 3-3 2 2 3-3" />
            <line x1="3" y1="21" x2="21" y2="21" />
          </svg>
        </button>

        <button
          onClick={toggleTracking}
          className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all backdrop-blur-md border border-white/10 ${
            tracking ? "bg-blue-500 text-white" : "bg-[rgba(20,20,25,0.85)] text-white/80"
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="1" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="23" />
            <line x1="1" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="23" y2="12" />
          </svg>
        </button>
      </div>

      {showSaveDialog && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm fade-in"
          onClick={() => setShowSaveDialog(false)}
        >
          <div
            className="glass rounded-2xl p-5 w-[340px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-semibold mb-1">Save this view</div>
            <div className="text-[11px] text-white/40 mb-3">
              Saves center, zoom, style, and basemap
            </div>
            <input
              autoFocus
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSave();
                if (e.key === "Escape") setShowSaveDialog(false);
              }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-3 py-1.5 text-xs rounded-lg bg-white/5 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={commitSave}
                className="px-4 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {basemap === "satellite-s2" && !measureActive && !activeWeatherLayer && (
        <div className="hidden md:block absolute bottom-6 left-1/2 -translate-x-1/2 z-10 glass rounded-xl px-4 py-2 text-[11px] text-white/70 fade-in">
          🌍 MapTiler Satellite · up to 8cm/pixel · worldwide
        </div>
      )}
      {basemap === "satellite-esri" && !measureActive && !activeWeatherLayer && (
        <div className="hidden md:block absolute bottom-6 left-1/2 -translate-x-1/2 z-10 glass rounded-xl px-4 py-2 text-[11px] text-white/70 fade-in">
          🛰️ Esri World Imagery · sharp detail · worldwide
        </div>
      )}

      {toast && (
        <div className="absolute bottom-32 md:bottom-24 left-1/2 -translate-x-1/2 z-40 glass rounded-xl px-4 py-2.5 text-sm text-white fade-in max-w-[calc(100vw-2rem)] text-center">
          {toast}
        </div>
      )}

      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}