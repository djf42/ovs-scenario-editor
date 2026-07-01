'use strict';
/**
 * notarize.js
 * Called automatically by electron-builder after signing (via "afterSign" in package.json).
 * Submits the app to Apple's notary service and waits for approval.
 *
 * Required environment variables (set in your shell before running npm run dist-mac):
 *   APPLE_ID                  – your Apple ID email, e.g. djfletch42@gmail.com
 *   APPLE_APP_SPECIFIC_PASSWORD – app-specific password from appleid.apple.com
 *   APPLE_TEAM_ID             – your 10-character Team ID from developer.apple.com → Account → Membership
 */

const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize on macOS builds
  if (electronPlatformName !== 'darwin') return;

  // Skip if credentials aren't set (e.g. during development builds)
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.warn('⚠️  Skipping notarization: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID not set.');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`\n🔏 Notarizing ${appName} — this may take a few minutes...`);

  await notarize({
    tool:            'notarytool',
    appBundleId:     'com.openvetsim.editor',
    appPath,
    appleId:         process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId:          process.env.APPLE_TEAM_ID
  });

  console.log(`✅ Notarization complete for ${appName}`);
};
