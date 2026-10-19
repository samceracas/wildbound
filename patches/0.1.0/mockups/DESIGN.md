---
# Exported from Stitch project "Wildbound Design System" (10056911725099997677) via the Stitch MCP.
name: Field Registry
colors:
  surface: '#fff9ec'
  surface-container-low: '#f9f3e6'
  surface-container: '#f3ede0'
  surface-container-high: '#ede8db'
  on-surface: '#1d1c14'
  on-surface-variant: '#3f4945'
  outline: '#6f7974'
  outline-variant: '#bec9c3'
  primary: '#005240'
  primary-container: '#1f6b57'
  on-primary-container: '#a0e9cf'
  secondary: '#48663a'
  secondary-container: '#c9edb5'
  tertiary-container: '#7c5900'
  tertiary-fixed: '#ffdea4'
  error: '#ba1a1a'
  error-container: '#ffdad6'
  deep-forest: '#183F36'
  forest-slate: '#315E4D'
  primary-forest: '#1F6B57'
  moss: '#6F8F5F'
  leaf: '#8EA96F'
  field-gold: '#D5A84C'
  warm-paper: '#F6F0E3'
  paper-surface: '#FFFDF7'
  muted-paper: '#E8E1D2'
  ink: '#24302D'
  ink-muted: '#64706A'
  sky: '#8EB9CF'
  water: '#4D93A6'
  alert-terracotta: '#C96A5B'
  success-green: '#4F8A68'
  locked-gray: '#7C827E'
typography:
  display:      { fontFamily: Noto Serif, fontSize: 40px, fontWeight: '400', lineHeight: 42px, letterSpacing: -0.02em }
  headline-lg:  { fontFamily: Noto Serif, fontSize: 32px, fontWeight: '400', lineHeight: 36px, letterSpacing: -0.015em }
  headline-md:  { fontFamily: Inter, fontSize: 24px, fontWeight: '700', lineHeight: 29px, letterSpacing: -0.01em }
  body-lg:      { fontFamily: Inter, fontSize: 18px, fontWeight: '400', lineHeight: 27px }
  body-md:      { fontFamily: Inter, fontSize: 16px, fontWeight: '400', lineHeight: 24px }
  body-sm:      { fontFamily: Inter, fontSize: 14px, fontWeight: '400', lineHeight: 20px }
  label-lg:     { fontFamily: Inter, fontSize: 14px, fontWeight: '700', lineHeight: 17px, letterSpacing: 0.01em }
  label-md:     { fontFamily: Inter, fontSize: 12px, fontWeight: '700', lineHeight: 14px, letterSpacing: 0.04em }
  caption:      { fontFamily: Inter, fontSize: 12px, fontWeight: '500', lineHeight: 16px }
rounded: { sm: 0.25rem, DEFAULT: 0.5rem, md: 0.75rem, lg: 1rem, xl: 1.5rem, full: 9999px }
spacing: { gutter: 1.5rem, margin: 2.5rem, space-xs: 0.25rem, space-sm: 0.5rem, space-md: 1rem, space-lg: 1.5rem, space-xl: 2rem }
---

## Brand & Style

A field naturalist's expedition ledger crossed with a modern scientific registry: scholarly,
adventurous, grounded, observant. No glowing sci-fi, no high-fantasy tropes. Tactile papercraft
plus soft utility modernism: a deep-canopy shell encloses warm paper workspaces.

## Colors (roles)

- **Primary Forest `#1F6B57`**: primary buttons, active nav, focus.
- **Deep Forest `#183F36`**: structural shell, nav rail/bar, secondary buttons, encounter backgrounds.
- **Moss `#6F8F5F` / Leaf `#8EA96F`**: habitat badges, ecological traits.
- **Field Gold `#D5A84C`**: discoveries, rank, rewards.
- **Ink `#24302D` / Muted Ink `#64706A`**: text. Never pure black. Invert to Paper Surface on dark.
- **Alert Terracotta `#C96A5B` / Success Green `#4F8A68`**: status.
- Canvas is Warm Paper `#F6F0E3`; cards are Paper Surface `#FFFDF7` with `1px solid #E8E1D2`.

## Typography

Noto Serif for titles and specimen names; Inter for everything operational (labels, numbers, forms).

## Elevation

Tonal layering and borders, not shadows. Detached dialogs: `1px solid #E8E1D2` plus
`0 2px 4px rgba(24,63,54,.06), 0 8px 16px rgba(24,63,54,.08)`. No blur, no neon gradients.

## Shapes

6px micro controls, 10px buttons/inputs, 16px cards, pill for tags/badges. Max two nested card tiers.

## Components

- Buttons: 44px tall, 10px radius, label-lg. Primary = Primary Forest fill (hover Deep Forest).
  Secondary = Deep Forest fill (hover Forest Slate). Ghost = transparent, muted-paper border, primary text.
- Badges: pill, `6px 10px`, label-md. Default muted-paper bg + forest-slate text. Discovery = field-gold bg + ink.
- Inputs: 44px, paper-surface bg, muted-paper border, 10px radius; focus border = Primary Forest, no glow.
- Cards: paper-surface, muted-paper border, 16px radius, 24px padding.

## Screens (mobile, 390px wide)

| Screen | Stitch screen id | Files |
|---|---|---|
| Login (register username) | 3b2371ca6ac94485a17b1b46780de550 | `1-login.html/.png` |
| Allow Location Sharing | 5c4d27f9208f4f489f7568f7a47cd5a8 | `2-location.html/.png` |
| Radar | 7a3785983cb84ea7b285ec377f28b6cc | `3-radar.html/.png` |
| Inventory (Satchel) | 3939552b21024c39a31e671470409461 | `4-inventory.html/.png` |
| Registry | c60e00288fab46a1ab5fb25cd5d561c3 | `5-registry.html/.png` |
| Party | ca65ef18aad34a288cd8d4772a0e45ba | `6-party.html/.png` |

Downloaded in pass 2 with `curl -L` from the Stitch MCP `get_screen` URLs. The `.png` files are
Stitch's own captures (429px wide, the largest it serves); the Login and Location captures came back
blank from Stitch, so open the `.html` files in a browser to see those two. The HTML loads Tailwind
from `cdn.tailwindcss.com`.

The screens go further than the tokens above: a dark handheld "field nav" chassis with a pixel
font (Press Start 2P), dot-matrix body text (VT323), scanlines, cartridge-style tabs and A/B face
buttons around the paper screen. `apps/web` follows that look. Stitch's placeholder content
(Pokémon-style names, HP/ATK stats, filler items) was not copied; the game shows only real data.
