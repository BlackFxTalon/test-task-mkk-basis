export default defineNuxtConfig({
  compatibilityDate: '2026-09-02',
  ssr: false,
  devtools: { enabled: false },
  modules: ['@pinia/nuxt', '@nuxt/eslint', '@vite-pwa/nuxt'],
  pwa: {
    strategies: 'injectManifest',
    registerType: 'autoUpdate',
    filename: 'sw.js',
    // В Nuxt 4 vite-root — srcDir (app/), поэтому публичный каталог источника SW
    // задаётся относительно него: проектный public/ с написанным вручную sw.js.
    srcDir: '../public',
    // Манифестом владеет репозиторий (public/manifest.webmanifest из тикета 11),
    // генерацию модуля отключаем; иконки и логотип прецикшируются через globPatterns
    // (globDirectory = .output/public, ревизии считаются workbox-build по содержимому).
    manifest: false,

    injectManifest: {
      // index.html и манифест прецикшируются workbox-build: ревизия считается по
      // содержимому собранного файла, поэтому новая сборка обновляет SW.
      globPatterns: ['index.html', 'manifest.webmanifest', 'pwa-icons/*.png', 'logo.png'],
    },
  },
  components: [
    { path: '~/components/NoteEditor', pathPrefix: false },
    '~/components',
  ],
  css: ['@fontsource-variable/inter', '~/assets/styles/main.scss'],
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: '@use "~/assets/styles/units" as *;',
        },
      },
    },
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
  experimental: {
    viewTransition: true,
  },
  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'Заметки',
      meta: [
        { name: 'description', content: 'Локальное приложение для заметок со списками задач' },
        { name: 'theme-color', content: '#009ddd' },
      ],
      link: [{ rel: 'manifest', href: '/manifest.webmanifest' }],
      script: [
        {
          innerHTML: `(function () {
            try {
              var theme = localStorage.getItem('notes-theme');
              var mode = theme === 'light' || theme === 'dark' ? theme : 'system';
              document.documentElement.style.colorScheme = mode === 'system' ? 'light dark' : mode;
              document.documentElement.dataset.theme = mode;
            } catch (_) {
              document.documentElement.style.colorScheme = 'light dark';
              document.documentElement.dataset.theme = 'system';
            }
          })();`,
          tagPosition: 'head',
        },
      ],
    },
  },
});
