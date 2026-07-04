'use strict';
/**
 * sign-windows.js
 * Custom signing script for electron-builder on Windows.
 * Uses signtool.exe with the EV certificate stored on a YubiKey hardware token.
 * The YubiKey Smart Card Minidriver must be installed so Windows can see the token.
 *
 * Required environment variable (set before running npm run dist-win):
 *   WIN_CERT_SUBJECT_NAME – the Organization name on your EV cert,
 *                           e.g. "OpenVetSim LLC"
 *                           (must match exactly what's on the certificate)
 */

const { execSync } = require('child_process');
const path         = require('path');

exports.default = async function(configuration) {
  const filePath = configuration.path;

  // Only sign executables — skip DLLs (Electron/Chromium runtime libs that
  // don't affect SmartScreen reputation and would otherwise each require a PIN prompt)
  if (!filePath.endsWith('.exe')) return;

  const certName = process.env.WIN_CERT_SUBJECT_NAME;
  if (!certName) {
    console.warn('⚠️  Skipping Windows signing: WIN_CERT_SUBJECT_NAME not set.');
    return;
  }

  const timestampServer = 'http://timestamp.sectigo.com';

  const cmd = [
    'signtool', 'sign',
    '/n', `"${certName}"`,   // find cert by subject name in Windows cert store
    '/fd', 'sha256',         // file digest algorithm
    '/tr', timestampServer,  // RFC 3161 timestamp server
    '/td', 'sha256',         // timestamp digest algorithm
    `"${filePath}"`
  ].join(' ');

  console.log(`🔏 Signing: ${path.basename(filePath)}`);
  execSync(cmd, { stdio: 'inherit' });
};
