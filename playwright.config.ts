import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: process.env.BASE_URL || 'https://script.serienwerft.studio',
    extraHTTPHeaders: {
      'Accept': 'application/json',
    },
  },
  projects: [
    {
      name: 'api',
      use: {},
    },
  ],
})
