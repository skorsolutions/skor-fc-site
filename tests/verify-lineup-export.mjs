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

assert.match(admin, /captain-portal-v58\.1-private-public-match-scores/);
assert.match(admin, /CAPTAIN PORTAL V57\.0/);
assert.match(admin, /const fullPitchLength=105,opponentPenaltyDepth=16\.5/);
assert.match(admin, /const visiblePitchLength=fullPitchLength-opponentPenaltyDepth/);
assert.match(admin, /const pitchW=800,pitchH=Math\.round\(pitchW\*\(visiblePitchLength\/68\)\)/);
assert.match(admin, /const pitchX=\(W-pitchW\)\/2,pitchY=258/);
assert.match(admin, /const lineupCardH=\(pitchY\+pitchH\+36\)-lineupCardY/);
assert.match(admin, /const benchCardX=50,benchCardY=lineupCardY\+lineupCardH\+26/);
assert.match(admin, /canonicalExportCoord\(entry\.x,5,95\)/);
assert.match(admin, /function croppedExportY\(value\)/);
assert.match(admin, /const cropped=\(\(canonical-croppedTopPct\)\/visiblePitchPct\)\*100/);
assert.match(admin, /const jerseyW=100,jerseyH=88/);
assert.match(admin, /entry\.label==="GK"\?Math\.min\(93,baseExportYPct\+2\.5\):baseExportYPct/);
assert.match(admin, /const pitchStripes=Array\.from\(\{length:10\}/);
assert.match(admin, /<polygon points="\$\{jerseyPoints\}"/);
assert.match(admin, /clipPath id="gameplanPitchClip"/);
assert.match(admin, /same vertical pitch, formation spacing, and jersey shirts as the Lineup Builder/);
assert.doesNotMatch(admin, /<circle cx="\$\{x\}" cy="\$\{y\}" r="44"/);
assert.match(handbook, /Current Captain Portal build: \*\*v58\.0\*\*/);
assert.match(exportDoc, /The exporter must not calculate a new minimum\/maximum from occupied players/);
assert.match(exportDoc, /Circular markers may still be used in compact bench\/list chips, but never as the on-field lineup player design/);
assert.match(exportDoc, /opponent's 18-yard line through SKOR's own goal line/);
assert.doesNotMatch(admin, /y="\$\{pitchY\}" width="\$\{pitchW\*\.58\}"/);

const previewFunction = admin.match(/function renderGameplanPreview\(\)\{([\s\S]*?)\n  \}/)?.[1] || "";
const exportFunction = admin.match(/async function exportGameplanAs\(format\)\{([\s\S]*?)\n  \}/)?.[1] || "";
assert.match(previewFunction, /buildGameplanSvg\(\)/, "preview must use the shared SVG renderer");
assert.match(exportFunction, /buildGameplanSvg\(\)/, "PNG\/JPG downloads must use the shared SVG renderer");

const pitchWidth = 800;
const visiblePitchLength = 105 - 16.5;
const pitchHeight = Math.round(pitchWidth * (visiblePitchLength / 68));
assert.ok(Math.abs((pitchWidth / pitchHeight) - (68 / visiblePitchLength)) < 0.001, "export pitch must preserve the cropped 68:88.5 proportions");
const pitchX = (1080 - pitchWidth) / 2;
assert.equal(pitchX + ((50 / 100) * pitchWidth), 540, "canonical 50% horizontal coordinate must stay centered");

const croppedTopPct = (16.5 / 105) * 100;
const visiblePitchPct = 100 - croppedTopPct;
const cropY = value => Math.max(6, Math.min(94, ((value - croppedTopPct) / visiblePitchPct) * 100));
assert.ok(cropY(25) < 12, "forwards must move into the enlarged top tactical area");
assert.ok(cropY(50) > 40 && cropY(50) < 41, "the full-pitch halfway line must retain its real location after cropping");

console.log("Lineup export verification passed.");

