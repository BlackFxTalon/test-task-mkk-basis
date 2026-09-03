export default defineNuxtConfig({
  compatibilityDate: '2026-09-02',
  ssr: false,
  devtools: { enabled: false },
  modules: ['@pinia/nuxt', '@nuxt/eslint'],
  css: ['@fontsource-variable/inter', '~/assets/styles/main.scss'],
  typescript: {
    strict: true,
    typeCheck: true,
  },
  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'Заметки',
      meta: [
        { name: 'description', content: 'Локальное приложение для заметок со списками задач' },
        { name: 'theme-color', content: '#009ddd' },
      ],
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
})
