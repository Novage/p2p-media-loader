import { describe, expect, it } from "vitest";
import { stripPatchLocation } from "../src/manifest/patch-location.js";

const mpd = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="dynamic" minimumUpdatePeriod="PT8S">
${body}  <Period id="0"><AdaptationSet mimeType="video/mp4"/></Period>
</MPD>`;

describe("stripPatchLocation", () => {
  it("removes an element with content", () => {
    const stripped = stripPatchLocation(
      mpd('  <PatchLocation ttl="60">patch.mpp</PatchLocation>\n'),
    );
    expect(stripped).not.toContain("PatchLocation");
    expect(stripped).toContain('<Period id="0">');
  });

  it("removes a self-closing one, and a namespaced one", () => {
    const stripped = stripPatchLocation(
      mpd(
        '  <PatchLocation/>\n  <dash:PatchLocation ttl="30">p.mpp</dash:PatchLocation>\n',
      ),
    );
    expect(stripped).not.toContain("PatchLocation");
  });

  it("removes every one of them", () => {
    const stripped = stripPatchLocation(
      mpd(
        "  <PatchLocation>a.mpp</PatchLocation>\n  <PatchLocation>b.mpp</PatchLocation>\n",
      ),
    );
    expect(stripped).not.toContain("PatchLocation");
  });

  it("returns the very same string when there is none", () => {
    const original = mpd("");
    expect(stripPatchLocation(original)).toBe(original);
  });

  it("leaves a manifest that only mentions the word alone", () => {
    // `Patch` appears in a URL; nothing to remove.
    const original = mpd(
      "  <BaseURL>https://cdn.example/PatchLocationless/</BaseURL>\n",
    );
    expect(stripPatchLocation(original)).toBe(original);
  });
});
