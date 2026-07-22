import type { CapacitorConfig } from '@capacitor/cli'

// Platforms (ios/android) get added in the Capacitor pass (Phase 8):
//   npx cap add ios && npx cap add android
// Until then this config just pins identity + webDir for the web build.
const config: CapacitorConfig = {
  appId: 'league.hoopshoot.app',
  appName: 'Hoop Shoot League',
  webDir: 'dist',
  backgroundColor: '#7ec8f3',
}

export default config
