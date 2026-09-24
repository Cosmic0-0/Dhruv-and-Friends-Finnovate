# FraudLens UI spec

**This describes what is built.** It replaces the original black-and-white
iPhone spec, which the code deliberately diverged from; that version and its
screens are kept in `mockup/` as history, and where this document and those
screens disagree, this document is right. The divergences are listed at the
end, with why.

The reference is `app/globals.css`. Anything below that contradicts the
stylesheet is a bug in this file.

## Principles

- **A phone app first.** The phone layout is the design. Desktop adds a
  navigation rail beside the same column; it is not a separate design.
- **Colour means something.** Red, amber and green are reserved for verdicts.
  Nothing else on screen competes with "this is a scam". The one warm accent
  belongs to the practice streak, which is why it is a fire.
- **Flat surfaces.** No gradients. A page, a card and a hero are each one
  colour.
- **Sentence case.** No uppercase tracked labels, no serif, no em dashes, no
  decorative dots.
- **Say what a thing is.** "Check before you pay", not "About to pay
  someone?". Tabs carry labels, not bare glyphs.

## Tokens

Every `@theme` token resolves to a `--c-*` custom property. The dark palette is
declared once as `--d-*`, and two selectors map it: the
`prefers-color-scheme` media query, and `[data-theme="dark"]` for an explicit
choice in Settings. **Both mapping blocks are generated from the `--d-*` list**
(see the scripts in the restyle history) so a token cannot be defined without
being mapped.

### Light

| Role | Value |
| --- | --- |
| Page | `#F2F2F4` |
| Card | `#FFFFFF`, radius 28, 1px `rgb(0 0 0 / 5%)`, `--shadow-card` |
| Hero | `#1C1C1E`, radius 28, white text |
| Suggestion / action card | `#EBEBEE` |
| Text | `#1C1C1E`; secondary `#3C3C3F`; muted `#6E6E75` |
| Hairline | `rgb(0 0 0 / 9%)` |
| Primary button | `#1C1C1E` bg, white text |
| Warm accent | `#FF8A3D`; as text `#B4521A`; tint `#FFF0E4` |

### Dark

| Role | Value |
| --- | --- |
| Page | `#0C0C0D` |
| Card | `#1A1A1C` |
| Hero | `#242426`, 1px `rgb(255 255 255 / 8%)` |
| Text | `#F2F2F4`; secondary `#C6C6CA`; muted `#94949C` |
| Hairline | `rgb(255 255 255 / 12%)` |
| Primary button | `#F2F2F4` bg, `#111113` text |
| Warm accent | `#FF9E5C`; as text `#FFB079`; tint `#33220F` |

### Verdicts (both themes, the only semantic colour)

`scam` red `#FF3B30` / dark `#FF6961` · `suspicious` amber `#FF9F0A` / dark
`#FFB340` · `safe` green `#34C759` / dark `#4CD964`. Each has an `-ink` variant
that passes AA as small text on a card, and a tint for backgrounds.

## Type

Apple system font: `-apple-system, BlinkMacSystemFont, "SF Pro Text",
"Segoe UI", system-ui, sans-serif`. One family; no serif, no monospace.

- Large title 34/41 bold — every screen opens with one.
- Hero headline 42/46 bold, `-0.02em`.
- Hero number 50 bold with `/ 100` at 20 medium, 50% white.
- Card title (`.micro`) 15 semibold, secondary, sentence case.
- Caption (`.micro-sm`) 13.
- Body 17/23. List row 17 with a 15 secondary detail on the right.
- `.data` is tabular numerals in the same family, for counts and looked-up
  values.

## Shape

**Not one radius.** The split is what stops the interface reading as a field of
ovals:

- Cards, heroes, suggestion cards: **28px**.
- Buttons and inputs (`.btn`, `.btn-sm`): **14px**.
- Full-round is reserved for things that really are chips or circles: the tab
  bar, icon badges, status dots, verdict chips (`.pill`).

Touch targets are at least **44px**, including `.btn-sm`, which is 2px taller
than the mockup drew for that reason.

## Layout

- Phone: 18px side padding, 16px between blocks, 14px grid gap. Paired cards
  use a 7/5 split of 12 columns and stretch to a shared baseline.
- Desktop, from **64rem**: a 264px navigation rail pinned to the left on its
  own surface, and a content region taking the rest of the window. Screens that
  can use it lay out in two equal columns (`.screen-grid`), capped at 1320px.
  Below 64rem a tablet keeps the phone layout.
- Safe-area insets on every top edge, the tab bar, the gutter and the
  celebration overlay.

## Tab bar

A floating glass bar, phone widths only (the rail replaces it at 64rem).
**Four labelled slots: Check, Learn, Radar, Settings.** Labels are not
optional — bare glyphs left a first-time user unable to tell the screens apart.

The glass is a heavy blur with saturation, a specular highlight along the top
edge, an inner rim, a soft inner shadow at the base and a sheen across the
upper half. `-webkit-backdrop-filter` is required for iOS. Opacity is 76% light
/ 72% dark: tuned against a real capture with content scrolling underneath, not
by eye.

## Motion

- 150–250ms ease-out on interactive elements; press is `scale(0.98)`.
- The verdict and its two cards enter in a short stagger (`.reveal`).
- Streak overlay: scrim fades 200ms, card scales 0.92 → 1.02 → 1 over 420ms,
  flame grows in then flickers.
- Everything respects `prefers-reduced-motion`.

## First run

A new user has no history, so Practice, This week and Recent would all be empty
placeholders. **They are not rendered until they have content.** In their place,
before the first check only, a card says what the app does. It is replaced by
the real cards as soon as there is anything in them.

## Where this diverges from `mockup/`

| Mockup | Built | Why |
| --- | --- | --- |
| All buttons full pills | 14px buttons; pills for chips only | Everything read as ovals |
| Card gradient `#FCFCFC → #F6F6F7` | Flat `#FFFFFF` | No gradients |
| Hero gradient, three stops | Flat `#1C1C1E` | Same |
| Tab bar: 5 slots, icons only, centre "+" | 4 labelled slots | Glyphs were unlearnable; "+" duplicated the hero button |
| Ring arcs sized by rank | Equal arcs coloured by severity | The API gives severity, not weight |
| Tidy Recent titles | Truncated redacted message | The stored data cannot supply a title |
| Phone only | Phone plus a desktop rail | A 430px column stranded in a browser window |

An indigo brand palette was built and then reverted; `--c-brand*` tokens
survive but resolve to the ink tone, so the names still parse and nothing had
to be renamed back.
