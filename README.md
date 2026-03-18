# Company Researcher

Company Researcher is a small Next.js app for generating company research briefs for job outreach.

You save a shared resume once, add companies to a workspace, and generate a brief for the selected company. Each brief combines live company signals with a structured candidate profile to produce:

- a company overview
- current direction and inferred needs
- suggested questions to ask
- a personalized appeal angle with talk tracks

## What It Does

- Stores a shared candidate profile for reuse across multiple companies
- Accepts a text-based PDF resume plus optional supplemental notes
- Pulls live company signals from official pages, search results, and news
- Generates a one-shot brief for a selected company
- Flags limited-data sections with confidence levels
- Persists the workspace, profile, companies, briefs, and sources in Convex

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- Convex
- OpenAI API
- Exa search API
- `pdf-parse` for resume text extraction
- `vitest` for tests

## Requirements

- Node.js 18+
- npm
- A Convex deployment
- `OPENAI_API_KEY` for profile extraction and brief synthesis
- `EXA_API_KEY` for broader live web search

## Environment Variables

Copy `.env.example` to `.env.local` and set:

```bash
OPENAI_API_KEY=
EXA_API_KEY=
CONVEX_URL=
```

Notes:

- `CONVEX_URL` is required. The app will fail fast without it.
- If `OPENAI_API_KEY` is missing, the app falls back to heuristic profile extraction and fallback brief generation.
- If `EXA_API_KEY` is missing, generation can still work when you provide an official company URL, because the app can scrape that site directly. Without Exa and without an official URL, source collection will fail.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Start Convex and copy the generated deployment URL into `.env.local` as `CONVEX_URL`:

```bash
npx convex dev
```

3. Start the Next.js app:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
```

## How The App Works

1. The workspace loads from Convex.
2. If the workspace is empty, the app seeds demo data automatically.
3. You upload a shared PDF resume and optional notes.
4. The app extracts resume text and derives a structured profile.
5. You add one or more companies to the workspace.
6. When you generate a brief, the app collects live sources, synthesizes the brief, and saves both the brief and its citations.

## Data Model

The workspace is centered around:

- one shared profile
- many companies
- one saved brief per company
- saved source records per company

Each brief contains four sections:

- `overview`
- `current-direction`
- `questions`
- `appeal`

Each section includes citations plus a confidence level of `high`, `medium`, or `low`.

## Product Constraints

- Resume upload supports text-based PDFs only in v1
- Brief generation is one-shot per company run
- Output is web-only; there is no export flow
- The app is conservative when source quality is weak and marks limited-data sections instead of silently inventing specifics

## Demo Behavior

On a fresh workspace, the app seeds:

- a demo profile
- Anthropic with a saved brief
- Stripe and Vercel as additional company entries

This makes the UI usable before you upload your own resume or generate your first brief.
