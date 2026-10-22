import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.scoreline.manager',
  appName: 'Scoreline Manager',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
}

export default config
