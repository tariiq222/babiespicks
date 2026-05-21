---
name: babiespicks-frontend-design
description: Use when designing or reviewing BabiesPicks web UI in Next.js 16, Tailwind CSS v4, next-intl ar/en, and Arabic RTL layouts.
---

# BabiesPicks frontend design

Use this skill for BabiesPicks web interface work: pages, components, empty states, product cards, category pages, best lists, search, and admin surfaces.

## Project context

- App: `apps/web`
- Stack: Next.js 16 App Router, React 19, Tailwind CSS v4, next-intl
- Locales: Arabic first, English second
- Direction: Arabic routes must render RTL via `dir="rtl"`; English routes LTR
- Tokens: CSS custom properties and Tailwind `@theme` in `apps/web/src/app/globals.css`
- Fonts: IBM Plex Sans Arabic for Arabic, Inter for Latin

## Design checks

1. Preserve Arabic-first UX and avoid English-first mental models.
2. Use existing design tokens; do not introduce a new design system or Tailwind config.
3. Keep strings in `apps/web/messages/{ar,en}.json` rather than hardcoding UI copy.
4. Verify RTL spacing, icon direction, alignment, and mixed Arabic/Latin text.
5. Use `.flip-x` for directional icons when needed.
6. Use `.sar` for currency-like isolated LTR content when applicable.
7. Maintain accessible semantic HTML, labels, focus states, and keyboard flow.
8. Prefer responsive mobile-first layouts and touch targets suitable for Saudi parents browsing on phones.

## Avoid

- Generic SaaS gradients or unrelated visual styles.
- Hardcoded locale assumptions.
- Layouts that only work in LTR.
- Adding dependencies for visual polish unless explicitly approved.

## Output

Return concise findings or implementation guidance with:

- Affected files or components.
- RTL/i18n considerations.
- Accessibility notes.
- Token or component recommendations.
