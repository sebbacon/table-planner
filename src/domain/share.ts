import { createPersistedPlannerData, parsePlannerDataJson, UnsupportedPlannerVersionError } from "./persistence";
import type { PlannerData } from "./plannerData";

const MAX_ENCODED_LENGTH = 100_000;
const MAX_JSON_BYTES = 1_000_000;
const LINK_ENCODING_VERSION = "v1";
const LINK_PREFIX = `#plan=${LINK_ENCODING_VERSION}.`;

function validateShareVenue(data: PlannerData) {
  // Geometry expands into seats and pairwise adjacency; bound that expansion too.
  let totalSeats = 0;
  for (const table of data.venueConfig?.tables ?? []) {
    const size = table.kind === "rect" ? table.seatsPerSide : table.seats;
    const count = table.kind === "rect" ? table.seatsPerSide * 2 + Number(table.leftEnd) + Number(table.rightEnd) : table.seats;
    totalSeats += count;
    if (!Number.isSafeInteger(size) || size < 1 || totalSeats > 5000) {
      throw new Error("This table layout is invalid or too large for a share link. Download a backup instead.");
    }
  }
}

// A separate wire version lets share links evolve independently of backups.
export async function createShareUrl(data: PlannerData, baseUrl: string): Promise<string> {
  validateShareVenue(data);
  const snapshot = createPersistedPlannerData({ ...data, savedLayouts: [] });
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  if (bytes.length > MAX_JSON_BYTES) throw new Error("This plan is too large for a share link. Download a backup instead.");
  const compressed = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer();
  const encoded = btoa(Array.from(new Uint8Array(compressed), byte => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (encoded.length > MAX_ENCODED_LENGTH) throw new Error("This plan is too large for a share link. Download a backup instead.");
  const url = new URL(baseUrl);
  url.hash = `${LINK_PREFIX}${encoded}`;
  return url.href;
}

export async function readShareHash(hash: string): Promise<PlannerData | null> {
  if (!hash.startsWith("#plan=")) return null;
  if (!hash.startsWith(LINK_PREFIX)) throw new Error("This share link uses an unsupported version. Try updating the app.");
  const encoded = hash.slice(LINK_PREFIX.length);
  if (!encoded || encoded.length > MAX_ENCODED_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error("This share link is invalid or too large. Ask for a new link or a backup file.");
  }
  try {
    const data = parsePlannerDataJson(await decompressV1Payload(encoded));
    validateShareVenue(data);
    return { ...data, savedLayouts: [] };
  } catch (error) {
    if (error instanceof UnsupportedPlannerVersionError) throw new Error("This share link uses an unsupported data version. Update the app before opening it.");
    throw new Error("This share link could not be opened. It may be incomplete or damaged. Ask for a new link or a backup file.");
  }
}

async function decompressV1Payload(encoded: string): Promise<string> {
  const bytes = Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_JSON_BYTES) throw new Error("Share data exceeds the size limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return new Blob(chunks as BlobPart[]).text();
}

export function clearShareHash() {
  if (window.location.hash.startsWith("#plan=")) {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }
}
