#!/usr/bin/env node
'use strict';
/**
 * process-fighters.js
 *
 * Full pipeline: background removal (rembg) → trim/resize/pad (normalize-fighters.js)
 *
 * Usage:  npm run process   (from tools/)
 *
 * Drop images into:  tools/raw/
 * Finished files in: tools/output/   ← copy these to assets/card/
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const TOOLS  = __dirname;
const RAW    = path.join(TOOLS, 'raw');
const BGTMP  = path.join(TOOLS, 'bg-removed');
const OUTPUT = path.join(TOOLS, 'output');
const VENV   = path.join(TOOLS, '.venv');

const isWin   = process.platform === 'win32';
const VENV_PY  = isWin ? path.join(VENV, 'Scripts', 'python.exe')  : path.join(VENV, 'bin', 'python3');
const VENV_PIP = isWin ? path.join(VENV, 'Scripts', 'pip.exe')     : path.join(VENV, 'bin', 'pip');

// ── Helpers ───────────────────────────────────────────────────────────────────

function run(bin, args, opts) {
  const r = spawnSync(bin, args, { stdio: 'inherit', ...opts });
  if (r.error) { console.error(`\n  Could not start: ${bin}\n  ${r.error.message}\n`); process.exit(1); }
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function findSystemPython() {
  for (const cmd of ['python', 'python3', 'py']) {
    const r = spawnSync(cmd, ['--version'], { stdio: 'pipe' });
    if (r.status === 0) return cmd;
  }
  return null;
}

// ── One-time setup ────────────────────────────────────────────────────────────

function ensureVenv() {
  if (fs.existsSync(VENV_PY)) return;   // already installed

  const sysPy = findSystemPython();
  if (!sysPy) {
    console.error('\n  Python not found. Install Python 3.8+ from https://python.org then run again.\n');
    process.exit(1);
  }

  const ver = spawnSync(sysPy, ['--version'], { stdio: 'pipe' });
  const verStr = (ver.stdout.toString() + ver.stderr.toString()).trim();
  console.log(`\nFirst-time setup using ${verStr}`);
  console.log('Creating virtual environment in tools/.venv/ ...');
  run(sysPy, ['-m', 'venv', VENV]);

  console.log('Installing rembg — this may take a minute...');
  run(VENV_PIP, ['install', '--quiet', 'rembg[cpu]']);
  console.log('Setup complete.\n');
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

function main() {
  ensureVenv();

  // Create raw/ if it doesn't exist yet and bail with a helpful message
  if (!fs.existsSync(RAW)) {
    fs.mkdirSync(RAW, { recursive: true });
    console.log('\n  Created tools/raw/');
    console.log('  Drop your ChatGPT images there (PNG / JPG / WEBP) and run again.\n');
    return;
  }

  const images = fs.readdirSync(RAW).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
  if (images.length === 0) {
    console.log('\n  tools/raw/ is empty — drop your ChatGPT images there and run again.\n');
    return;
  }

  fs.mkdirSync(BGTMP,  { recursive: true });
  fs.mkdirSync(OUTPUT, { recursive: true });

  // Step 1 — remove backgrounds
  console.log('\n── Step 1 / 2  Background removal ───────────────────────────────────────────');
  console.log(`  ${images.length} image(s) in tools/raw/\n`);
  run(VENV_PY, [path.join(TOOLS, 'remove_bg.py'), RAW, BGTMP]);

  // Step 2 — trim, resize, pad
  console.log('\n── Step 2 / 2  Normalizing (trim → resize → pad) ────────────────────────────\n');
  run(process.execPath, [
    path.join(TOOLS, 'normalize-fighters.js'),
    '--input',  BGTMP,
    '--output', OUTPUT,
  ]);

  console.log('─'.repeat(80));
  console.log('  All done.  Game-ready files are in  tools/output/');
  console.log('  Copy them to  assets/card/  when you\'re happy with them.\n');
}

main();
