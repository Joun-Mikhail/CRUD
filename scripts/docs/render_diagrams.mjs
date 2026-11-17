// Render the thesis diagrams from their editable Mermaid sources to SVG and high-resolution PNG.
//
//     node scripts/docs/render_diagrams.mjs
//
// Sources: docs/thesis/figures/src/*.mmd (edit these). Output: docs/thesis/figures/<name>.svg/.png.
// Uses the Playwright Chromium already installed for the frontend's browser tests and Mermaid
// 11.4.1 from the jsDelivr CDN (network access needed once per run). The PNG is rendered at
// 3x device scale so that it stays sharp when printed at A4 text width.
import { createRequire } from "node:module";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(root, "frontend", "package.json"));
const { chromium } = require("@playwright/test");

const SRC = join(root, "docs", "thesis", "figures", "src");
const OUT = join(root, "docs", "thesis", "figures");
const MERMAID = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js";

const config = {
  startOnLoad: false,
  theme: "base",
  securityLevel: "strict",
  fontFamily: "Arial, Helvetica, sans-serif",
  themeVariables: {
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "16px",
    primaryColor: "#ffffff",
    primaryBorderColor: "#3a3f47",
    primaryTextColor: "#111111",
    lineColor: "#3a3f47",
    secondaryColor: "#eef2f6",
    tertiaryColor: "#f6f7f9",
    clusterBkg: "#f3f5f8",
    clusterBorder: "#8a929e",
    edgeLabelBackground: "#ffffff",
    actorBkg: "#eef2f6",
    actorBorder: "#3a3f47",
    noteBkgColor: "#f6f7f9",
    noteBorderColor: "#8a929e",
    activationBkgColor: "#eef2f6",
  },
  flowchart: { curve: "basis", nodeSpacing: 36, rankSpacing: 44, padding: 10, useMaxWidth: false, wrappingWidth: 340, subGraphTitleMargin: { top: 4, bottom: 22 } },
  sequence: { useMaxWidth: false, mirrorActors: false, actorMargin: 40, messageFontSize: 15, noteFontSize: 15 },
};

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 3 });
await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff"><div id="c"></div></body></html>`);
await page.addScriptTag({ url: MERMAID });
await page.evaluate((cfg) => window.mermaid.initialize(cfg), config);

for (const file of readdirSync(SRC).filter((f) => f.endsWith(".mmd")).sort()) {
  const name = file.replace(/\.mmd$/, "");
  const source = readFileSync(join(SRC, file), "utf8");
  const svg = await page.evaluate(async ([id, text]) => {
    const { svg } = await window.mermaid.render(id, text);
    const holder = document.getElementById("c");
    holder.innerHTML = svg;
    holder.style.display = "inline-block";
    holder.style.padding = "12px";
    return svg;
  }, [`d-${name}`, source]);
  writeFileSync(join(OUT, `${name}.svg`), svg, "utf8");
  await page.locator("#c").screenshot({ path: join(OUT, `${name}.png`) });
  const box = await page.locator("#c").boundingBox();
  console.log(`${name}: ${Math.round(box.width)} x ${Math.round(box.height)} CSS px`);
}
await browser.close();
