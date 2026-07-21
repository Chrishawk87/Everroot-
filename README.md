# Everroot — the Living Legacy Forest

> Preserve your family's history before it's gone.

Everroot turns a person's life into a **Living Legacy Forest**. Every account begins
as a seed; every story, photo, piece of advice, and milestone grows the tree; every
family becomes a connected forest future generations can walk through.

**The Forest is the application.** It is the interface, the navigation, and the data
model. There is no dashboard — after signing in you enter directly into your 3D forest.

This repository is **Phase 1: the Forest Foundation**.

## What's built (Phase 1)

- **Graph data model** — every object is a `ForestNode` (seed, trunk, branch, leaf,
  flower, fruit, root, person, photo, memory moment, timeline event…) connected by
  `ForestEdge`s. The 3D forest is generated directly from this graph, never hardcoded.
- **Built-in authentication** — email/password with Auth.js (NextAuth v5), JWT sessions.
- **User profiles** — name, birth year, family position (the seed's identity).
- **Seed system** — every new account is planted as a seed.
- **Tree Growth Engine** — each interaction produces a specific forest object and
  recomputes the legacy score and growth stage (Seed → Sprout → Sapling → Young Tree
  → Mature Tree → Ancient Tree).
- **3D Forest renderer** — React Three Fiber scene with orbit/zoom/pan and clickable
  nodes, drawn entirely from graph data.

Deliberately **not** in Phase 1: voice interviews, memory graph extraction, family
forest connections across accounts, podcasts, legacy books, payments, AI historian.
Those are later phases that feed into this foundation.

## Tech stack

| Layer     | Choice                                            |
| --------- | ------------------------------------------------- |
| Framework | Next.js 14 (App Router) + TypeScript              |
| Styling   | Tailwind CSS                                       |
| 3D        | Three.js + React Three Fiber + drei               |
| Auth      | Auth.js (NextAuth v5), credentials + JWT sessions |
| Database  | PostgreSQL via Prisma                             |
| Hosting   | Railway (web service + Postgres plugin)           |

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Create your env file
cp .env.example .env
#    - set DATABASE_URL to a local or hosted Postgres
#    - set AUTH_SECRET:  openssl rand -base64 32

# 3. Create the database schema
npx prisma migrate dev --name init

# 4. (optional) Load a demo forest — login demo@everroot.app / everroot123
npm run db:seed

# 5. Run
npm run dev
```

Open http://localhost:3000, plant your seed, and start growing.

## How growth works

| Interaction        | Grows        | Legacy points |
| ------------------ | ------------ | ------------- |
| Record a story     | Leaf         | 5             |
| Answer a question  | Leaf         | 6             |
| Add a photo memory | Photo memory | 3             |
| Share life advice  | Fruit        | 12            |
| Mark a milestone   | Flower       | 15            |
| Add family history | Root         | 10            |
| Add family member  | Sapling      | 8             |
| Memory Moment      | Leaf/Fruit/Flower (by type) | 7 |

The legacy score is the sum of all node scores; the tree's visible stage is derived
from that total.

## Deploying to Railway

1. Push this repo to GitHub.
2. In Railway, **New Project → Deploy from GitHub repo** and select it.
3. Add a **PostgreSQL** plugin — Railway injects `DATABASE_URL` automatically.
4. Add environment variables on the web service:
   - `AUTH_SECRET` — `openssl rand -base64 32`
   - `AUTH_URL` and `NEXTAUTH_URL` — your Railway public domain (e.g. `https://everroot.up.railway.app`)
5. Deploy. `railway.json` runs `prisma migrate deploy` on start, so the schema is
   created/updated automatically on each deploy.

## Project structure

```
app/
  page.tsx                 landing → redirects to /forest when signed in
  (auth)/login|signup/     built-in auth pages
  forest/page.tsx          the app: loads the graph, renders the 3D forest
  actions/                 server actions (auth, grow forest)
  api/auth/[...nextauth]/  Auth.js route handler
components/forest/
  ForestExperience.tsx     HUD + panels + canvas orchestrator
  ForestCanvas.tsx         React Three Fiber 3D scene
  GrowthPanel.tsx          form that grows the forest
lib/forest/
  types.ts                 node/edge/stage types
  growth-engine.ts         maps interactions → forest objects, scoring
  layout.ts                deterministic 3D positions from graph data
  queries.ts               load a user's full forest
prisma/schema.prisma       the graph data model (source of truth)
```
