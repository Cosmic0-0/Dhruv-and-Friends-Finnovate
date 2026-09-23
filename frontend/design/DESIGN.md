# FraudLens UI spec (iOS, black and white)

Reference screens: `mockup/*.png` (rendered) and `mockup/*.html` (exact values).
The PNGs were rendered with Inter as a stand-in; the real app uses the Apple system font.

## Principles
- Native iPhone feel. Apple system font, large titles, soft cards, frosted tab bar.
- Black, white and greys. Colour only carries meaning: red = scam, green = genuine, orange = be careful.
- No uppercase tracked labels, no serif, no em dashes, no decorative dots, one radius system.

## Tokens (light)
- Page background `#F2F2F3`
- Text `#1C1C1E`; secondary text `#6E6E73`; hairline `rgba(60,60,67,0.12)`
- Card: `linear-gradient(180deg,#FCFCFC,#F6F6F7)`, 1px `rgba(255,255,255,0.95)` border, radius 28, shadow `0 1px 1px rgba(28,28,40,.02), 0 14px 30px rgba(28,28,40,.07)`
- Hero card: `linear-gradient(180deg,#2A2A2D 0%,#111113 55%,#0B0B0C 100%)`, radius 28, shadow `0 16px 34px rgba(28,28,40,.22)`
- Suggestion card: `#E8E8EA`, radius 28
- Primary button on light: `#111113` bg, white text. On hero: white bg, `#111113` text. Secondary: `rgba(0,0,0,0.06)`. All buttons are full pills.
- Semantic: red `#FF3B30` (text `#C4221A`, tint `#FDECEB`), green `#34C759` (text `#1D7A3A`, tint `#E6F6EA`), orange `#FF9F0A` (text `#A65300`, tint `#FFF1E0`)

## Tokens (dark, prefers-color-scheme)
- Background `#0C0C0D`; card `#1C1C1E`; text `#F5F5F7`; secondary `#98989F`; hairline `rgba(84,84,88,0.45)`
- Hero: `linear-gradient(180deg,#3A3A3C,#232325)` + 0.5px `rgba(255,255,255,.08)` border
- Primary button: `#F5F5F7` bg, `#111113` text. Tab bar `rgba(30,30,32,.82)`.
- Semantic text: red `#FF6961`, green `#4CD964`, orange `#FFB340`; tints `#3A1512` / `#10301A` / `#3A2610`

## Type (font stack: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif)
- Large title 34/41 bold. Subtitle 15/20 secondary.
- Hero headline 42/46 bold, -0.02em. Hero number 50 bold + "/ 100" 20 medium at 50% white.
- Card title 15 semibold secondary (sentence case). Card big number 28-44 bold, tabular numbers.
- Body 17/23. List row 17 with 15 secondary detail on the right.

## Layout
- 18px side padding, 16px between blocks, 14px grid gap. Two-card rows use a 7/5 split of 12 columns.
- Tab bar: floating 326x66 pill, 28px from bottom (+ safe area), frosted (`backdrop-filter: blur(24px) saturate(180%)` with `-webkit-` prefix). 5 slots: Check, Learn, centre 56px round primary button (+), Radar, Settings.
- Touch targets at least 44px.

## Motion
- 150-250ms ease-out on interactive elements; press = scale(0.98).
- Streak overlay: scrim fade 200ms, card scale 0.92 -> 1.02 -> 1 over 420ms, flame grows in then flickers (see mockup/Streak.html keyframes).
- Everything respects prefers-reduced-motion.
