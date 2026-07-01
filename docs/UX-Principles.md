# UX Principles

Every screen answers one question: **"What does the user need next?"** If a screen can't answer
it, the screen is wrong.

## Rules we hold ourselves to
- **Reduce thinking.** Big friendly category tiles instead of a blank search box. The hero literally
  answers *"What do you need today?"* with a rotating, slightly funny prompt.
- **Under 30 seconds to publish.** Task creation is a 2-step sheet: details → budget/expiry, with
  location auto-captured (GPS + reverse-geocoded area name, editable).
- **Reduce taps, scrolling, typing.** Sensible defaults everywhere (Flexible budget, 1-hour expiry,
  current GPS). Typing is optional wherever possible.
- **Mobile first, thumb friendly.** Phone is the primary target; tablet/desktop are framed inside a
  phone-shaped shell. Tap targets ≥ 44px. Bottom nav + bottom sheets stay in thumb reach.
- **No marketplace language.** *Task / help request / service / helper* — never listing/advert/classified.
- **Trust by design.** Ratings, jobs completed, response time, verification status are visible.
  Contact details and exact location are hidden until both parties agree.
- **Bilingual, natively.** English + Swahili are equals; the toggle is one tap and persists.

## Visual language
Ocean / yacht palette — clean blues, teals, deep navy on a soft off-white. Large spacing, rounded
cards (`--radius-lg`), soft shadows, subtle bounce on press, smooth view transitions. No loud
gradients, nothing that looks auto-generated. Headings in *Outfit*, body in *Inter*.

## Motion & accessibility
- Animations are short (≤ 0.35s) and honour `prefers-reduced-motion`.
- Icon-only buttons carry `aria-label`s; focus states are visible.
- Loading states use **skeletons**, not spinners, so layout doesn't jump.
- Empty states are friendly and tell the user what to do next, in their language.

## Tone
Playful but inclusive. We're warm and a little cheeky ("Too busy to adult today?") but never
exclusionary — we dropped the earlier "Rich Kid" framing so the product speaks to everyone who just
needs a hand. Humour lives in microcopy (hero prompts, empty states, toasts), never in the
critical path where it would slow someone down.
