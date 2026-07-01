# Vision

## The one sentence

**Wakishua** helps someone who needs local help *right now* find a trusted nearby helper in
under 30 seconds — closer to "Uber meets Fiverr" than a classifieds board.

## What it is not

It is **not** a marketplace of listings. Users do not browse adverts and "contact the seller".
We avoid the words *listing, advert, classified*. We say **task**, **help request**, **service**,
**helper**.

The mental model is: *"I need someone now."* Every screen is designed to reduce thinking and
get the user from intent → published request → matched helper as fast as possible.

## Who it serves

- **Customer** — needs something done today (home cleaned, food cooked, groceries bought, a
  plumber, a mechanic, a tutor…). Opens the app, taps a big friendly category, answers a couple
  of light questions, and publishes. Done.
- **Service Provider ("Helper")** — offers a skill. Toggles *Available Now*, receives nearby task
  alerts, taps *Interested*, and (if chosen) chats privately with the customer.
- **Guest** — may browse categories, helpers and a limited task feed, but must create an account
  to interact (apply, chat, create tasks). Contact details stay hidden until both sides agree.

## Why bilingual (English + Swahili)

The first market is East Africa (default currency TZS, default map centre Dar es Salaam). Swahili
is the language people actually live and transact in, so a credible product must speak it
natively — not as an afterthought. Language is a first-class toggle, persisted per device.

## Why "track the location of a job posting"

Local help is inherently about *where*. We capture each task's GPS coordinates **and** a
human-readable area name (e.g. "Masaki, Dar es Salaam") so:
- providers can judge "is this close enough for me to take?" before committing, and
- customers get a trustworthy sense that the right, nearby people are being notified.

Exact location and phone numbers are revealed **only after a match**, protecting both parties.

## Experience principles

Modern, minimal, friendly — never corporate or government. Ocean/yacht palette (clean blues,
teals, deep navy). Large spacing, rounded cards, subtle motion, fast interactions, minimal typing.
A bit of humour: the hero literally answers the question *"What do you need today?"* with a
rotating, slightly cheeky prompt.

See [UX-Principles.md](./UX-Principles.md) and [Architecture.md](./Architecture.md) for how this
translates into concrete decisions.
