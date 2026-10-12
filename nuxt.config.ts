export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: false },
  css: ['maplibre-gl/dist/maplibre-gl.css', '~/assets/main.css'],
  app: {
    head: {
      title: 'States — Geopolitics in Real Time',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#05080f' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap' },
      ],
    },
  },
  nitro: {
    experimental: { websocket: true },
    typescript: { tsConfig: { compilerOptions: { noUncheckedIndexedAccess: false } } },
  },
  vite: { optimizeDeps: { include: ['h3-js', 'maplibre-gl'] } },
  typescript: {
    // the simulation is array-index heavy; per-access undefined checks add noise, not safety
    tsConfig: { compilerOptions: { noUncheckedIndexedAccess: false } },
    sharedTsConfig: { compilerOptions: { noUncheckedIndexedAccess: false } },
    nodeTsConfig: { compilerOptions: { noUncheckedIndexedAccess: false } },
  },
})
