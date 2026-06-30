# Shared UI kit (`@platform/ui`)

The design primitives every module composes instead of re-implementing the
cartoon-candy look. **writing-challenge** was the first module migrated onto it; the
kit is the canonical way all screens get the shared look.

## What's here

| File | Export | Purpose |
|------|--------|---------|
| `Button.tsx` | `<Button>` | The 3D candy button (3 variants). |
| `ModuleScreen.tsx` | `<ModuleScreen>` | The standard module MAIN-screen shell (back pill + cream card + title). |
| `Card.tsx` | `<Card>` | The `.module-tile` cream-panel look, for use outside a full screen. |
| `BackButton.tsx` | `<BackButton>` | The **unified** standalone back pill for non-main screens — one component every module reuses instead of bespoke back buttons. |
| `CharTile.tsx` | `<CharTile>` | The shared character tile (rank, TOCFL level, mastery bar, recent-result dots, optional ribbon), reused by My Characters, the "next up" chips, and word-set lists. |
| `index.ts` | barrel | Import everything from `@platform/ui`. |
| `ui-kit.css` | — | The kit's stylesheet. Imported **once** by `platform/src/main.tsx`; modules never import it. |

```ts
import { Button, ModuleScreen, Card, BackButton, CharTile } from '@platform/ui/index.ts';
```

(Mirrors how modules already import `@platform/components/...`. The `@platform`
alias is wired in `platform/vite.config.ts` and `platform/tsconfig.app.json`.)

## Design tokens — one source of truth

All colors/sizes/fonts are CSS custom properties defined **once** on `:root` in
`platform/src/index.css`. Modules must **not** fork or re-declare them — just use
`var(--token)`. The canonical names (and their module aliases) include:

- Surfaces: `--bg-raised` / `--panel-bg` / `--bg-card` = cream `#FFF8E0`; `--bg-raised-2` / `--bg-card2` = `#F0E4BE`; `--bg` = deep teal `#0C3A42`.
- Borders: `--border` / `--panel-border` = purple `#5A1A96`. (This used to be gold `#E8C940`, which is how copybook went gold — fixed.)
- Accents: `--gold` / `--gold-dark`, `--teal` / `--teal-dark`, `--green` / `--green-dark`, `--red` / `--red-dark`, `--accent` / `--accent-bg`.
- Type: `--font` (canonical) — `--font-display` is an alias of it. Use `var(--font)`; don't redefine the family per module.
- Shape/motion: `--radius` (14px), `--radius-sm` (12px), `--radius-lg` (20px), `--shadow3d` (the candy lip offset), `--transition`.

If a module needs a token, add the NAME to `:root` (as an alias pointing at the
canonical value) — never re-declare a scoped fork.

## Primitives

### `<Button variant="primary" | "secondary" | "ghost">`
The pressable 3D candy button. Forwards all native `<button>` props
(`onClick`, `disabled`, `type`, `aria-*`, `className`, `children`).

- **primary** — gold face + `gold-dark` lip (main call to action).
- **secondary** — cream/white face + purple border + purple lip.
- **ghost** — subtle, no lip (low-emphasis actions).

`:active` compresses the lip; `:hover` lift is gated behind `@media (hover: hover)`;
`:focus-visible` shows a ring; `prefers-reduced-motion` neutralizes transforms.
`type` defaults to `"button"` so a Button inside a `<form>` won't submit it.

```tsx
<Button variant="primary" onClick={onStart}>Start Practice</Button>
```

### `<ModuleScreen title onBack? backLabel? cardClassName? children>`
The standard module MAIN-screen shell — **the big reuse win**. Renders the shared
back pill (`.module-back`, only when `onBack` is given), the shared cream card
(`.module-tile`), the title (`.module-tile-title`, from the already-localized
`title` prop), then `children`.

### `<Card>`
The `.module-tile` cream-panel look for use **outside** a full screen. Appends any
extra `className`.

### `<BackButton>`
The **unified** standalone back pill for non-main screens (deeper flows where you're
not rendering a `<ModuleScreen>`). One shared component so every module's back
control looks and behaves identically — don't hand-roll a bespoke back button.
`<ModuleScreen onBack>` uses the same pill internally for the main screen.

### `<CharTile>`
The shared character tile — rank, TOCFL level, mastery bar, recent-result dots, and
an optional `ribbon` — reused by My Characters, the "next up" chips, and word-set
lists. Like every kit primitive it inherits the active theme automatically (see
**Theming** below); style it via tokens, not per-instance overrides.

## How to build a new module's main screen

```tsx
import { ModuleScreen, Button } from '@platform/ui/index.ts';

function Landing({ onExit, onStart, t }) {
  return (
    <ModuleScreen
      title={t('module.name')}      // already-localized, single UI-language name
      onBack={onExit}               // omit to hide the back pill
      backLabel={t('common.back')}  // optional; defaults to "← Back"
    >
      {/* module-specific content goes here */}
      <Button variant="primary" onClick={onStart}>{t('module.start')}</Button>
    </ModuleScreen>
  );
}
```

That's the whole landing. Keep module-specific widgets (canvases, char tiles,
custom toggles) bespoke — only the **common** patterns (screen shell, title,
candy buttons, tokens) belong in the kit.

## Theming

The kit's primitives are **theme-aware for free**: their look is driven entirely by
the `:root` design tokens, and an active theme just overrides those tokens under a
`body[data-theme="<id>"]` block — inline in `index.css` (Gold/Silver) or a standalone
`theme/theme-<id>.css` file imported in `main.tsx` (the free Midnight/Sakura/Matcha
skins). So every theme re-skins every Button, tile, and card with no per-component
work — never theme a primitive by hand, and never branch on the current theme in a
module. The full theming system (registry, resolution, premium gating) lives in
`platform/src/theme/` and is documented in
[../../../ARCHITECTURE.md §5.5](../../../ARCHITECTURE.md). The default look sets no
tokens, so it stays byte-identical to the pre-theming `:root`.

## Notes

- Token-centralization removed practice-english's scoped token fork; it now inherits
  `:root`, keeping one local `--radius: 18px`.
- Selectors in `ui-kit.css` are prefixed with `.app-shell` so they survive a
  module's scoped `* { margin:0; padding:0 }` reset — keep that prefix for any
  new kit class.
