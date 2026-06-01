#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');

const PLUGIN = '[homebridge-garage-piface]';

// ── Config migration: accessory (v2) → platform (v3) ─────────────────────────

const candidates = [
  '/var/lib/homebridge/config.json',
  require('path').join(os.homedir(), '.homebridge', 'config.json'),
];

for (const configPath of candidates) {
  if (!fs.existsSync(configPath)) continue;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    continue;
  }

  if (!Array.isArray(config.accessories)) continue;

  const legacy = config.accessories.filter(a => a.accessory === 'GaragePiFace');
  if (legacy.length === 0) continue;

  config.accessories = config.accessories.filter(a => a.accessory !== 'GaragePiFace');

  if (!Array.isArray(config.platforms)) config.platforms = [];

  if (!config.platforms.some(p => p.platform === 'GaragePiFace')) {
    const devices = legacy.map(({ accessory, name, ...rest }) => ({ name: name || 'Garage Door', ...rest }));
    config.platforms.push({ platform: 'GaragePiFace', name: 'Garage PiFace', accessories: devices });
  }

  try {
    fs.writeFileSync(configPath + '.v2.backup', fs.readFileSync(configPath));
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    console.log(`${PLUGIN} Config migrated: accessory → platform (backup: ${configPath}.v2.backup)`);
    console.log(`${PLUGIN} ⚠️  Run 'sudo hb-service restart' to apply.`);
  } catch (e) {
    console.warn(`${PLUGIN} Could not write migrated config: ${e.message}`);
  }
  break;
}
