# Copilot Instructions for DumbMirror

## Project Overview
- This workspace is a customized MagicMirror² setup (`MagicMirror-master-Original/`) with bespoke modules in `modules/` (e.g., `MMM-LiveLyrics`, `MMM-OnSpotify`, `MMM-Pages`, `MMM-VoiceBridge`).
- The mirror runs as an Electron/Node app; most UI is client-side JavaScript with CSS overlays. Server entrypoints live in `js/` and `serveronly/`.

## Preferência de Idioma
- Redija respostas, explicações, comentários e mensagens em português brasileiro, mantendo o tom colaborativo.
- Ao sugerir ou escrever código, prefira nomes de variáveis, funções e strings em português brasileiro, exceto quando uma API externa exigir nomes em inglês.
- Converta trechos existentes para português apenas quando a alteração não quebrar compatibilidade ou contratos já consumidos por outros módulos.

## Key Workflows
- Install deps with `npm install` at the MagicMirror root; start the mirror in browser/dev mode using `npm run server` (headless) or `npm run start:windows` for Electron.
- Validate configs via `npm run config:check`. Jest/unit tests exist but are rarely used during UI tweaks; prioritize manual browser refreshes when editing modules or CSS.

## Configuration Model
- All enabled modules and environment wiring live in `config/config.js`. It injects env vars via `_env()` helper and assigns per-page classes (`page-home`, `page-media`).
- `MMM-Pages` governs which modules appear on each page. Edits must maintain the `pages` array and respect the `classes` values used throughout CSS.

## Page & State Classes
- `modules/MMM-Pages/MMM-Pages.js` was customized: it now adds body classes like `mm-current-page-media` and module-level flags `mmm-pages--active-*`. Reuse these instead of creating new selectors.
- When adding new page-dependent styles, scope them with the existing classes to avoid regressions (e.g., `body.mm-current-page-media .module.MMM-Pages`).

## Styling Conventions
- Global overrides go in `css/custom.css`. It defines root sizing variables (`--mm-base-font`, `--ll-gap-*`, `--ll-indicator-offset-*`) that control responsive layout; adjust these instead of hard-coded pixel values.
- `modules/MMM-LiveLyrics/css/custom.css` manages the lyrics card geometry. It relies on the same CSS vars to keep alignment with `MMM-OnSpotify`; keep `position` and `margin` rules consistent with those tokens.
- Prefer extending existing gradients/palettes driven by `MMM-OnSpotify` to keep the dynamic theming consistent.

## Module Interactions
- `MMM-LiveLyrics` depends on live data from `MMM-OnSpotify` (colors, track metadata). Ensure any data handling changes preserve the event bridge (`sendNotification`/`socket`).
- Voice commands are handled by `MMM-VoiceBridge`; the visual widget now occupies `top_right` on the media page only. Changes should respect that layout pairing.

## Additional Tips
- MagicMirror modules often expose `getDom()`, `notificationReceived()`, and `socketNotificationReceived()`; follow existing patterns when extending modules.
- Keep browser console warnings in mind: modules such as `MMM-LiveLyrics` log rich status info (`INFO`/`WARN`) that helps during debugging.
- For device-specific tweaks (portrait vs. landscape), reuse the existing media queries in `css/custom.css` rather than duplicating rules.

Need updates or clarifications? Let me know which sections feel incomplete so we can refine them together.
