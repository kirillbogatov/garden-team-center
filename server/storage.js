'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function resolveDesktopDir() {
  if (process.platform === 'win32') {
    try {
      const value = execFileSync('powershell.exe', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"], {
        encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (value) return value;
    } catch (_) {}
  }
  return path.join(os.homedir(), 'Desktop');
}

function resolveDataDir() {
  const configured = String(process.env.GARDEN_DATA_DIR || '').trim();
  return configured ? path.resolve(configured) : path.join(resolveDesktopDir(), 'GardenData');
}

const DATA_DIR = resolveDataDir();
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

module.exports = { DATA_DIR, UPLOADS_DIR, resolveDesktopDir };
