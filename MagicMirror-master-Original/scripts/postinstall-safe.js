#!/usr/bin/env node
/**
 * Safe postinstall script for MagicMirror when not inside a git repository.
 * Original script uses: git clean -df fonts vendor
 * We only execute that if a .git folder is present; otherwise we just ensure directories exist.
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function safeClean() {
  const repoRoot = process.cwd();
  const gitDir = path.join(repoRoot, '.git');
  if (fs.existsSync(gitDir)) {
    try {
      execSync('git clean -df fonts vendor', { stdio: 'inherit' });
    } catch (e) {
      console.warn('[postinstall-safe] git clean failed:', e.message);
    }
  } else {
    // Ensure fonts/vendor directories exist (some modules may expect them)
    ['fonts', 'vendor'].forEach(dir => {
      const full = path.join(repoRoot, dir);
      if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
    });
    console.log('[postinstall-safe] Not a git repo; skipped git clean.');
  }
}

safeClean();
