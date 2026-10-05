"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import MaplibreGeocoder from "@maplibre/maplibre-gl-geocoder";
import "@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css";

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
  { id: "restaurant", label: "Restaurants", icon: "🍽️", color: "#f97316", query: 'node["amenity"="restaurant"]' },
  { id: "cafe",       label: "Cafes",       icon: "☕", color: "#a16207", query: 'node["amenity"="cafe"]' },
  { id: "fast_food",  label: "Fast Food",   icon: "🍔", color: "#ef4444", query: 'node["amenity"="fast_food"]' },
  { id: "fuel",       label: "Fuel",        icon: "⛽", color: "#0ea5e9", query: 'node["amenity"="fuel"]' },
  { id: "atm",        label: "ATMs",        icon: "🏧", color: "#22c55e", query: 'node["amenity"="atm"]' },
  { id: "pharmacy",   label: "Pharmacies",  icon: "💊", color: "#14b8a6", query: 'node["amenity"="pharmacy"]' },
  { id: "hospital",   label: "Hospitals",   icon: "🏥", color: "#dc2626", query: 'node["amenity"="hospital"]' },
  { id: "hotel",      label: "Hotels",      icon: "🏨", color: "#8b5cf6", query: 'node["tourism"="hotel"]' },
];

type BasemapMode = "vector" | "satellite-esri" | "satellite-s2";
type MeasureMode = "distance" | "area";
type RouteStep = {
  distance: number;
  duration: number;
  name: string;
  maneuver: { type: string; modifier?: string; location: [number, number] };
};

type LngLat = { lng: number; lat: number };

type Favorite = {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  basemap: BasemapMode;
  style: string;
  createdAt: number;
};

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

function haversine(a: [number, number], b: [number, number]): number {
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

function polygonArea(coords: [number, number][]): number {
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

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const basemapRef = useRef<BasemapMode>("vector");
  const userMarkerRef = useRef<any>(null);
  const userWatchRef = useRef<number | null>(null);
  const measurePointsRef = useRef<[number, number][]>([]);
  const measureMarkersRef = useRef<any[]>([]);
  const measureHandlerRef = useRef<((e: any) => void) | null>(null);
  const routeFromMarkerRef = useRef<any>(null);
  const routeToMarkerRef = useRef<any>(null);

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

  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [routeFrom, setRouteFrom] = useState<LngLat | null>(null);
  const [routeTo, setRouteTo] = useState<LngLat | null>(null);
  const [routeInfo, setRouteInfo] = useState<{
    distance: number;
    duration: number;
    steps: RouteStep[];
  } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [pickMode, setPickMode] = useState<"from" | "to" | null>(null);

  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromResults, setFromResults] = useState<any[]>([]);
  const [toResults, setToResults] = useState<any[]>([]);
  const [activeInput, setActiveInput] = useState<"from" | "to" | null>(null);

  useEffect(() => {
    basemapRef.current = basemap;
  }, [basemap]);

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  // ---------- Init map ----------
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
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

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
          cluster: true,
          clusterMaxZoom: 15,
          clusterRadius: 50,
        });
      }

      if (!map.getLayer("poi-clusters")) {
        map.addLayer({
          id: "poi-clusters",
          type: "circle",
          source: "pois",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#6366f1",
              10,
              "#8b5cf6",
              30,
              "#a855f7",
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16,
              10,
              20,
              30,
              24,
            ],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": 0.9,
          },
        });
      }

      if (!map.getLayer("poi-cluster-count")) {
        map.addLayer({
          id: "poi-cluster-count",
          type: "symbol",
          source: "pois",
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-size": 12,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          },
          paint: {
            "text-color": "#ffffff",
          },
        });
      }

      if (!map.getLayer("poi-points")) {
        map.addLayer({
          id: "poi-points",
          type: "circle",
          source: "pois",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": 8,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
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

      // Cluster click → zoom
      map.on("click", "poi-clusters", (e: any) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["poi-clusters"],
        });
        const clusterFeature = features[0] as any;
        const clusterId = clusterFeature.properties.cluster_id;
        const coords = clusterFeature.geometry.coordinates as [number, number];
        (map.getSource("pois") as any)
          .getClusterExpansionZoom(clusterId)
          .then((zoom: number) => {
            map.easeTo({
              center: coords,
              zoom,
            });
          })
          .catch((err: any) => console.error(err));
      });

      // Individual POI click → popup
      map.on("click", "poi-points", (e: any) => {
        const f = e.features[0];
        const coords = f.geometry.coordinates.slice();
        const props = f.properties;
        new maplibregl.Popup({ offset: 15 })
          .setLngLat(coords)
          .setHTML(
            `<div style="font-weight:600;margin-bottom:2px">${props.name ?? props.category}</div>
             <div style="color:#9ca3af;font-size:11px">${props.icon ?? ""} ${props.category}</div>`
          )
          .addTo(map);
      });

      map.on("mouseenter", "poi-clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "poi-clusters", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", "poi-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "poi-points", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;

    return () => {
      if (userWatchRef.current !== null) {
        navigator.geolocation.clearWatch(userWatchRef.current);
        userWatchRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ---------- Basemap switch ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
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
  }, [basemap]);

  // ---------- Style switch ----------
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
      const pt = { lng: e.lngLat.lng, lat: e.lngLat.lat };
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
      if (routeFromMarkerRef.current) {
        routeFromMarkerRef.current.setLngLat([routeFrom.lng, routeFrom.lat]);
      } else {
        const m = new maplibregl.Marker({
          element: makeRouteDot("#22c55e"),
          draggable: true,
        })
          .setLngLat([routeFrom.lng, routeFrom.lat])
          .addTo(map);
        m.on("dragend", () => {
          const ll = m.getLngLat();
          setRouteFrom({ lng: ll.lng, lat: ll.lat });
        });
        routeFromMarkerRef.current = m;
      }
    } else {
      routeFromMarkerRef.current?.remove();
      routeFromMarkerRef.current = null;
    }

    if (routeTo) {
      if (routeToMarkerRef.current) {
        routeToMarkerRef.current.setLngLat([routeTo.lng, routeTo.lat]);
      } else {
        const m = new maplibregl.Marker({
          element: makeRouteDot("#ef4444"),
          draggable: true,
        })
          .setLngLat([routeTo.lng, routeTo.lat])
          .addTo(map);
        m.on("dragend", () => {
          const ll = m.getLngLat();
          setRouteTo({ lng: ll.lng, lat: ll.lat });
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

    const url = `https://router.project-osrm.org/route/v1/driving/${routeFrom.lng},${routeFrom.lat};${routeTo.lng},${routeTo.lat}?overview=full&geometries=geojson&steps=true`;

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
          features: [
            { type: "Feature", properties: {}, geometry: route.geometry },
          ],
        });
        const coords = route.geometry.coordinates as [number, number][];
        const bounds = coords.reduce(
          (b: any, c: [number, number]) => b.extend(c),
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
    const pt = { lng: r.lon, lat: r.lat };
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
        if (!userMarkerRef.current) {
          const el = makeUserDot();
          userMarkerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat([longitude, latitude])
            .addTo(map);
          map.flyTo({ center: [longitude, latitude], zoom: 15, duration: 1500 });
        } else {
          userMarkerRef.current.setLngLat([longitude, latitude]);
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
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
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
    if (zoom < 10) {
      showToast("Zoom in closer to search for nearby places", 3000);
      return;
    }

    setActiveCategory(categoryId);
    setPoiLoading(true);
    setPoiCount(null);

    const cat = POI_CATEGORIES.find((c) => c.id === categoryId)!;
    const bounds = map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    const query = `[out:json][timeout:25];(${cat.query}(${bbox}););out center 200;`;

    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
      });
      const data = await res.json();
      const elements = data.elements ?? [];
      setPoiCount(elements.length);

      if (elements.length === 0) showToast(`No ${cat.label.toLowerCase()} found`);

      const features = elements
        .map((el: any) => {
          const lat = el.lat ?? el.center?.lat;
          const lon = el.lon ?? el.center?.lon;
          if (!lat || !lon) return null;
          return {
            type: "Feature" as const,
            properties: {
              name: el.tags?.name ?? cat.label,
              category: cat.label,
              icon: cat.icon,
              color: cat.color,
            },
            geometry: {
              type: "Point" as const,
              coordinates: [lon, lat],
            },
          };
        })
        .filter(Boolean);

      (map.getSource("pois") as any)?.setData({
        type: "FeatureCollection",
        features,
      });
    } catch (e) {
      console.error(e);
      showToast("Search failed — try again");
      setPoiCount(0);
    } finally {
      setPoiLoading(false);
    }
  }

  return (
    <div className="relative w-screen h-screen">
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 glass rounded-2xl px-4 py-2.5 flex items-center gap-3 fade-in pointer-events-none">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
          M
        </div>
        <div>
          <div className="font-semibold tracking-tight text-sm">My Maps</div>
          <div className="text-[10px] text-white/40 -mt-0.5">OpenStreetMap · MapLibre · MapTiler</div>
        </div>
      </div>

      <div className="absolute top-4 right-16 z-10 flex flex-wrap gap-2 justify-end max-w-[calc(100vw-4rem)]">
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

      <div className="absolute top-20 left-4 z-10 w-[280px] flex flex-col gap-3 max-h-[calc(100vh-7rem)] overflow-y-auto fancy-scroll pr-1">
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

      {directionsOpen && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 mt-20 w-[380px] max-w-[calc(100vw-2rem)] glass rounded-2xl p-4 fade-in">
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
                  <div className="text-base font-semibold">
                    {formatDistance(routeInfo.distance)}
                  </div>
                </div>
                <div className="bg-white/5 rounded-xl px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">Duration</div>
                  <div className="text-base font-semibold">
                    {formatDuration(routeInfo.duration)}
                  </div>
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
                      <div className="text-[11px] text-white/40">
                        {formatDistance(s.distance)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {measureActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 mt-20 z-20 glass rounded-2xl px-4 py-3 fade-in flex items-center gap-3">
          <div className="flex gap-0.5 rounded-lg p-0.5 bg-white/5">
            <button
              onClick={() => {
                setMeasureMode("distance");
                clearMeasure();
              }}
              className={`px-3 py-1.5 text-[11px] rounded-md font-medium transition-all ${
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
              className={`px-3 py-1.5 text-[11px] rounded-md font-medium transition-all ${
                measureMode === "area" ? "bg-amber-500 text-white" : "text-white/60"
              }`}
            >
              Area
            </button>
          </div>
          {measureValue && (
            <div className="text-base font-bold text-amber-400 tabular-nums">
              {measureValue}
            </div>
          )}
          <button
            onClick={undoMeasure}
            disabled={measurePointsRef.current.length === 0}
            className="px-2.5 py-1 text-[11px] rounded-lg bg-white/5 hover:bg-white/10 text-white/80 disabled:opacity-30"
          >
            Undo
          </button>
          <button
            onClick={clearMeasure}
            disabled={measurePointsRef.current.length === 0}
            className="px-2.5 py-1 text-[11px] rounded-lg bg-white/5 hover:bg-white/10 text-white/80 disabled:opacity-30"
          >
            Clear
          </button>
          <button
            onClick={toggleMeasure}
            className="px-2.5 py-1 text-[11px] rounded-lg bg-white/5 hover:bg-white/10 text-white/80"
          >
            Done
          </button>
        </div>
      )}

      <div className="absolute bottom-24 right-4 z-10 flex flex-col gap-2">
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

      {showSaveDialog && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm fade-in"
          onClick={() => setShowSaveDialog(false)}
        >
          <div
            className="glass rounded-2xl p-5 w-[360px] max-w-[90vw]"
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

      {basemap === "satellite-s2" && !measureActive && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 glass rounded-xl px-4 py-2 text-[11px] text-white/70 fade-in">
          🌍 MapTiler Satellite · up to 8cm/pixel · worldwide
        </div>
      )}
      {basemap === "satellite-esri" && !measureActive && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 glass rounded-xl px-4 py-2 text-[11px] text-white/70 fade-in">
          🛰️ Esri World Imagery · sharp detail · worldwide
        </div>
      )}

      {toast && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 glass rounded-xl px-4 py-2.5 text-sm text-white fade-in">
          {toast}
        </div>
      )}

      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}