<script setup lang="ts">
const themeOptions = [
  { value: 'system', label: 'Системная' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
] as const

const { theme, setTheme } = useTheme()
</script>

<template>
  <div class="theme-switcher" :data-theme="theme">
    <span class="theme-switcher__indicator" />
    <button
      v-for="option in themeOptions"
      :key="option.value"
      class="theme-switcher__option"
      :class="{ 'theme-switcher__option--active': theme === option.value }"
      type="button"
      :title="option.label"
      @click="setTheme(option.value)"
    >
      <span class="visually-hidden">{{ option.label }}</span>
      <svg
        v-if="option.value === 'system'"
        class="theme-switcher__icon"
        viewBox="0 0 24 24"
      >
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
      <svg
        v-else-if="option.value === 'light'"
        class="theme-switcher__icon"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </svg>
      <svg
        v-else
        class="theme-switcher__icon"
        viewBox="0 0 24 24"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
      </svg>
    </button>
  </div>
</template>

<style scoped lang="scss">
.theme-switcher {
  --theme-option-size: #{to-rem(44px)};
  --theme-option-gap: #{to-rem(4px)};

  position: relative;
  display: inline-grid;
  grid-template-columns: repeat(3, var(--theme-option-size));
  gap: var(--theme-option-gap);
  @include rem(padding, 4px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface-muted);

  &__indicator {
    position: absolute;
    @include rem(top, 4px);
    @include rem(left, 4px);
    width: var(--theme-option-size);
    height: var(--theme-option-size);
    border-radius: var(--radius-pill);
    background: var(--color-accent);
    box-shadow: var(--shadow-control);
    pointer-events: none;
    transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
  }

  &[data-theme='light'] &__indicator {
    transform: translate3d(calc(var(--theme-option-size) + var(--theme-option-gap)), 0, 0);
  }

  &[data-theme='dark'] &__indicator {
    transform: translate3d(
      calc(
        var(--theme-option-size) + var(--theme-option-gap) +
        var(--theme-option-size) + var(--theme-option-gap)
      ),
      0,
      0
    );
  }

  &__option {
    position: relative;
    z-index: 1;
    display: grid;
    min-width: var(--theme-option-size);
    min-height: var(--theme-option-size);
    @include rem(padding, 8px);
    place-items: center;
    border: 0;
    border-radius: var(--radius-pill);
    color: var(--color-text-muted);
    background: transparent;
    cursor: pointer;
    font: inherit;
    transition: color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;

    &--active {
      color: var(--color-on-accent);
    }

    &:hover:not(.theme-switcher__option--active) {
      color: var(--color-text);
      background: var(--color-surface);
    }
  }

  &__icon {
    @include rem(width, 20px);
    @include rem(height, 20px);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}
</style>
