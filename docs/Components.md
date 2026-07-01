# Components

Pragmatic componentization: `src/App.jsx` keeps orchestration and state; presentational, reusable
pieces live in `src/components/`. Every component is small, prop-driven, and string-free (text comes
from the `t()` translator passed down or imported via `useT`).

| Component | Props (key) | Responsibility |
|-----------|-------------|----------------|
| `BottomSheet` | `open, onClose, title, desc?, children` | The shared drawer used by auth, task creation, interests, review. Backdrop + handle + slide-up animation. |
| `CategoryCard` | `icon, label, onClick` | A single home-screen category tile. |
| `TaskCard` | `task, role, t, onPrimary?, onChat?` | Renders a task (category, status badge, area, budget, time left) with the right CTA per role/status. |
| `ProviderCard` | `provider, t, action?` | Helper summary: avatar, rating, jobs, distance, response time, verification. |
| `StarRating` | `value, onChange?` | Interactive (review) or read-only star row. |
| `Skeleton` | `lines?/variant` | Placeholder shown while a feed loads. |
| `Toast` | `toast, onClose` | One toast; container stays in `App`. |
| `LanguageToggle` | — | EN/SW pill; reads/writes `useT().setLang`. |
| `MapPicker` | `lat, lon, onChange` | Leaflet map with a draggable pin; emits coords on move (debounced → reverse-geocode in parent). |
| `MapView` | `lat, lon, label?` | Read-only Leaflet map showing approximate area. |

## Conventions
- **No hardcoded copy** in components — pass `t` or use `useT()`.
- Components are **presentational**: side effects (fetch, WS) stay in `App.jsx`.
- Styling uses the existing design-system classes in `src/index.css` (CSS variables, `.btn`,
  `.card`, `.bottom-sheet`, …) so components stay visually consistent.
- Leaflet CSS is imported once (in `main.jsx`); map components assume it's present.

## Reuse notes
Before adding UI, check `src/index.css` for an existing class and `src/components/` for an existing
component. The bottom-sheet, card, badge, button and form-control patterns already cover most needs.
