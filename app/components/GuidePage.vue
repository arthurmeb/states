<script setup lang="ts">
import { PARTIES } from '~~/shared/power'
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { SECTORS, type SectorReq } from '~~/shared/sectors'
import { POLICIES, POLICY_CATEGORIES, BUDGET, LOCAL_POLICIES, BLOCS, type ChoicePolicy, type SliderPolicy } from '~~/shared/policies'
import { PROJECTS } from '~~/shared/projects'
import { INDICES, INDEX_CATEGORIES } from '~~/shared/indices'
import { STRATEGIES, GOV_LABEL } from '~~/shared/rules'
import { effectChips } from '~/utils/effects'

const TOC = [
  ['start', 'Quick start'], ['clock', 'Time & pacing'], ['globe', 'The globe'], ['found', 'Founding a nation'], ['government', 'The Government'],
  ['power', 'Power & elections'], ['causality', 'Cause & effect'], ['forces', 'Long-term forces'],
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
          <video class="demo" src="/media/states-guide.mp4" controls playsinline preload="metadata" poster="/media/states-guide-poster.jpg" />
          <div class="trailer">
            <video class="demo" src="/media/states-trailer.mp4" controls playsinline preload="metadata" poster="/media/states-trailer-poster.jpg" />
            <p class="muted small">🎬 <b>The trailer:</b> a leaked briefing on four players, one broken treaty and a sultanate that should have read the fine print.</p>
          </div>
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
            <div class="card"><b>🏛 Overview</b><p>The risk radar, alerts, headline indices with world ranks and trends (click for <i>why?</i>), factions and their political weight, national capital, world standing.</p></div>
            <div class="card"><b>🗳 Power & elections</b><p>Political capital, polls, a seat projection, coalitions, the next election, campaigning, your party; in autocracies, the pillars of the regime and the risk of a coup or revolution.</p></div>
            <div class="card"><b>🧬 Long-term forces</b><p>Your population by age now and in 10 and 20 years, pensions, the credit cycle, where your debt is heading, climate, the energy transition, automation, your reserves, and every policy's age and current effect.</p></div>
            <div class="card"><b>⚙ Economic policy</b><p>Economic system, labour rules, minimum wage, central bank, foreign investment, capital controls, financial regulation, the exchange rate, fiscal rules, resource revenue, fuel prices, price controls, competition and land.</p></div>
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

        <section id="power">
          <h2>Power & elections</h2>
          <p>Governing is not free. Every government holds <b>political capital</b> (⚡, 0–100): the goodwill, majority and authority it can spend on change. Every policy switch, tax move, budget cut and provincial decree costs some, and the price is shown on every button before you click.</p>
          <ul>
            <li><b>What it costs:</b> a base cost plus the backlash among the factions that lose out, weighted by how much they matter. Cutting popular programmes costs far more than raising them; raising taxes more than cutting them; repealing an entitlement more the longer people have had it. Hurting the factions your own party depends on costs extra.</li>
            <li><b>What multiplies it:</b> a founding era (×0.3 for your first two years), a honeymoon after winning (×0.7), governing without a majority (up to ×2), and autocracy (×0.6).</li>
            <li><b>What rebuilds it:</b> approval, legitimacy, a parliamentary majority, a honeymoon, and some policies (patronage, unlimited campaign money, a captured judiciary). Instability drains it. Press <i>why?</i> on the Power screen for the breakdown.</li>
            <li><b>Running out:</b> in a democracy, parliament simply won't pass the change. An autocrat can rule by decree, paying the shortfall in legitimacy and stability.</li>
          </ul>
          <h3>Parties and elections</h3>
          <p>Six parties compete for the factions' votes. You choose yours when you found your nation and can re-found it on a new platform later (20 ⚡):</p>
          <div class="cards">
            <div v-for="p in PARTIES" :key="p.id" class="card"><b>{{ p.icon }} {{ p.name }}</b><p>{{ p.pitch }}</p></div>
          </div>
          <ul>
            <li>Each faction's vote depends on how it rates your government (its approval), the economy (growth, inflation, jobs), how long you have been in power (voters tire after ~4 years), any honeymoon, scandals if the press is free, and campaigning. Voters who leave you go to the party that best represents them.</li>
            <li><b>Seats</b> follow the electoral system: proportional (coalitions are normal), first past the post (big swings, majorities from modest leads) or mixed.</li>
            <li>Short of 50 seats, the largest party looks for like-minded partners. Coalition partners make reforms costlier, and walk out if their voters turn on you, which can force a snap election.</li>
            <li><b>Losing.</b> If another party forms the government you go into <b>opposition</b>: they run your nation on their own platform until the next election, and you can't change policy. You can campaign among factions (8 ⚡), table a motion of no confidence when they stumble (25 ⚡), and win it back.</li>
            <li>In government you can <b>call a snap election</b> (15 ⚡) to cash in a poll lead, and launch campaigns before a vote.</li>
          </ul>
          <h3>Autocracies</h3>
          <p>No elections, but no safety either. The army, business elites and security services are the pillars of the regime. An angry army in a state with weak institutions may stage a <b>coup</b>: you are ousted into exile until the junta collapses and elections return. Mass discontent without enough repression brings <b>revolution</b>, which proclaims a democracy you then have to win votes in. Purging the officers (15 ⚡) buys two coup-proof years at the cost of a weaker, resentful army.</p>
        </section>

        <section id="causality">
          <h2>Cause & effect</h2>
          <p>Nothing is a free lunch, and nothing works the same everywhere. Every policy has three layers of effect:</p>
          <ul>
            <li><b>Headline effects</b>, the same in every country (the chips in the policy reference below).</li>
            <li><b>Situational effects</b> that depend on your circumstances: how rich, educated, young or old, indebted, open, unequal, resource-dependent, urban, divided or well-governed you are, and the state of the world (oil prices, automation, the energy transition, climate). A living wage protects workers in a rich country and destroys formal jobs in a poor one; open immigration rescues an ageing workforce and inflames a country with mass unemployment; free markets without strong courts hand assets to oligarchs.</li>
            <li><b>Effects that change with time</b> in force. Tariffs help infant industries for about a decade, then shelter lazy incumbents. Rent control helps tenants now and starves the housing supply for decades. State media buys stability at first; after a few years nobody believes it. Printing money boosts growth, then inflation expectations come unmoored.</li>
          </ul>
          <p>Repealing an entitlement causes a <b>backlash</b> that grows with how long people have had it: fuel subsidies, price caps, early retirement, generous welfare, free university, universal healthcare. The policy cards warn you before you click.</p>
          <p>To see what is driving any number, click <b>why?</b>: on the Overview's headline cards, any faction's approval, political capital, inflation, unemployment, productivity growth, private credit, fertility, stability, legitimacy, corruption, institutions and coup risk. Each shows every force pushing it up or down, and the policies contributing most. The <b>risk radar</b> on the Overview ranks the pressures building up in your nation and links to where you can act; <b>Trajectory</b> pins every decision on the charts and shows what followed.</p>
        </section>

        <section id="forces">
          <h2>Long-term forces</h2>
          <p>A perfect set of policies today will not stay perfect. Your nation and the world keep changing underneath you:</p>
          <div class="cards">
            <div class="card"><b>👪 Ageing</b><p>Population is tracked by age. Births follow income, education, women's careers, housing costs, unemployment and family policy; people age through the groups; life expectancy sets deaths. Twenty years later the workforce shrinks, and <b>pensions</b> (paid automatically) and health costs climb. Retirement age, pension financing, immigration and family policy are the levers.</p></div>
            <div class="card"><b>🧑 Youth bulges</b><p>A young, fast-growing population is a dividend if there are jobs, and a powder keg if there aren't: youth unemployment drives unrest and instability.</p></div>
            <div class="card"><b>🏦 Boom and bust</b><p>Private credit grows with cheap money, light regulation, open capital accounts and optimism. Far above its trend, it inflates growth and house prices, then risks a <b>banking crisis</b>: output falls for two years, unemployment jumps, and the state pays for the bailout.</p></div>
            <div class="card"><b>💱 Currency & debt</b><p>A currency peg imports credibility until twin deficits invite a speculative attack. Debt snowballs when interest outruns growth; inflation erodes it. A fiscal rule lowers borrowing costs, and breaking it costs credibility every month.</p></div>
            <div class="card"><b>🌡 Climate</b><p>World emissions heat the planet. Tropical and arid provinces lose harvests and productivity, the far north gains a little, and disasters grow more frequent and severe. Adaptation, forests and the environment budget soften the blow. Your emissions hurt everyone.</p></div>
            <div class="card"><b>☀ The energy transition</b><p>Clean technology gets cheaper every year, so the world adopts more renewables, oil demand falls and oil states see their revenues decline. Carbon border taxes start to bite on dirty exporters. Oil and mineral reserves also run down as you extract them.</p></div>
            <div class="card"><b>🤖 Automation</b><p>Routine work is steadily automated (faster after AI breakthroughs). Skilled economies gain productivity; the cheap-labour route to industry narrows; unskilled workers lose jobs unless you retrain them. Basic income becomes more attractive as automation rises.</p></div>
            <div class="card"><b>🧩 Crises that need you</b><p>Banking crashes, speculative attacks, pension reckonings, youth uprisings, general strikes, housing bubbles, automation layoffs, heatwaves, oil busts, coup plots and coalition revolts arrive when your situation calls for them, and they jump the queue.</p></div>
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
          <p>Every policy is a set of modifiers, summed every day. Below are the <b>headline</b> effects, the same everywhere. Options marked <span class="tag">situational</span> also change with your circumstances and with how long they have been in force: open the policy in-game to see what it does in your nation right now.</p>
          <div class="seg cats"><button v-for="c in POLICY_CATEGORIES" :key="c.id" :class="{ on: policyCat === c.id }" @click="policyCat = c.id">{{ c.icon }} {{ c.label }}</button></div>
          <div v-for="p in policies" :key="p.id" class="pol">
            <div class="pol-head"><b>{{ p.label }}</b><span class="muted small">{{ p.desc }}</span></div>
            <template v-if="p.kind === 'choice'">
              <div v-for="o in (p as ChoicePolicy).options" :key="o.id" class="opt-row">
                <div class="opt-name">{{ o.label }}<span v-if="o.id === p.default" class="tag">default</span><span v-if="o.ctx" class="tag sit">situational</span></div>
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
            <li><b>Elections</b> every four years in democracies and constitutional monarchies, and you can lose them: see <a @click="go('power')">Power & elections</a>.</li>
            <li><b>Coups</b> happen when the army is furious, institutions are weak and stability is low. <b>Revolutions</b> topple unpopular autocracies.</li>
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
            <dt>I lost the election. Is the game over?</dt><dd>No. Another party governs your nation on its own platform until the next election. Watch the polls on Power & elections, campaign among the factions you need, and table a motion of no confidence if the government stumbles. Win the vote and you're back with a fresh honeymoon.</dd>
            <dt>I keep running out of political capital.</dt><dd>Spend it where it matters: raising budgets is cheap, cuts and repeals are expensive. Approval, legitimacy and a parliamentary majority rebuild it; a snap election called while you lead in the polls refills it. Small, steady reforms beat big-bang ones.</dd>
            <dt>My policies were working, and now they aren't.</dt><dd>Your nation and the world changed. Check the risk radar and Long-term forces: an ageing population, a credit boom, the oil transition, automation or a policy that has outlived its usefulness. Click why? on anything that moved.</dd>
            <dt>How do I talk to other players?</dt><dd>Open <b>💬 Comms</b> (next to World news, or the bottom bar on phones). <b>Café</b> threads are public: ask, propose, provoke. <b>Direct</b> messages are private between two nations; AI governments answer in character. <b>Groups</b> are private rooms for coalitions and summits, and every trade bloc gets one automatically. Every message shows the nation and the player behind it. Type <code>/nation</code>, <code>/compare A vs B</code>, <code>/top gdp</code>, <code>/wars</code> or <code>/world</code> to query the world.</dd>
            <dt>How do I play on my phone and my computer?</dt><dd>In your nation panel, choose <b>👤 Save my nation with a username & password</b>. On any other device, use <b>Already have a nation? Sign in</b> on the founding screen. Keep the recovery code you're shown: it signs you in if you forget your password. (The 📱 device link still works too.)</dd>
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
.trailer { margin-top: 18px; }
.trailer .demo { margin-top: 0; }
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
.tag.sit { background: rgba(116, 192, 252, .16); color: #a5d8ff; margin-left: 4px; }
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
