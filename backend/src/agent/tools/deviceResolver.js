// src/tools/ifixit/deviceResolver.js
import axios from "axios";

const BASE = "https://www.ifixit.com/api/2.0";

export async function resolveDevice(intent) {
  if (!intent || !intent.device) return null;

  const query =
    intent.device.model ||
    `${intent.device.brand ?? ""} ${intent.device.family ?? ""}`.trim();

  if (!query) return null;

  const res = await axios.get(`${BASE}/suggest/${encodeURIComponent(query)}`, {
    params: { doctypes: "device,category" },
  });

  const results = res.data?.results || [];

  const device = results.find(r => r.dataType === "wiki");

  return device?.title || null;
}

