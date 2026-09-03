<template>
  <header class="app-header">
    <div class="app-header__content">
      <NuxtLink class="brand" to="/" aria-label="Заметки — на главную">
        <img class="brand__logo" src="/logo.png" width="40" height="40" alt="">
        <span class="brand__name">Заметки</span>
      </NuxtLink>

      <ThemeSwitcher />
    </div>
  </header>
</template>

<style scoped lang="scss">
.app-header {
  position: sticky;
  z-index: 10;
  top: 0;
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-background) 88%, transparent);
  backdrop-filter: blur(16px);

  &__content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: min(100% - 2rem, var(--content-width));
    min-height: 4.5rem;
    margin-inline: auto;
  }
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--color-text);
  text-decoration: none;

  &__logo {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    box-shadow: var(--shadow-logo);
  }

  &__name {
    font-size: 1.125rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
}

@media (max-width: 36rem) {
  .app-header__content {
    flex-wrap: wrap;
    padding-block: 0.75rem;
  }
}
</style>
