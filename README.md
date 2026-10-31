# STATES: real-time geopolitics on a living globe

A persistent multiplayer nation simulation. Found a state anywhere on Earth and inherit that land's real
development, institutions and people. Then govern it: taxes, ~50 national policies, a 13-line budget,
industrial strategy and provincial policy. The results play out day by day against players and data-driven AI powers.

## Run it

```bash
npm install
npm run dev        # live clock: 1 game month = 1 real hour (1 day = 2 min)
npm run dev:fast   # development clock: 1 month = 30 s (see .env.fast)
```

Set `GAME_MONTH_MS` to choose any speed. The world persists in `.data/world-v2.json`; delete it to regenerate.
Open a second browser, or add `?player=2` to the URL, to play a second nation.

### Rebuilding the world data (optional, already generated in `public/world/`)
```bash
npm run fetch:data   # World Bank WDI + WGI, UNDP HDR, Natural Earth cities → data/raw
npm run build:world  # provinces, cities and countries → public/world
```

## Data sources
| Source | Used for |
|---|---|
| World Bank World Development Indicators (≈55 series, CC BY 4.0) | GDP per capita, sector shares, trade, tax, debt, R&D, health, education, demography, energy, military, environment |
| Worldwide Governance Indicators (World Bank) | voice & accountability, stability, effectiveness, regulation, rule of law, corruption control |
| UNDP Human Development Report | HDI, schooling, gender inequality |
| Natural Earth populated places | 3,067 real cities; provinces are named after their largest |
| Esri World Imagery / NASA VIIRS Black Marble | day satellite and night-lights basemaps |

WEF Global Competitiveness, Brand Finance Soft Power, EIU Democracy, TI CPI, Freedom House and similar indices are
proprietary or discontinued, so their *methodologies* are reproduced from the open data above (see `shared/indices.ts`).
Taiwan isn't covered by the World Bank, so it uses public estimates (marked "est." in-game). Missing values are imputed
from the median of countries in the same region and income group.

## How the simulation thinks (v3)
- **Every effect is situational.** Each policy has headline effects, *situational* effects that read the nation's
  condition vector (`shared/conditions.ts`: development, age structure, debt, credit gap, resource dependence, openness,
  inequality, cohesion, climate stress, automation, the energy transition…) and effects that change with the
  years it has been in force. Repealing entitlements causes a backlash (`onLeave`). See `shared/policies.ts`.
- **Long-term forces.** Population by age (`demography.ts`) drives labour supply, pensions and health costs;
  a private credit cycle (`finance.ts`) builds booms that end in banking crises; currency pegs can break; fiscal rules
  buy credibility. World trends (`trends.ts`): emissions heat the planet, clean tech spreads and cuts oil demand,
  automation reshapes which development paths work; oil and minerals deplete.
- **Power.** Political capital pays for every change (`shared/power.ts`, `power.ts`). Six parties compete for the
  factions' votes; elections produce seats and coalitions; players who lose go into opposition while a rival party
  governs. Autocrats face coups and revolutions instead.
- **Causality you can see.** Drivers (`n.drivers`) decompose growth, inflation, unemployment, credit, stability,
  legitimacy, approval by faction, political capital, corruption, institutions, fertility and coup risk. The risk radar
  (`risks.ts`) ranks pressures building up. Situational crises (`events.ts`) fire when conditions call for them.
- Balancing tools: `npx jiti scripts/sim.ts 20` runs a headless world for 20 years; `scripts/debug-*.ts` inspect one
  nation's finances, growth by sector and the oil market; `scripts/test-power.ts` plays an election defeat and comeback.

## Architecture
- `scripts/`: data fetch and world build. The world is 1,915 H3 hex provinces over real land, each mapped to its real country.
- `shared/`: data-driven catalogs: 17 industries (`sectors.ts`), ~50 policies plus budget and provincial policy (`policies.ts`), 24 projects (`projects.ts`), 65 indices (`indices.ts`).
- `server/game/`: the authoritative simulation (one tick = one game day). Besides the modules below: `conditions.ts`, `demography.ts`, `finance.ts`, `trends.ts`, `power.ts`, `risks.ts`, `trajectory.ts`.
  - `economy.ts`: per-province employment across 17 sectors, productivity, local services, people. Calibrated so the start date matches real data, then driven by policy.
  - `nation.ts`: revenue (income, payroll, corporate, VAT, tariffs, resource rents), budget, debt, credit rating, inflation, defaults, slow national capital (tech, institutions, corruption, culture, brands, military).
  - `trade.ts`: weekly world markets per sector, gravity-model bilateral trade balanced with RAS, tariffs, embargoes, sanctions, blockades, trade blocs, aid, and the influence matrix.
  - `politics.ts`: eight factions weighted by demographics and system of government; elections, coups, revolutions, unrest, secession.
  - `indices.ts`: all indices daily, including soft power pillars and comprehensive national power.
  - `ai.ts`: ideology derived from real data; utility-based policy choice, national strategy, fiscal rules, projects, tariffs, sanctions, embargoes, blocs, aid, alliances, war.
  - `events.ts`: dilemmas, world shocks, disasters, the World Games.
- `app/`: Nuxt 4 client. MapLibre globe (cities, skylines, industry badges, armies, animated trade lanes, 11 map modes, day/night), the Government dashboard, and an isometric province view generated from each province's state.

## Guide & videos
- **In-game guide:** `/guide` (📖 in the top bar) covers controls, every system, and reference tables generated from the game's own catalogs (industries, all policies with their exact effects, budget lines, projects, indices), plus data sources.
- **Videos:** `public/media/states-trailer.mp4` (the trailer, a "leaked briefing" dossier) and `public/media/states-guide.mp4` (a cursor-driven walkthrough, shown on `/guide`). Both are composed on a canvas from real screenshots of a scripted multiplayer world, and the soundtrack is synthesised from the composition's cue list. To regenerate them (needs Chrome and ffmpeg):
  ```bash
  GAME_MONTH_MS=3000 STATES_DATA_DIR=.data-video npx nuxi dev --port 4100 --host 127.0.0.1      # fast clock while seeding
  node scripts/video/seed.mjs http://127.0.0.1:4100                                             # four players, café threads, deals, a broken treaty, a war
  GAME_MONTH_MS=3600000 STATES_DATA_DIR=.data-video npx nuxi dev --port 4100 --host 127.0.0.1   # restart on the slow clock
  node scripts/video/capture.mjs http://127.0.0.1:4100                                          # stills + tutorial steps → video/assets
  node scripts/video/preview.mjs compose-briefing.html 10 40 70                                 # spot-check frames
  node scripts/video/render.mjs --page compose-briefing.html --out public/media/states-trailer.mp4 --bed drone
  node scripts/video/render.mjs --page compose-tutorial.html --out public/media/states-guide.mp4 --bed pad
  ```

## Deploy (Hetzner VPS + Coolify)
The game is one Node process (Nuxt client + Nitro WebSocket server + the simulation). The `Dockerfile` builds it.
1. Push this repo to GitHub. In Coolify, go to **New Resource → Public/Private Repository**, choose **Build Pack: Dockerfile** and set **port 3000**.
2. **Persistent storage:** add a volume mounted at `/app/.data`. The world save (`world-v2.json`) lives there and survives redeploys.
3. **Environment (optional):** `GAME_MONTH_MS` (default `3600000`, so 1 game month = 1 real hour).
4. Add your domain. Coolify's proxy issues HTTPS and passes WebSockets (`/_ws`) through automatically.
5. The health check is `GET /api/health`. The world saves every game month and on shutdown, so a redeploy loses at most the last few minutes.

**Playing on several devices:** your nation is tied to a secret key stored in the browser. In the nation panel,
**📱 Play on another device** copies a link that signs another browser (e.g. your phone) into the same nation.
On a phone, use "Add to Home Screen" for a full-screen app.

## Deals, treaties & the language model
Nations negotiate in **Comms** (DMs → “📜 Propose a deal”). A deal is a list of enforceable clauses
(`shared/deals.ts`): payments, loans, tariff caps, supply contracts, technology sharing, province transfers,
policy commitments, non-aggression, alliances, trade pacts, aid, peace, and free-form promises. Clauses act on the
simulation every month (`server/game/deals.ts`); breaking one is public, costs legitimacy and diplomatic standing,
and gives the victim a just cause for war (no aggressor stigma).

Players can also **write any deal in plain words**: a self-hosted model compiles it into clauses, constrained to a
JSON schema; anything it can't express becomes a public promise. Set it up in Coolify:
1. Add a service from the image `ollama/ollama` (name it `ollama`, volume at `/root/.ollama`, same network as STATES).
2. Pull a model once, from the service's terminal: `ollama pull qwen2.5:7b-instruct` (8 GB RAM; use `qwen2.5:3b-instruct`
   on 4 GB, `qwen2.5:14b-instruct` on 16 GB+).
3. On the STATES app set `LLM_URL=http://ollama:11434/v1` and `LLM_MODEL=qwen2.5:7b-instruct`, then redeploy.
Any OpenAI-compatible endpoint works (`LLM_KEY` for hosted APIs such as DeepSeek or Moonshot/Kimi). Without
`LLM_URL`, players build deals clause by clause.
