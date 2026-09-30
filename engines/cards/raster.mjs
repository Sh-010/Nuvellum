// Optional: rasterise card SVGs to PNG at their exact size in Chromium (the social APIs need JPEG/PNG), and
// verify in the real renderer that every text line stays inside the box it was fitted to and inside the card.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

/** @returns {Promise<{ file, png, overflow: string[] }[]>} */
export async function rasterise(files, { executablePath = process.env.CHROMIUM_PATH, png = true } = {}) {
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const out = [];
  try {
    for (const file of files) {
      const svgText = readFileSync(file, 'utf8');
      const [, w, h] = /width="(\d+)" height="(\d+)"/.exec(svgText);
      const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><html><body style="margin:0">${svgText}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(({ W, H }) => {
        const bad = [];
        for (const t of document.querySelectorAll('text[data-box]')) {
          const [min, max] = t.dataset.box.split(',').map(Number);
          const bb = t.getBBox();
          const len = t.getComputedTextLength();
          const anchor = t.getAttribute('text-anchor') || 'start';
          const x = +t.getAttribute('x');
          const left = anchor === 'end' ? x - len : anchor === 'middle' ? x - len / 2 : x;
          const right = left + len;
          const s = t.textContent;
          if (right > max + 1.5 && !(anchor === 'end' && left >= min - 1.5)) bad.push(`"${s}" ends at ${right.toFixed(1)} > box ${max}`);
          if (left < min - 1.5 && anchor !== 'start') bad.push(`"${s}" starts at ${left.toFixed(1)} < box ${min}`);
          if (bb.x < -1 || bb.x + bb.width > W + 1 || bb.y < -1 || bb.y + bb.height > H + 1) bad.push(`"${s}" leaves the canvas`);
        }
        return bad;
      }, { W: +w, H: +h });
      let pngPath = null;
      if (png) {
        pngPath = file.replace(/\.svg$/, '.png');
        writeFileSync(pngPath, await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: +w, height: +h } }));
      }
      out.push({ file, png: pngPath, overflow });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return out;
}
