#!/usr/bin/env node
/**
 * Build multi-resolution Windows .ico from public/icon-source.png.
 * Run with: node scripts/build-icon.cjs
 */
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const pngToIcoMod = require("png-to-ico");
const pngToIco = pngToIcoMod.default || pngToIcoMod;

const SOURCE = path.resolve(__dirname, "..", "public", "icon-source.png");
const OUTPUT = path.resolve(__dirname, "..", "public", "app.ico");
const SIZES = [16, 32, 48, 64, 128, 256];

async function main() {
  const sourceBuffer = await fs.readFile(SOURCE);
  const resized = await Promise.all(
    SIZES.map((size) =>
      sharp(sourceBuffer).resize(size, size, { fit: "cover" }).png().toBuffer()
    )
  );
  const ico = await pngToIco(resized);
  await fs.writeFile(OUTPUT, ico);
  console.log(`Wrote ${OUTPUT} (${ico.length} bytes, ${SIZES.length} sizes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
