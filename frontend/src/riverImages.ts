// Local river cover images bundled with the app.
//
// Using `require()` keeps these assets bundled into the binary so cards
// render instantly with no network round-trip — critical for the field
// use case where cell service is often unavailable. Any river not
// present in this map falls back to whatever URL its meta.json exposes
// via the CURATED_BUNDLE (e.g. an Unsplash placeholder), which is
// handled by the `riverImageSource()` helper below.
//
// To add a cover image for a new river:
//   1. Drop a JPEG (~600–1,000 KB, ideally square 1024×1024+) into
//      /app/frontend/assets/river-covers/<river-id>.jpeg
//   2. Add a matching entry to LOCAL_COVERS below.

const LOCAL_COVERS: Record<string, number> = {
  "green-river-desolation": require("../../assets/river-covers/deso.jpeg"),
  "middle-fork-salmon":     require("../../assets/river-covers/mfs.jpeg"),
};

/**
 * Return an Image `source` for a given river. Local bundled asset when
 * we have one on hand, otherwise a URI object for the fallback image
 * URL that ships in the curated metadata. Consumers pass the return
 * value directly to `<Image source={...} />` — the RN Image component
 * accepts both `number` (require handle) and `{ uri }` shapes.
 */
export function riverImageSource(
  riverId: string,
  fallbackUri?: string
): number | { uri: string } {
  const local = LOCAL_COVERS[riverId];
  if (local != null) return local;
  return { uri: fallbackUri || "" };
}
