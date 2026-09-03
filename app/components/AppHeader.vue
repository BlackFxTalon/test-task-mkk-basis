<template>
  <header class="app-header">
    <div class="app-header__content">
      <NuxtLink class="brand" to="/" aria-label="Заметки — на главную">
        <img class="brand__logo" src="/logo.png" width="40" height="40" alt="лого">
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
    @include rem(gap, 16px);
    width: min(100% - #{to-rem(32px)}, var(--content-width));
    @include rem(min-height, 72px);
    margin-inline: auto;
  }
}

.brand {
  display: inline-flex;
  align-items: center;
  @include rem(gap, 12px);
  color: var(--color-text);
  text-decoration: none;

  &__logo {
    @include rem(width, 40px);
    @include rem(height, 40px);
    border-radius: 50%;
    box-shadow: var(--shadow-logo);
  }

  &__name {
    @include rem(font-size, 18px);
    font-weight: 800;
    letter-spacing: -0.02em;
  }
}

@media (max-width: #{to-rem(576px)}) {
  .app-header__content {
    flex-wrap: wrap;
    @include rem(padding-block, 12px);
  }
}
</style>
