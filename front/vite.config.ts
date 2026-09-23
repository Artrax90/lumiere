import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import { fileURLToPath, URL } from 'node:url';
import { readdirSync, unlinkSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const isTizen = process.env.VITE_BUILD_MODE === 'tizen';

// Plugin to clean up modern bundles for Tizen
function tizenCleanup() {
  let resolvedOutDir = 'dist';
  return {
    name: 'tizen-cleanup',
    configResolved(config: any) {
      resolvedOutDir = config.build.outDir || 'dist';
    },
    closeBundle() {
      if (!isTizen) return;

      const assetsDir = join(resolvedOutDir, 'assets');
      try {
        if (!existsSync(assetsDir)) return;
        const files = readdirSync(assetsDir);

        // Remove modern JS bundles (keep only legacy and polyfills)
        for (const file of files) {
          if (file.endsWith('.js') && !file.includes('legacy') && !file.includes('polyfills')) {
            unlinkSync(join(assetsDir, file));
            console.log(`  [tizen] removed modern JS: ${file}`);
          }
        }

        // Fix index.html to only reference legacy bundles
        const indexPath = join(resolvedOutDir, 'index.html');
        if (!existsSync(indexPath)) return;
        let html = readFileSync(indexPath, 'utf-8');

        // Remove module script tags
        html = html.replace(/<script[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g, '');
        html = html.replace(/<script[^>]*nomodule[^>]*>/g, '<script>');
        html = html.replace(/crossorigin\s*/g, '');

        // Dynamically find legacy polyfill and entry files
        const polyfillFile = files.find(f => f.includes('polyfills') && f.endsWith('.js'));
        const indexLegacyFile = files.find(f => f.includes('index') && f.includes('legacy') && f.endsWith('.js'));

        if (polyfillFile) {
          html = html.replace(
            '</head>',
            `  <script src="./assets/${polyfillFile}"></script>\n  </head>`
          );
        }
        if (indexLegacyFile) {
          html = html.replace(
            '</body>',
            `  <script src="./assets/${indexLegacyFile}"></script>\n  </body>`
          );
        }

        writeFileSync(indexPath, html);
        console.log(`  [tizen] cleaned index.html with ${polyfillFile} and ${indexLegacyFile}`);
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
      tizenCleanup(),
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
