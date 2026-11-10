import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// Het vangnet dat react-scripts eerst in de build meebracht: een tikfout in een
// variabelenaam (`no-undef`) laat de uitrol vallen in plaats van live te gaan.
// Vite doet dat niet, dus draait `npm run lint` als eigen stap in de uitrol.
// Alleen `no-undef` is een fout; de rest waarschuwt. Zelfde set als ctfcrm.
export default [
  { ignores: ['build/**', 'node_modules/**', '*.config.js'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'after-used', ignoreRestSiblings: true, varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
      'no-empty': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
