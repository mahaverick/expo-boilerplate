/**
 * @file Rules Oxlint cannot run yet. No type information: typed rules run in Oxlint.
 * CommonJS, like babel.config.js and metro.config.js, because package.json sets no
 * `type` and Metro loads those two with require().
 */
const fs = require('node:fs')
const path = require('node:path')
const { fixupPluginRules } = require('@eslint/compat')
const checkFile = require('eslint-plugin-check-file')
const jsdoc = require('eslint-plugin-jsdoc')
const reactNative = require('eslint-plugin-react-native')
const tseslint = require('typescript-eslint')
const { commentStyleRule } = require('./scripts/comment-style.mjs')

const SLEEP_MESSAGE =
  'Wait on a condition, not a duration: findBy*/waitFor, fake timers, or a settle helper that names what cannot be observed.'

/**
 * A Tailwind palette class, such as `bg-red-500`, `text-white` or
 * `border-slate-950/50`, anywhere in a string, as an esquery regex.
 */
const PALETTE_CLASS =
  '/(^|[\\s:])-?(bg|text|border|border-[trblxyse]|divide|outline|ring|ring-offset|fill|stroke|shadow|decoration|accent|caret|placeholder|from|via|to)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}([\\s\\x2f]|$)|(^|[\\s:])(bg|text|border|divide|outline|ring|fill|stroke|shadow|decoration|accent|caret|placeholder|from|via|to)-(black|white)([\\s\\x2f]|$)/'
const PALETTE_MESSAGE =
  'Use a STYLESEED token class (bg-background, text-primary-foreground), not a Tailwind palette class. The tokens are in STYLESEED.md.'

/** A colour literal: a hex colour, or a CSS colour function such as `rgb(` or `oklch(`. */
const COLOUR_LITERAL =
  '/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$|(^|[^a-zA-Z-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\\(/'
/**
 * A Tailwind arbitrary-value colour, such as `bg-[#ff0000]`,
 * `text-[color:#fff]`, `bg-[oklch(0.5_0.1_20)]` or `[color:rgb(0_0_0)]`,
 * anywhere in a string. Tailwind generates these whatever the palette holds.
 */
const ARBITRARY_COLOUR =
  '/(^|[\\s:])(-?[a-z0-9-]+-)?\\[([a-z-]+:)?(#|(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\\()/'
const COLOUR_MESSAGE =
  'Use a STYLESEED token class (bg-background, text-foreground), not a colour literal. The tokens are in STYLESEED.md.'

/**
 * Every named function, method and class; inline callbacks and constructors
 * are exempt by construction.
 */
const NAMED_FUNCTIONS = [
  'FunctionDeclaration',
  'TSDeclareFunction',
  'ClassDeclaration',
  'MethodDefinition:not([kind="constructor"]):not([value.body=null])',
  'TSAbstractMethodDefinition',
  'VariableDeclarator > ArrowFunctionExpression',
  'VariableDeclarator > FunctionExpression',
  'PropertyDefinition > ArrowFunctionExpression',
]
/** Named functions plus interfaces, type aliases and exported consts. */
const JSDOC_CONTEXTS = [
  ...NAMED_FUNCTIONS,
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'ExportNamedDeclaration[declaration.type="VariableDeclaration"]',
]

/**
 * The paths react's shared-core.json gives expo. They are copies of react's
 * files and never edited here, so the expo-only rules skip them; every other
 * rule still applies. A missing manifest means no shared rows.
 * @returns Repo-relative paths whose app list includes expo.
 */
function sharedExpoRows() {
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'shared-core.json'), 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  return [manifest.files, manifest.tests].flatMap((rows) =>
    Object.entries(rows ?? {})
      .filter(([, apps]) => Array.isArray(apps) && apps.includes('expo'))
      .map(([file]) => file)
  )
}

module.exports = tseslint.config(
  { ignores: ['dist', 'coverage', '.expo'] },
  { files: ['**/*.{ts,tsx,mts,cts}'], languageOptions: { parser: tseslint.parser } },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  {
    /**
     * Expo-only rules, over the files expo owns. In production Babel strips
     * console calls (babel.config.js); in development they are noise.
     */
    files: ['src/**/*.{ts,tsx}'],
    ignores: sharedExpoRows(),
    plugins: { 'react-native': fixupPluginRules(reactNative) },
    rules: {
      'no-console': 'error',
      'react-native/no-unused-styles': 'error',
      'react-native/no-inline-styles': 'error',
      'react-native/no-raw-text': 'error',
      'react-native/no-single-element-style-arrays': 'error',
      'react-native/split-platform-components': 'error',
    },
  },
  {
    /**
     * The design lock (STYLESEED.md), over the files expo owns. Colours come
     * from the STYLESEED tokens through NativeWind classes such as
     * `bg-background`, so a Tailwind palette class and a colour literal are
     * both errors. The shared rows are react's copies, so the rule skips them.
     */
    files: ['src/**/*.{ts,tsx}'],
    ignores: sharedExpoRows(),
    rules: {
      'no-restricted-syntax': [
        'error',
        ...['Literal', 'TemplateElement'].flatMap((node) => {
          const value = node === 'Literal' ? 'value' : 'value.raw'
          return [
            {
              selector: `${node}[${value}=${PALETTE_CLASS}]`,
              message: PALETTE_MESSAGE,
            },
            {
              selector: `${node}[${value}=${COLOUR_LITERAL}]`,
              message: COLOUR_MESSAGE,
            },
            {
              selector: `${node}[${value}=${ARBITRARY_COLOUR}]`,
              message: COLOUR_MESSAGE,
            },
          ]
        }),
      ],
    },
  },
  {
    /**
     * File and folder naming and placement. `src/app/**` is exempt through the
     * `!(app)` glob segment: Expo Router's file routes need names like
     * `_layout.tsx`, `+not-found.tsx` and `[id].tsx`, which are not kebab-case.
     */
    files: ['src/!(app)/**/*.{ts,tsx}', 'src/*.{ts,tsx}'],
    plugins: { 'check-file': checkFile },
    rules: {
      /** `ignoreMiddleExtensions` checks `auth` in `auth.store.ts`; the suffix block checks the rest. */
      'check-file/filename-naming-convention': [
        'error',
        {
          'src/!(app)/**/*.{ts,tsx}': 'KEBAB_CASE',
          'src/*.{ts,tsx}': 'KEBAB_CASE',
        },
        { ignoreMiddleExtensions: true },
      ],
      'check-file/folder-naming-convention': ['error', { 'src/!(app)/**/': 'KEBAB_CASE' }],
      /** A suffixed file can only live in its matching directory. */
      'check-file/folder-match-with-fex': [
        'error',
        {
          '**/*.store.ts': 'src/states/**',
          '**/*.queries.ts': 'src/queries/**',
          '**/*.schemas.ts': 'src/schemas/**',
          '**/*.types.ts': 'src/types/**',
        },
      ],
    },
  },
  {
    /**
     * No test file lives under src/, including src/app/: unit tests go in
     * tests/unit/, mirroring the src/ path of their subject, so src/ holds
     * shipped code only and no test lands in the router's routes directory. The
     * custom `errorMessage` is required: without it, check-file validates the
     * map's values as glob patterns, and free text fails that.
     */
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'check-file': checkFile },
    rules: {
      'check-file/filename-blocklist': [
        'error',
        {
          '**/*.{test,spec}.{ts,tsx}': 'tests/unit/**/*.test.{ts,tsx}',
          '**/__tests__/**': 'tests/unit/**/*.test.{ts,tsx}',
          'src/tests/**': 'tests/**',
        },
        {
          errorMessage:
            '`{{ target }}` is a test file under src/. Tests live in tests/unit/, mirroring the src/ path of the subject, e.g. src/http/session.ts → tests/unit/http/session.test.ts.',
        },
      ],
    },
  },
  {
    /** The test suite's filename rules. Its typed and react-hooks rules run in Oxlint. */
    files: ['tests/**/*.{ts,tsx}'],
    plugins: { 'check-file': checkFile },
    rules: {
      /** `.test.`, never `.spec.`, and no `__tests__/` folders. */
      'check-file/filename-blocklist': [
        'error',
        {
          '**/*.spec.{ts,tsx}': '*.test.{ts,tsx}',
          '**/__tests__/**': '*.test.{ts,tsx}',
        },
        {
          errorMessage:
            'This project uses `.test.` filenames under tests/unit/ — not `.spec.` and not a `__tests__/` folder.',
        },
      ],
    },
  },
  {
    /**
     * The suffix of a suffixed file. No `ignoreMiddleExtensions`, so
     * `auth.store.ts` is checked as `auth.store`. This block replaces the naming
     * block's `filename-naming-convention` for these directories (the last
     * matching config wins; options do not merge), so each prefix is the
     * plugin's own KEBAB_CASE body, not a `+([a-z0-9-])` class, which would pass
     * `123`, `-auth`, `auth-` and `au--th`.
     */
    files: [
      'src/states/**/*.ts',
      'src/queries/**/*.ts',
      'src/schemas/**/*.ts',
      'src/types/**/*.ts',
      'src/hooks/**/*.{ts,tsx}',
    ],
    plugins: { 'check-file': checkFile },
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        {
          'src/states/**/*.ts': '+([a-z])*([a-z0-9])*(-+([a-z0-9])).store',
          'src/queries/**/*.ts': '+([a-z])*([a-z0-9])*(-+([a-z0-9])).queries',
          'src/schemas/**/*.ts': '+([a-z])*([a-z0-9])*(-+([a-z0-9])).schemas',
          'src/types/**/*.ts': '+([a-z])*([a-z0-9])*(-+([a-z0-9])).types',
          'src/hooks/**/*.{ts,tsx}': 'use-+([a-z])*([a-z0-9])*(-+([a-z0-9]))',
        },
      ],
    },
  },
  {
    /** A test waits on a condition, never on a duration. */
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Promise'] CallExpression[callee.name='setTimeout']",
          message: SLEEP_MESSAGE,
        },
        { selector: "CallExpression[callee.name='sleep']", message: SLEEP_MESSAGE },
      ],
    },
  },
  {
    /**
     * Comment style is enforced. The `.d.mts` files under scripts/ are listed
     * separately because the brace glob does not reach them, and their JSDoc
     * must be checked too.
     */
    files: ['**/*.{ts,tsx,js,mjs}', 'scripts/**/*.d.mts'],
    plugins: { local: { rules: { 'comment-style': commentStyleRule } } },
    rules: { 'local/comment-style': 'error' },
  },
  {
    // Every named function, method and class carries a JSDoc purpose line; tags only where they add what types cannot.
    files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: false,
          require: { FunctionDeclaration: false },
          contexts: JSDOC_CONTEXTS,
          checkConstructors: false,
          // `vp staged` runs eslint --fix, and this fixer inserts blank stubs.
          enableFixer: false,
        },
      ],
      'jsdoc/require-description': ['error', { contexts: JSDOC_CONTEXTS }],
      'jsdoc/check-param-names': ['error', { checkDestructured: false }],
      'jsdoc/no-types': 'error',
    },
  },
  {
    // .d.mts mirrors its .mjs exports; a second JSDoc copy would drift.
    files: ['scripts/**/*.d.mts'],
    rules: { 'jsdoc/require-jsdoc': 'off' },
  }
)
