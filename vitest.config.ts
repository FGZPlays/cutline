import { defineConfig } from 'vitest/config';

// The app's React plugin is not needed by these core-module tests. Omitting it
// here avoids incompatible Plugin types when Vitest resolves its own nested
// Vite copy during clean installs (such as Netlify builds).
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
