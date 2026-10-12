<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { SECTORS, type SectorReq } from '~~/shared/sectors'
import { POLICIES, POLICY_CATEGORIES, BUDGET, LOCAL_POLICIES, BLOCS, type ChoicePolicy, type SliderPolicy } from '~~/shared/policies'
import { PROJECTS } from '~~/shared/projects'
import { INDICES, INDEX_CATEGORIES } from '~~/shared/indices'
import { STRATEGIES, GOV_LABEL } from '~~/shared/rules'
import { effectChips } from '~/utils/effects'

const TOC = [
  ['start', 'Quick start'], ['clock', 'Time & pacing'], ['globe', 'The globe'], ['found', 'Founding a nation'], ['government', 'The Government'],
  ['economy', 'Industries'], ['budget', 'Taxes, budget & debt'], ['policies', 'Policy reference'], ['provinces', 'Provinces & projects'],
  ['politics', 'Factions & stability'], ['foreign', 'Trade & foreign policy'], ['war', 'War'], ['soft', 'Soft power & the World Games'],
  ['indices', 'Index glossary'], ['strategies', 'Strategies'], ['data', 'Data & methodology'], ['faq', 'Shortcuts & FAQ'], ['dev', 'Running a server'],
] as const
const active = ref('start')
const root = ref<HTMLElement>()
function onScroll() {
  const el = root.value
  if (!el) return
  for (const [id] of [...TOC].reverse()) {
    const s = document.getElementById(id)
    if (s && s.getBoundingClientRect().top < 140) { active.value = id; return }
  }
  active.value = 'start'
}
onMounted(() => root.value?.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => root.value?.removeEventListener('scroll', onScroll))
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

const policyCat = ref<string>('economy')
const policies = computed(() => POLICIES.filter(p => p.category === policyCat.value))
const req = (r: SectorReq) => Object.entries(r).filter(([, v]) => v).map(([k, v]) => `${({ gdppc: 'GDP/cap $', hc: 'education ', tech: 'technology ', infra: 'infrastructure ', inst: 'institutions ' } as Record<string, string>)[k]}${k === 'gdppc' ? v!.toLocaleString() : v}`).join(' · ') || 'none'
const projReq = (r: Record<string, unknown> = {}) => Object.entries(r).map(([k, v]) => (v === true ? k : `${k} ≥ ${v}`)).join(', ') || '—'
const MAP_MODES = [
  ['Political', 'Who owns what. Your borders glow; war fronts are dashed red.'],
  ['Diplomatic', 'You, allies, bloc partners, trade pacts, sanctioned states and enemies at a glance.'],
  ['Trade blocs', 'Customs unions and free-trade areas in their bloc colours.'],
  ['My influence', 'How much each nation depends on you, from trade, aid, alliances and attraction.'],
  ['Wealth', 'GDP per person in every province (log scale).'],
  ['Development', 'Average of infrastructure, education and health.'],
  ['Industry', 'Each province coloured by its biggest tradable industry.'],
  ['Resources', 'Oil, metals, fertile land and strategic straits.'],
  ['Population', 'Where the people are.'],
  ['Unrest', 'Provinces close to revolt.'],
  ['Terrain', 'Plains, deserts, mountains, rainforest… terrain sets farming, defence and productivity.'],
]
const TOOLS = [
  ['📜 Trade pact', 'Halves tariffs both ways and adds +40% trade intensity. Proposed; the other side must accept.'],
  ['🌐 Trade bloc', 'Members trade tariff-free (+80% intensity) behind a common external tariff you set. The largest economy leads it and gains influence.'],
  ['✎ Bilateral tariff', 'Set any tariff on any one nation, overriding your general rate. Above 25% they will resent it, and AI nations may retaliate.'],
  ['💳 Sanctions', 'Financial pressure: halves trade, cuts their foreign investment and credit rating. Its strength scales with the sanctioners\' share of world GDP, so coalitions matter.'],
  ['⛔ Embargo', 'No trade at all. Painful for both sides; the target looks elsewhere.'],
  ['🎁 Development aid', '60% of your diplomacy budget is split among up to five recipients. It buys goodwill and dependence (influence).'],
  ['🤝 Alliance', 'Allies automatically join defensive wars, and they never fight each other.'],
  ['⚓ Naval blockade', 'At war, with a navy at least 20% stronger than theirs: their sea trade collapses by three quarters.'],
]
</script>

<template>
  <div ref="root" class="guide">
    <header class="topbar">
      <a href="/" class="brand"><span class="logo">STATES</span><span class="muted">Guide & resources</span></a>
      <a href="/" class="btn primary">▶ Back to the world</a>
    </header>
    <div class="layout">
      <nav class="toc">
        <div class="toc-title">Contents</div>
        <button v-for="[id, label] in TOC" :key="id" :class="{ on: active === id }" @click="go(id)">{{ label }}</button>
      </nav>

      <main class="doc">
        <section class="hero">
          <div class="eyebrow">How to play</div>
          <h1>Run a country on a living planet.</h1>
          <p class="lead">STATES is a multiplayer nation simulation on a 3D globe. Every province of Earth runs its own economy, seeded from real World Bank, UNDP and governance data. You set the policies; the world plays them out, day by day, alongside other players and AI powers with their own ideologies.</p>
          <video class="demo" src="/media/states-demo.mp4" controls playsinline preload="metadata" poster="/media/states-poster.jpg" />
        </section>

        <section id="start">
          <h2>Quick start</h2>
          <ol class="steps">
            <li><b>Pick a homeland.</b> Click any unclaimed province on the globe. The founding panel shows what you inherit: population, wealth, oil, farmland, straits and the land's real-world development and institutions.</li>
            <li><b>Declare independence.</b> Name your nation, choose a colour and motto. You start with your province plus its unclaimed neighbours, and three years of international protection.</li>
            <li><b>Open the Government</b> (🏛 button). Set taxes and the budget, choose up to three target industries, and review your policies by ministry.</li>
            <li><b>Develop your provinces.</b> Double-click a province (or <i>Enter province view</i>) to see its city, set local policy and build projects: ports, universities, tech parks, resorts…</li>
            <li><b>Engage the world.</b> Sign trade pacts, form a trade bloc, send aid, apply tariffs or sanctions, ally, or go to war. Answer the cabinet dilemmas (📜) as they arrive.</li>
          </ol>
          <div class="callout">💡 Nothing happens instantly. Spending raises education, health and infrastructure over years; industries migrate toward profit over months. Plan like a government, not like a gamer.</div>
        </section>

        <section id="clock">
          <h2>Time & pacing</h2>
          <p>One tick is one game day. On a live server <b>one game month lasts one real hour</b> (a year takes 12 hours), so a policy that needs a decade to pay off plays out over a few real days. The date and a progress bar for the current day sit in the top-left.</p>
          <p>A game day passes every 2 real minutes, and a game week (when AI nations make their moves, markets clear and your trajectory is sampled) every 14 minutes. On development servers a dashed <b>▶ ⏩ ⏭ 🚀</b> control in the top bar fast-forwards the whole world, up to about a month every two seconds.</p>
          <ul>
            <li><b>Daily:</b> every province's employment, output, services and people; national finances; factions; battles; every index.</li>
            <li><b>Weekly:</b> world markets clear, trade flows and influence are recalculated, AI nations make decisions.</li>
            <li><b>Monthly:</b> histories are recorded, elections fall due, cabinet dilemmas arrive, world events and disasters strike, the world is saved.</li>
          </ul>
        </section>

        <section id="globe">
          <h2>The globe</h2>
          <div class="grid2">
            <div>
              <h3>Controls</h3>
              <table class="tbl"><tbody>
                <tr><td>Drag</td><td>Rotate the globe / pan</td></tr>
                <tr><td>Scroll</td><td>Zoom from orbit down to street-level satellite imagery</td></tr>
                <tr><td>Click a province</td><td>Inspect it (right panel)</td></tr>
                <tr><td>Double-click</td><td>Enter the province view (isometric city)</td></tr>
                <tr><td>Click a nation</td><td>From panels, rankings and diplomacy lists</td></tr>
                <tr><td>Esc</td><td>Close the topmost window</td></tr>
                <tr><td>☀ / 🌙</td><td>Day satellite or NASA night lights</td></tr>
                <tr><td>🚢</td><td>Show or hide trade routes and shipping</td></tr>
              </tbody></table>
            </div>
            <div>
              <h3>What you see</h3>
              <ul>
                <li><b>Cities:</b> 3,067 real cities. They glow at night, and as you zoom in they become skylines that grow with population and wealth.</li>
                <li><b>Industry badges:</b> each province's dominant industry; 🏗 marks construction.</li>
                <li><b>Shields:</b> garrisons of 5,000+ troops.</li>
                <li><b>Trade arcs & ships:</b> the 70 largest bilateral trade flows.</li>
                <li><b>Red arrows:</b> offensives on the move; they resolve when they arrive.</li>
              </ul>
            </div>
          </div>
          <h3>Map modes</h3>
          <table class="tbl"><tbody><tr v-for="[m, d] in MAP_MODES" :key="m"><td class="nowrap"><b>{{ m }}</b></td><td>{{ d }}</td></tr></tbody></table>
        </section>

        <section id="found">
          <h2>Founding a nation</h2>
          <p>Geography is destiny, but so is history. Each province belongs to a real country in the data, and your new state inherits its people, development and institutions: GDP per capita, schooling, health, infrastructure, corruption, rule of law, inequality, even the homicide rate. A state founded in Doha begins rich, oil-fuelled and food-importing; one in Lagos begins poor, young and fast-growing.</p>
          <ul>
            <li><b>Starting territory:</b> the clicked province plus all unclaimed neighbours (excluding ice).</li>
            <li><b>Protection:</b> nobody can declare war on you for three game years — unless you declare war first.</li>
            <li><b>Expanding:</b> annex bordering unclaimed land (or across a short sea) for a price that rises with size. Land from another real country's heritage starts as <i>non-core</i> (more unrest) and becomes heartland after ~15 years of calm rule.</li>
            <li><b>Multiple nations:</b> one per browser. Add <code>?player=2</code> to the URL to play a second one.</li>
          </ul>
        </section>

        <section id="government">
          <h2>The Government</h2>
          <p>Open it with 🏛 in the top bar or the Situation panel. Ministries:</p>
          <div class="cards">
            <div class="card"><b>🏛 Overview</b><p>Alerts, headline indices with world ranks and trends, factions and their political weight, national capital, world standing.</p></div>
            <div class="card"><b>📈 Trajectory</b><p>Weekly history of 30+ indices with every decision you (or any nation) made pinned on the chart: policies, budget lines, provincial policy, projects, wars, treaties and territory. Each decision shows what the chosen metric did over the next 6 months. Overlay a rival to compare paths.</p></div>
            <div class="card"><b>📊 All indices</b><p>All {{ INDICES.length }} indices with value, world rank, median and method. Click one for its history and world leaders.</p></div>
            <div class="card"><b>🗺 Territories</b><p>Every province in a sortable table: people, GDP, jobs, happiness, unrest, education, projects. Click to enter.</p></div>
            <div class="card"><b>🏭 Industry & markets</b><p>Output, jobs, exports, imports and world price for 17 industries; what is locked and why; pick subsidy targets.</p></div>
            <div class="card"><b>💰 Taxes & budget</b><p>Four tax sliders with live effect previews, thirteen budget lines, revenue and spending breakdown, debt and credit rating.</p></div>
            <div class="card"><b>🏥 ⚖ 🗳 🌱 Policy ministries</b><p>Welfare, society & rights, governance, environment. Hover any option to see its exact effects.</p></div>
            <div class="card"><b>🎭 Culture & soft power</b><p>Seven soft-power pillars, quick budget levers, cultural policies, and World Games bidding.</p></div>
            <div class="card"><b>🌐 Trade & foreign policy</b><p>Every nation: trade, tariffs both ways, influence both ways, AI attitude, and every diplomatic tool.</p></div>
            <div class="card"><b>🎖 Defence</b><p>Forces, navy and air power, doctrine and conscription, wars, offensives in motion, garrisons.</p></div>
            <div class="card"><b>🌍 World & rankings</b><p>Rank all nations on any index; commodity prices; trade blocs; wars.</p></div>
          </div>
        </section>

        <section id="economy">
          <h2>Industries</h2>
          <p>Each province employs its workers across 17 sectors. Output = jobs × value added × productivity × world price. Productivity rises with education, infrastructure, technology and institutions. Workers drift (slowly) toward the industries that pay best where they live; cheap-labour industries migrate away as wages rise; higher tiers unlock as you develop. Subsidies, provincial focus, special economic zones and projects steer the process.</p>
          <table class="tbl">
            <thead><tr><th>Industry</th><th>Tier</th><th>Traded</th><th>Needs to unlock</th><th>Location factor</th><th>Notes</th></tr></thead>
            <tbody><tr v-for="s in SECTORS" :key="s.id">
              <td class="nowrap"><b>{{ s.icon }} {{ s.label }}</b></td><td>{{ s.tier }}</td><td>{{ s.tradable ? 'world market' : 'domestic' }}</td>
              <td>{{ req(s.req) }}</td><td>{{ s.resource ?? 'cities' }}</td><td class="muted">{{ s.desc }}</td>
            </tr></tbody>
          </table>
          <p class="muted small">World prices for traded sectors move with global supply and demand every week: a glut of steel lowers its price everywhere; an oil-strait war spikes crude.</p>
        </section>

        <section id="budget">
          <h2>Taxes, budget & debt</h2>
          <p>Revenue comes from income tax, social contributions (set by your welfare model), corporate tax, VAT, tariffs and the state's share of oil and mining rents (larger under state capitalism). How much you actually collect depends on institutions, administration spending and corruption. Spending is set as a share of GDP:</p>
          <table class="tbl"><thead><tr><th>Line</th><th>Default</th><th>Max</th><th>What it does</th></tr></thead>
            <tbody><tr v-for="b in BUDGET" :key="b.id"><td class="nowrap">{{ b.icon }} {{ b.label }}</td><td>{{ b.default }}%</td><td>{{ b.max }}%</td><td>{{ b.desc }}</td></tr></tbody>
          </table>
          <ul>
            <li><b>Deficits</b> become debt. Debt costs interest at your bond yield, which rises as your credit rating falls (debt, inflation, institutions, stability, sanctions, war).</li>
            <li>A politically controlled central bank prints money for deficits, which means inflation.</li>
            <li>Above roughly 220% of GDP a nation <b>defaults</b>: a 60% haircut, collapsing confidence, an inflation spike and a hit to institutions.</li>
          </ul>
        </section>

        <section id="policies">
          <h2>Policy reference</h2>
          <p>Every policy is a set of modifiers, summed every day. These are the real numbers the simulation uses.</p>
          <div class="seg cats"><button v-for="c in POLICY_CATEGORIES" :key="c.id" :class="{ on: policyCat === c.id }" @click="policyCat = c.id">{{ c.icon }} {{ c.label }}</button></div>
          <div v-for="p in policies" :key="p.id" class="pol">
            <div class="pol-head"><b>{{ p.label }}</b><span class="muted small">{{ p.desc }}</span></div>
            <template v-if="p.kind === 'choice'">
              <div v-for="o in (p as ChoicePolicy).options" :key="o.id" class="opt-row">
                <div class="opt-name">{{ o.label }}<span v-if="o.id === p.default" class="tag">default</span></div>
                <div class="chips"><span v-for="c in effectChips(o.mods, 10)" :key="c.text" class="chip" :class="c.good ? 'g' : 'b'">{{ c.text }}</span><span v-if="!Object.keys(o.mods).length" class="muted small">baseline</span></div>
              </div>
            </template>
            <template v-else>
              <div class="opt-row"><div class="opt-name">{{ (p as SliderPolicy).min }}{{ (p as SliderPolicy).unit }}</div><div class="chips"><span v-for="c in effectChips((p as SliderPolicy).mods((p as SliderPolicy).min), 8)" :key="c.text" class="chip" :class="c.good ? 'g' : 'b'">{{ c.text }}</span></div></div>
              <div class="opt-row"><div class="opt-name">{{ (p as SliderPolicy).max }}{{ (p as SliderPolicy).unit }}</div><div class="chips"><span v-for="c in effectChips((p as SliderPolicy).mods((p as SliderPolicy).max), 8)" :key="c.text" class="chip" :class="c.good ? 'g' : 'b'">{{ c.text }}</span></div></div>
            </template>
          </div>
        </section>

        <section id="provinces">
          <h2>Provinces & projects</h2>
          <p>Every province has its own population, urbanisation, jobs, output, local infrastructure, education, health, safety, housing and pollution, plus happiness and unrest. National spending on infrastructure, health and education is shared among provinces by population × <i>investment priority</i>.</p>
          <h3>Provincial policies</h3>
          <table class="tbl"><tbody><tr v-for="lp in LOCAL_POLICIES" :key="lp.id"><td class="nowrap"><b>{{ lp.label }}</b></td><td><span v-for="o in lp.options" :key="o.id" class="opt-inline"><b>{{ o.label }}</b><span v-if="o.desc" class="muted"> — {{ o.desc }}</span></span></td></tr></tbody></table>
          <h3>Projects</h3>
          <p>Costs scale with your national price level; at most two projects can be under construction in a province at once. Completed projects appear in the city view.</p>
          <table class="tbl"><thead><tr><th>Project</th><th>Base cost</th><th>Time</th><th>Requires</th><th>Effect</th></tr></thead>
            <tbody><tr v-for="p in PROJECTS" :key="p.id"><td class="nowrap"><b>{{ p.icon }} {{ p.label }}</b></td><td>${{ p.cost }}B</td><td>{{ p.months }} mo</td><td>{{ projReq(p.req) }}</td><td class="muted">{{ p.desc }}</td></tr></tbody>
          </table>
        </section>

        <section id="politics">
          <h2>Factions & stability</h2>
          <p>Eight factions judge you every day: on the policies they care about and on outcomes such as jobs, prices, growth, safety, freedom and war. Their <b>weight</b> comes from demographics (industry empowers unions, cities and schooling the middle class and progressives, farmland the rural bloc) and from your system of government (juntas listen to generals, theocracies to clerics).</p>
          <div class="chips big"><span v-for="b in BLOCS" :key="b.id" class="chip">{{ b.icon }} {{ b.label }}</span></div>
          <ul>
            <li><b>Approval</b> is the weighted average. <b>Stability</b> follows approval and legitimacy, minus war weariness, unrest, debt crises and shortages.</li>
            <li><b>Elections</b> every four years in democracies and constitutional monarchies: lose, and the incoming coalition reverses your most unpopular policy.</li>
            <li><b>Coups</b> happen when the military is furious and stability is low. <b>Revolutions</b> topple unpopular autocracies.</li>
            <li><b>Unrest</b> builds in unhappy, jobless, occupied or non-core provinces. Above ~88% a province may revolt, rejoining its old homeland or forming a new state. Garrisons, police, autonomy and martial law hold it down, at a price.</li>
          </ul>
          <p class="muted small">Systems of government: {{ Object.values(GOV_LABEL).join(' · ') }}.</p>
        </section>

        <section id="foreign">
          <h2>Trade & foreign policy</h2>
          <p>Trade follows a gravity model: big economies that are close, open and friendly trade more. Every flow creates <b>dependence</b>, and dependence is <b>influence</b>. AI nations weigh their attitude to you from ideology, trade, your influence over them, your soft power, shared enemies, alliances, sanctions and grievances.</p>
          <table class="tbl"><tbody><tr v-for="[t, d] in TOOLS" :key="t"><td class="nowrap"><b>{{ t }}</b></td><td>{{ d }}</td></tr></tbody></table>
        </section>

        <section id="war">
          <h2>War</h2>
          <ol>
            <li><b>Declare war</b> on a nation that isn't protected, allied or under truce. Their allies join automatically, and democracies may sanction you as an aggressor.</li>
            <li><b>Mass troops</b> on the border: deploy reserves into frontier provinces, or use <i>Deploy reserves to borders</i>.</li>
            <li><b>Launch offensives</b> from the province panel of an enemy province next to yours (by land, or across a short sea crossing as an amphibious assault). Troops march for 5–15 days and fight on arrival.</li>
            <li><b>Battles</b> weigh troops × quality (military tech, education) against garrison plus militia × terrain (mountains ×1.8) × capital and base bonuses. Air superiority multiplies both sides; naval superiority makes amphibious assaults viable.</li>
            <li>Captured provinces are <b>occupied</b>: low output, high unrest, for two years.</li>
            <li><b>Peace</b> must be proposed and accepted, and brings a one-year truce. War weariness grows with time and casualties.</li>
          </ol>
        </section>

        <section id="soft">
          <h2>Soft power & the World Games</h2>
          <p>Soft power (0–100) blends seven pillars: culture & media, business & brands, governance & values, education & science, international relations, tourism and sport. It attracts tourists and audiences to your exports, investment and migrants to your economy, and goodwill from other governments.</p>
          <p>Every four years the <b>World Games</b> take place. Bidding opens 30 months before; the best bid (weighed by infrastructure, stability and soft power) wins and pays on award. Hosts get a stadium and a lasting sports boost; medals go to the nations with the strongest sport.</p>
        </section>

        <section id="indices">
          <h2>Index glossary</h2>
          <div v-for="c in INDEX_CATEGORIES" :key="c.id">
            <h3>{{ c.icon }} {{ c.label }}</h3>
            <table class="tbl"><tbody><tr v-for="i in INDICES.filter(x => x.category === c.id)" :key="i.id"><td class="nowrap"><b>{{ i.label }}</b></td><td>{{ i.higher ? '↑ higher is better' : '↓ lower is better' }}</td><td class="muted">{{ i.method }}<span v-if="i.desc"> — {{ i.desc }}</span></td></tr></tbody></table>
          </div>
        </section>

        <section id="strategies">
          <h2>Strategies</h2>
          <p>There is no single way to win: rankings exist for every index. AI nations pick one of these national strategies from their real data; you can play any of them.</p>
          <div class="cards">
            <div v-for="[id, s] in Object.entries(STRATEGIES).filter(([k]) => k !== 'player')" :key="id" class="card"><b>{{ s.label }}</b><p>{{ s.desc }}</p></div>
          </div>
          <ul>
            <li><b>Rentier:</b> keep taxes low and let oil rents pay. Diversify before prices crash; tech parks and finance districts are your exit.</li>
            <li><b>Knowledge economy:</b> education 5–6%, R&D 2–3%, research universities, tech parks, free university. Electronics, pharma, software and finance unlock and dominate.</li>
            <li><b>Export manufacturing:</b> infrastructure, ports, industrial zones, special economic zones, FDI incentives and open trade, while wages are still low.</li>
            <li><b>Welfare state:</b> high taxes, universal healthcare, generous safety net. Happiness, HDI and stability lead the world; watch competitiveness and debt.</li>
            <li><b>Superpower:</b> economy first, then air and naval power, alliances, a trade bloc you lead, aid networks, and soft power to make the world want what you want.</li>
          </ul>
        </section>

        <section id="data">
          <h2>Data & methodology</h2>
          <table class="tbl"><thead><tr><th>Source</th><th>Used for</th></tr></thead><tbody>
            <tr><td><a href="https://data.worldbank.org" target="_blank" rel="noopener">World Bank World Development Indicators</a></td><td>≈55 series: GDP per capita (PPP), sector shares, trade, tax revenue, debt, R&D, health and education spending, demography, urbanisation, internet, energy, military, pollution, tourism</td></tr>
            <tr><td><a href="https://www.worldbank.org/en/publication/worldwide-governance-indicators" target="_blank" rel="noopener">Worldwide Governance Indicators</a></td><td>Voice & accountability, political stability, government effectiveness, regulatory quality, rule of law, control of corruption</td></tr>
            <tr><td><a href="https://hdr.undp.org/data-center" target="_blank" rel="noopener">UNDP Human Development Report</a></td><td>HDI, mean and expected years of schooling, gender inequality</td></tr>
            <tr><td><a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a></td><td>3,067 populated places; country polygons</td></tr>
            <tr><td><a href="https://h3geo.org" target="_blank" rel="noopener">Uber H3</a></td><td>The 1,915-province hex grid</td></tr>
            <tr><td>Esri World Imagery · NASA VIIRS Black Marble</td><td>Day and night basemaps</td></tr>
          </tbody></table>
          <ul>
            <li><b>Calibration:</b> at world creation every province is tuned so its GDP per capita, sector mix, services, happiness and population match its real country. From then on, policy drives everything, and the calibration offsets fade over decades.</li>
            <li><b>Proprietary indices</b> (WEF competitiveness, EIU democracy, Brand Finance soft power, Transparency International, Freedom House…) are not open, so their published methods are reproduced from the open data.</li>
            <li><b>Gaps:</b> Taiwan uses public estimates; other missing values use the median of the same region and income group.</li>
          </ul>
        </section>

        <section id="faq">
          <h2>Shortcuts & FAQ</h2>
          <dl>
            <dt>My nation is losing money. What do I do?</dt><dd>Check Taxes & budget. Social contributions follow your welfare model, VAT is efficient, and corporate tax hurts investment. Cut low-value spending, or grow the economy with infrastructure and education.</dd>
            <dt>Why is an industry locked?</dt><dd>Industry & markets shows exactly what is missing (e.g. "technology 48 / 55"). Raise R&D and education, build universities and tech parks.</dd>
            <dt>Why are people unhappy?</dt><dd>Province happiness follows income, health, safety, housing, jobs, pollution, freedom and corruption. Use the city view's Overview tab and the Unrest map mode.</dd>
            <dt>Someone declared war on me!</dt><dd>Deploy reserves to the border, raise defence spending, ask allies for help, propose peace, or build bases in frontier provinces. Mountains defend well.</dd>
            <dt>What do the cabinet dilemmas do?</dt><dd>Each option changes factions, budgets, stocks or policies. Unanswered dilemmas expire and cost a little stability.</dd>
            <dt>Can I start over?</dt><dd>Situation panel → Dissolve nation. Your land returns to the world and you can found again.</dd>
          </dl>
        </section>

        <section id="dev">
          <h2>Running a server</h2>
          <pre><code>npm install
npm run dev          # live clock: 1 month = 1 hour
npm run dev:fast     # 1 month = 30 seconds
GAME_MONTH_MS=600000 npm run dev   # any speed
npm run fetch:data   # re-download World Bank / WGI / UNDP / Natural Earth
npm run build:world  # rebuild provinces, cities, countries</code></pre>
          <p class="muted small">The world is saved to <code>.data/world-v2.json</code> every game month and on shutdown; delete it to regenerate. Architecture notes are in the README.</p>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.guide { position: fixed; inset: 0; overflow-y: auto; background: radial-gradient(ellipse at top, #0d1830 0%, #05080f 55%); color: var(--text); scroll-behavior: smooth; }
.topbar { position: sticky; top: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center; padding: 12px 28px; background: rgba(5, 8, 15, 0.85); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
.brand { display: flex; gap: 14px; align-items: baseline; text-decoration: none; color: inherit; }
.logo { font-weight: 900; letter-spacing: 0.32em; font-size: 16px; }
.layout { display: grid; grid-template-columns: 230px 1fr; gap: 40px; max-width: 1280px; margin: 0 auto; padding: 30px 28px 120px; }
.toc { position: sticky; top: 80px; align-self: start; display: flex; flex-direction: column; gap: 1px; max-height: calc(100vh - 100px); overflow-y: auto; }
.toc-title { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); font-weight: 700; margin-bottom: 8px; }
.toc button { text-align: left; background: none; border: 0; border-left: 2px solid var(--line); padding: 6px 12px; font-size: 13px; color: #aeb6c4; }
.toc button.on { border-left-color: var(--accent); color: var(--accent); font-weight: 600; }
.doc { min-width: 0; font-size: 15px; line-height: 1.65; }
section { padding-top: 26px; scroll-margin-top: 70px; }
.hero { padding-top: 6px; }
.eyebrow { color: var(--accent); font-size: 12px; letter-spacing: .18em; text-transform: uppercase; font-weight: 800; }
h1 { font-size: 46px; line-height: 1.1; margin: 8px 0 14px; letter-spacing: -0.02em; }
h2 { font-size: 27px; margin: 26px 0 10px; padding-top: 16px; border-top: 1px solid var(--line); }
h3 { font-size: 17px; margin: 18px 0 8px; }
.lead { font-size: 18px; color: #c9d0db; max-width: 820px; }
.demo { width: 100%; border-radius: 14px; border: 1px solid var(--line-strong); margin-top: 16px; background: #000; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.steps li { margin-bottom: 10px; }
.callout { background: rgba(255, 212, 59, .08); border: 1px solid rgba(255, 212, 59, .3); border-radius: 10px; padding: 12px 16px; font-size: 14px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
.card { background: rgba(255,255,255,.035); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
.card p { margin: 4px 0 0; font-size: 13px; color: #b6bfcc; line-height: 1.5; }
.tbl { font-size: 13.5px; margin: 6px 0 12px; }
.tbl th { position: static; background: none; }
.nowrap { white-space: nowrap; }
.small { font-size: 13px; }
.cats { flex-wrap: wrap; margin: 10px 0 14px; }
.cats button { flex: none; padding: 6px 12px; }
.pol { border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; margin-bottom: 10px; background: rgba(255,255,255,.02); }
.pol-head { display: flex; flex-direction: column; margin-bottom: 6px; }
.opt-row { display: grid; grid-template-columns: 200px 1fr; gap: 10px; padding: 5px 0; border-top: 1px solid rgba(255,255,255,.05); }
.opt-name { font-size: 13.5px; font-weight: 600; }
.opt-name .tag { margin-left: 6px; }
.opt-inline { display: inline-block; margin-right: 14px; font-size: 13.5px; }
.chips.big .chip { font-size: 13px; padding: 4px 10px; }
pre { background: rgba(0,0,0,.4); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; overflow-x: auto; font-size: 13px; }
code { font-family: 'JetBrains Mono', monospace; font-size: .92em; }
dt { font-weight: 700; margin-top: 12px; }
dd { margin: 2px 0 0 0; color: #c0c8d4; }
a { color: var(--blue); }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } .toc { display: none; } .grid2 { grid-template-columns: 1fr; } h1 { font-size: 34px; } .opt-row { grid-template-columns: 1fr; } }
</style>
