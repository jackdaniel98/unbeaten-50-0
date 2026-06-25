#!/usr/bin/env node
'use strict';
/**
 * normalize-fighters.js
 *
 * Pipeline for each PNG:
 *   1. Trim transparent edges (removes dead space left by background removal)
 *   2. Resize to fit inside (canvasWidth × targetHeight), maintaining aspect ratio
 *   3. Pad to full canvas anchored bottom-centre (feet at bottom, centred horizontally)
 *   4. Save as PNG with full alpha channel
 *
 * Usage:
 *   node normalize-fighters.js
 *   node normalize-fighters.js --dry-run
 *   node normalize-fighters.js --input ../path/to/cutouts --output ../assets/card
 */

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

// ── Configuration ─────────────────────────────────────────────────────────────
// Adjust these to taste. Paths are relative to this script file.

const CONFIG = {
  // Drop Adobe Express exports here before running
  inputDir: './input',

  // Normalized files land here — review before copying to assets/card
  outputDir: './output',

  // Canvas size. Existing card characters are 1254×1254.
  canvasWidth:  1254,
  canvasHeight: 1254,

  // Fighter is resized to this height before padding.
  // Leaves (canvasHeight - targetHeight) = 74px of breathing room above the head.
  // Decrease to give more headroom; increase to make the fighter taller on the card.
  targetHeight: 1180,

  // Trim threshold (0–255). Pixels with alpha ≤ this value are treated as transparent.
  // Raise to 10–20 if Adobe Express leaves a faint fringe.
  trimThreshold: 0,
};

// ─────────────────────────────────────────────────────────────────────────────

async function normalizeOne(srcPath, dstPath, cfg, dryRun) {
  // Step 1 — trim transparent edges
  const trimBuf = await sharp(srcPath)
    .trim({ threshold: cfg.trimThreshold })
    .toBuffer({ resolveWithObject: true });

  const { width: trimW, height: trimH } = trimBuf.info;

  if (trimW === 0 || trimH === 0) {
    throw new Error('Image is fully transparent after trim — is the background already removed?');
  }

  // Step 2 — resize to fit inside (canvasWidth × targetHeight), no distortion
  const fitBuf = await sharp(trimBuf.data)
    .resize({
      width:  cfg.canvasWidth,
      height: cfg.targetHeight,
      fit:    'inside',           // preserves aspect ratio, never exceeds either dimension
      withoutEnlargement: false,  // allow upscaling small source files
    })
    .toBuffer({ resolveWithObject: true });

  const { width: fitW, height: fitH } = fitBuf.info;

  // Step 3 — pad to full canvas, fighter anchored bottom-centre
  const padTop   = cfg.canvasHeight - fitH;   // space above fighter's head
  const padTotal = cfg.canvasWidth  - fitW;
  const padLeft  = Math.floor(padTotal / 2);
  const padRight = padTotal - padLeft;         // absorbs any odd pixel

  if (!dryRun) {
    fs.mkdirSync(path.dirname(dstPath), { recursive: true });

    await sharp(fitBuf.data)
      .extend({
        top:    Math.max(0, padTop),
        bottom: 0,
        left:   Math.max(0, padLeft),
        right:  Math.max(0, padRight),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(dstPath);
  }

  return { trimW, trimH, fitW, fitH };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const flag = name => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; };
  return {
    inputDir:  flag('--input')  || CONFIG.inputDir,
    outputDir: flag('--output') || CONFIG.outputDir,
    dryRun:    args.includes('--dry-run'),
  };
}

async function run() {
  const { inputDir, outputDir, dryRun } = parseArgs();
  const cfg = CONFIG;

  const absIn  = path.resolve(__dirname, inputDir);
  const absOut = path.resolve(__dirname, outputDir);

  if (!fs.existsSync(absIn)) {
    console.error(`\n  Input folder not found: ${absIn}`);
    console.error(`  Create it and drop your background-removed PNGs inside.\n`);
    process.exit(1);
  }

  const files = fs.readdirSync(absIn).filter(f => /\.png$/i.test(f)).sort();

  if (files.length === 0) {
    console.log(`\n  No .png files found in ${absIn}\n`);
    return;
  }

  const COL = { file: 46, dims: 14 };
  const ruler = '─'.repeat(COL.file + COL.dims * 2 + 20);

  console.log(`\nCanvas:       ${cfg.canvasWidth} × ${cfg.canvasHeight} px`);
  console.log(`Target height: ${cfg.targetHeight} px  (${cfg.canvasHeight - cfg.targetHeight}px headroom above fighter)`);
  console.log(`Input:        ${absIn}`);
  console.log(`Output:       ${absOut}`);
  if (dryRun) console.log('\n(DRY RUN — nothing written)');
  console.log(`\n${'File'.padEnd(COL.file)} ${'Trimmed'.padEnd(COL.dims)} ${'Fitted'.padEnd(COL.dims)} Output`);
  console.log(ruler);

  let ok = 0, errs = 0;

  for (const file of files) {
    const src = path.join(absIn,  file);
    const dst = path.join(absOut, file);
    try {
      const { trimW, trimH, fitW, fitH } = await normalizeOne(src, dst, cfg, dryRun);
      console.log(
        `  ${file.padEnd(COL.file - 2)} ` +
        `${(trimW + '×' + trimH).padEnd(COL.dims)} ` +
        `${(fitW  + '×' + fitH ).padEnd(COL.dims)} ` +
        `${cfg.canvasWidth}×${cfg.canvasHeight}`
      );
      ok++;
    } catch (e) {
      console.error(`  ERR  ${file}: ${e.message}`);
      errs++;
    }
  }

  console.log(ruler);
  console.log(`Done: ${ok} normalized${errs ? `, ${errs} error(s)` : ''}.`);
  if (!dryRun && ok > 0) console.log(`Files written to: ${absOut}\n`);
}

run().catch(e => { console.error(e); process.exit(1); });
