import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const DESCRIPTION = 'Track the food you have at home and use it before it goes bad.';

// Pages that only make sense when signed in. They are kept out of search results.
const PRIVATE_PATHS = ['/scan', '/add', '/item/', '/check', '/recipes', '/stats', '/settings', '/onboarding', '/reset-password'];
const PUBLIC_PATHS = ['/', '/guide', '/signup', '/signin'];

/**
 * Site files that depend on where the build is deployed:
 * - robots.txt, sitemap.xml and llms.txt (written into dist/; llms.txt comes from site/llms.txt),
 * - absolute Open Graph / Twitter URLs and a preconnect to Supabase in index.html.
 * The site URL comes from SITE_URL, or from Netlify's URL (production) / DEPLOY_PRIME_URL (previews).
 * Netlify deploy previews and branch deploys are marked "Disallow: /" so only production is indexed.
 */
function siteFiles(env: Record<string, string>): Plugin {
  const context = env.CONTEXT; // set by Netlify: production | deploy-preview | branch-deploy | dev
  const siteUrl = (env.SITE_URL || (context === 'production' ? env.URL : env.DEPLOY_PRIME_URL) || env.URL || '').replace(/\/+$/, '');
  const indexable = context ? context === 'production' : true;
  const abs = (p: string) => (siteUrl ? `${siteUrl}${p}` : p);

  return {
    name: 'fridgewise-site-files',
    transformIndexHtml() {
      const meta = (attrs: Record<string, string>): HtmlTagDescriptor => ({ tag: 'meta', attrs, injectTo: 'head' });
      const tags: HtmlTagDescriptor[] = [
        meta({ property: 'og:type', content: 'website' }),
        meta({ property: 'og:site_name', content: 'FridgeWise' }),
        meta({ property: 'og:title', content: 'FridgeWise' }),
        meta({ property: 'og:description', content: DESCRIPTION }),
        meta({ property: 'og:image', content: abs('/og-image.png') }),
        meta({ property: 'og:image:width', content: '1200' }),
        meta({ property: 'og:image:height', content: '630' }),
        meta({ property: 'og:image:alt', content: 'The FridgeWise logo: an open fridge with a glowing brain inside.' }),
        meta({ name: 'twitter:card', content: 'summary_large_image' }),
        meta({ name: 'twitter:title', content: 'FridgeWise' }),
        meta({ name: 'twitter:description', content: DESCRIPTION }),
        meta({ name: 'twitter:image', content: abs('/og-image.png') }),
      ];
      if (siteUrl) tags.push(meta({ property: 'og:url', content: `${siteUrl}/` }));
      if (!indexable) tags.push(meta({ name: 'robots', content: 'noindex' }));
      if (env.VITE_SUPABASE_URL) {
        // Start the TLS handshake with Supabase while the app is still loading.
        tags.push({ tag: 'link', attrs: { rel: 'preconnect', href: new URL(env.VITE_SUPABASE_URL).origin, crossorigin: '' }, injectTo: 'head' });
      }
      return tags;
    },
    generateBundle() {
      const robots = indexable
        ? ['User-agent: *', ...PRIVATE_PATHS.map((p) => `Disallow: ${p}`), ...(siteUrl ? ['', `Sitemap: ${siteUrl}/sitemap.xml`] : [])]
        : ['# Preview deploy: not for search engines.', 'User-agent: *', 'Disallow: /'];
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots.join('\n') + '\n' });

      // llms.txt (https://llmstxt.org): a plain-language summary of the app for AI assistants.
      const llms = fs.readFileSync(path.resolve(import.meta.dirname, 'site/llms.txt'), 'utf8').replaceAll('{{SITE_URL}}', siteUrl);
      this.emitFile({ type: 'asset', fileName: 'llms.txt', source: llms });

      if (siteUrl && indexable) {
        const urls = PUBLIC_PATHS.map((p) => `  <url><loc>${siteUrl}${p}</loc></url>`).join('\n');
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>;
  return {
    plugins: [
      react(),
      tailwindcss(),
      siteFiles(env),
      VitePWA({
        // Custom service worker (src/sw.ts): precached app shell + Web Push handlers.
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: ['favicon.ico', 'icons/*.png', 'brand/*.png'],
        manifest: {
          id: '/',
          name: 'FridgeWise',
          short_name: 'FridgeWise',
          description: DESCRIPTION,
          lang: 'en',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#FFFFFF',
          theme_color: '#6BAA75',
          categories: ['food', 'lifestyle', 'productivity'],
          icons: [
            { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          // Shown in the richer install dialog (Chrome, Edge). Not precached.
          screenshots: [
            {
              src: '/screenshots/dashboard-narrow.webp',
              sizes: '720x1560',
              type: 'image/webp',
              form_factor: 'narrow',
              label: 'Your food sorted by what to use first',
            },
            {
              src: '/screenshots/dashboard-wide.webp',
              sizes: '1440x900',
              type: 'image/webp',
              form_factor: 'wide',
              label: 'Dashboard with items to use today and soon',
            },
          ],
          shortcuts: [
            { name: 'Scan a receipt', short_name: 'Scan', url: '/scan?type=receipt', icons: [{ src: '/icons/pwa-192.png', sizes: '192x192' }] },
            { name: 'Add an item', short_name: 'Add', url: '/add', icons: [{ src: '/icons/pwa-192.png', sizes: '192x192' }] },
            { name: 'Do I have it?', short_name: 'Check', url: '/check', icons: [{ src: '/icons/pwa-192.png', sizes: '192x192' }] },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
          // Only for link previews and search engines; not needed offline.
          globIgnores: ['og-image.png', 'screenshots/**', 'robots.txt', 'sitemap.xml', 'humans.txt', 'llms.txt'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        },
        devOptions: { enabled: false },
      }),
    ],
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'charts';
            if (id.includes('node_modules/@supabase')) return 'supabase';
            return undefined;
          },
        },
      },
    },
  };
});
