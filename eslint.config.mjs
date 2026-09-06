import withNuxt from './.nuxt/eslint.config.mjs';

export default withNuxt(
  {
    rules: {
      semi: ['error', 'always'],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
