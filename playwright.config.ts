// @ts-nocheck
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 }
  }
});
