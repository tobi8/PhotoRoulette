import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.photoroulette.app',
  appName: 'PhotoRoulette',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // Custom native plugin configs if needed
  },
}

export default config
