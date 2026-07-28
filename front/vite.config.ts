import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import { fileURLToPath, URL } from 'node:url';
import { readdirSync, unlinkSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const isTizen = process.env.VITE_BUILD_MODE === 'tizen';

// Plugin to clean up modern bundles for Tizen
function tizenCleanup(outDir: string) {
  return {
    name: 'tizen-cleanup',
    closeBundle() {
      if (!isTizen) return;

      const assetsDir = join(outDir, 'assets');
      try {
        const files = readdirSync(assetsDir);

        // Remove modern JS bundles (keep only legacy and polyfills)
        for (const file of files) {
          if (file.endsWith('.js') && !file.includes('legacy') && !file.includes('polyfills')) {
            unlinkSync(join(assetsDir, file));
            console.log(`  [tizen] removed modern JS: ${file}`);
          }
        }

        // Fix index.html to only reference legacy bundles
        const indexPath = join(outDir, 'index.html');
        let html = readFileSync(indexPath, 'utf-8');

        // Remove module script tags
        html = html.replace(/<script[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g, '');
        html = html.replace(/<script[^>]*nomodule[^>]*>/g, '<script>');
        html = html.replace(/crossorigin\s*/g, '');

        // Add legacy polyfill and entry directly
        html = html.replace(
          '</head>',
          `  <script src="./assets/polyfills-legacy-DjnBGcum.js"></script>\n  </head>`
        );
        html = html.replace(
          '</body>',
          `  <script src="./assets/index-legacy-CckyA1MS.js"></script>\n  </body>`
        );

        writeFileSync(indexPath, html);
        console.log('  [tizen] cleaned index.html for legacy-only loading');
      } catch (e) {
        console.error('  [tizen] cleanup error:', e);
      }
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    ...(isTizen ? [
      legacy({
        targets: ['chrome 56'],
        additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
        renderLegacyChunks: true,
        modernPolyfills: false,
      }),
    ] : []),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  ...(isTizen && {
    base: './',
    build: {
      outDir: '../back/public',
      emptyOutDir: true,
      cssTarget: 'chrome56',
    },
  }),
});
