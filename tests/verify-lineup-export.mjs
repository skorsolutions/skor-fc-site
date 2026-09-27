import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const admin = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
const handbook = fs.readFileSync(new URL("../docs/PROJECT-HANDBOOK.md", import.meta.url), "utf8");
const exportDoc = fs.readFileSync(new URL("../docs/LINEUP-EXPORT.md", import.meta.url), "utf8");

const inlineScripts = [...admin.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
assert.ok(inlineScripts.length, "admin.html must contain inline scripts");
inlineScripts.forEach((match, index) => {
  new vm.Script(match[1], { filename: `admin.html#inline-${index + 1}` });
});

assert.match(admin, /captain-portal-v55\.1-lineup-export-pitch/);
assert.match(admin, /LINEUP BUILDER V55\.1/);
assert.match(admin, /const pitchW=720,pitchH=Math\.round\(pitchW\*\(105\/68\)\)/);
assert.match(admin, /const pitchX=\(W-pitchW\)\/2,pitchY=258/);
assert.match(admin, /const lineupCardH=\(pitchY\+pitchH\+36\)-lineupCardY/);
assert.match(admin, /const benchCardX=50,benchCardY=lineupCardY\+lineupCardH\+26/);
assert.match(admin, /canonicalExportCoord\(entry\.x,5,95\)/);
assert.match(admin, /canonicalExportCoord\(entry\.y,8,92\)/);
assert.match(admin, /const pitchStripes=Array\.from\(\{length:10\}/);
assert.match(admin, /<polygon points="\$\{jerseyPoints\}"/);
assert.match(admin, /clipPath id="gameplanPitchClip"/);
assert.match(admin, /same vertical pitch, formation spacing, and jersey shirts as the Lineup Builder/);
assert.doesNotMatch(admin, /<circle cx="\$\{x\}" cy="\$\{y\}" r="44"/);
assert.match(handbook, /Current Captain Portal build: \*\*v55\.1\*\*/);
assert.match(exportDoc, /The exporter must not calculate a new minimum\/maximum from occupied players/);
assert.match(exportDoc, /Circular markers may still be used in compact bench\/list chips, but never as the on-field lineup player design/);

const previewFunction = admin.match(/function renderGameplanPreview\(\)\{([\s\S]*?)\n  \}/)?.[1] || "";
const exportFunction = admin.match(/async function exportGameplanAs\(format\)\{([\s\S]*?)\n  \}/)?.[1] || "";
assert.match(previewFunction, /buildGameplanSvg\(\)/, "preview must use the shared SVG renderer");
assert.match(exportFunction, /buildGameplanSvg\(\)/, "PNG\/JPG downloads must use the shared SVG renderer");

const pitchWidth = 720;
const pitchHeight = Math.round(pitchWidth * (105 / 68));
assert.ok(Math.abs((pitchWidth / pitchHeight) - (68 / 105)) < 0.001, "export pitch must preserve 68:105 proportions");
const pitchX = (1080 - pitchWidth) / 2;
assert.equal(pitchX + ((50 / 100) * pitchWidth), 540, "canonical 50% horizontal coordinate must stay centered");

console.log("Lineup export verification passed.");
