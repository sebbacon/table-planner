import { parsePlannerBackupJson, type PlannerData } from "./backup";

const MAX_ENCODED_LENGTH = 100_000;
const MAX_JSON_BYTES = 1_000_000;

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
  const bytes = new TextEncoder().encode(JSON.stringify({ ...data, savedLayouts: undefined, version: 2 }));
  if (bytes.length > MAX_JSON_BYTES) throw new Error("This plan is too large for a share link. Download a backup instead.");
  const compressed = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer();
  const encoded = btoa(Array.from(new Uint8Array(compressed), byte => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (encoded.length > MAX_ENCODED_LENGTH) throw new Error("This plan is too large for a share link. Download a backup instead.");
  const url = new URL(baseUrl);
  url.hash = `plan=v1.${encoded}`;
  return url.href;
}

export async function readShareHash(hash: string): Promise<PlannerData | null> {
  if (!hash.startsWith("#plan=")) return null;
  if (!hash.startsWith("#plan=v1.")) throw new Error("This share link uses an unsupported version. Try updating the app.");
  const encoded = hash.slice("#plan=v1.".length);
  if (!encoded || encoded.length > MAX_ENCODED_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error("This share link is invalid or too large. Ask for a new link or a backup file.");
  }
  try {
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
    const json = await new Blob(chunks as BlobPart[]).text();
    const data = parsePlannerBackupJson(json);
    validateShareVenue(data);
    return { ...data, savedLayouts: [] };
  } catch {
    throw new Error("This share link could not be opened. It may be incomplete or damaged. Ask for a new link or a backup file.");
  }
}

export function clearShareHash() {
  if (window.location.hash.startsWith("#plan=")) {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }
}
