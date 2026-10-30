// A self-hosted language model (e.g. Ollama running Qwen2.5 on the same server) compiles free-text
// deals into the game's clause primitives. Any OpenAI-compatible endpoint works:
//   LLM_URL   = http://ollama:11434/v1   (Coolify service name, or https://api.deepseek.com/v1, …)
//   LLM_MODEL = qwen2.5:7b-instruct
//   LLM_KEY   = (only for hosted APIs)
// Output is constrained to a JSON schema, so even small models stay on the rails.
import { CLAUSES } from '../../shared/deals'

const URL = process.env.LLM_URL?.replace(/\/+$/, '')
const MODEL = process.env.LLM_MODEL ?? 'qwen2.5:7b-instruct'
export const llmEnabled = () => !!URL

const KINDS = Object.keys(CLAUSES)
const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    notes: { type: 'string' },
    clauses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: KINDS },
          from: { type: 'string', enum: ['a', 'b'] },
          amount: { type: 'number' }, monthly: { type: 'boolean' }, months: { type: 'number' },
          rate: { type: 'number' }, years: { type: 'number' },
          sector: { type: 'string' }, share: { type: 'number' }, discount: { type: 'number' },
          province: { type: 'string' }, policy: { type: 'string' }, option: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['kind'],
      },
    },
  },
  required: ['title', 'clauses', 'notes'],
}

export interface CompileContext {
  a: string; b: string
  aProvinces: string[]; bProvinces: string[]
  sectors: string[]
  policies: string[]
  atWar: boolean
}

function prompt(c: CompileContext) {
  return `You turn agreements between two nations in a strategy game into a JSON list of clauses.
Side "a" is ${c.a} (the proposer). Side "b" is ${c.b}.${c.atWar ? ' They are currently at war.' : ''}
Clause kinds (use only these fields):
- payment {from, amount ($ billions), monthly (bool), months}
- loan {from (the lender), amount ($B), rate (% per year), years}
- tariff {from (the side that limits its tariff), rate (max %), years}
- supply {from (the supplier), sector, share (0-0.5 of its output), discount (0-1), years}
- tech {from (the side sharing), years}
- province {from (the side giving it), province (exact name)}
- policy {from, policy (id), option (id), years}
- nonaggression {years}
- alliance {}
- pact {} (trade pact)
- aid {from (the donor), years}
- peace {}
- promise {from, text, years}: anything that does not fit the kinds above. Keep the meaning.
Provinces of ${c.a}: ${c.aProvinces.join(', ') || 'none'}.
Provinces of ${c.b}: ${c.bProvinces.join(', ') || 'none'}.
Sectors: ${c.sectors.join(', ')}.
Policies (id: options): ${c.policies.join('; ')}.
Rules: use the exact province, sector, policy and option ids listed. Default years to 5 when unstated. Never invent clauses the text does not ask for.
"title": a short treaty name (max 6 words). "notes": one sentence on anything you could only approximate, or "".`
}

export async function compileDeal(text: string, c: CompileContext): Promise<{ title: string; clauses: Record<string, unknown>[]; notes: string }> {
  if (!URL) throw new Error('No language model is configured on this server.')
  const res = await fetch(`${URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(process.env.LLM_KEY ? { authorization: `Bearer ${process.env.LLM_KEY}` } : {}) },
    body: JSON.stringify({
      model: MODEL, temperature: 0.1, max_tokens: 900,
      messages: [{ role: 'system', content: prompt(c) }, { role: 'user', content: text.slice(0, 1500) }],
      response_format: { type: 'json_schema', json_schema: { name: 'deal', schema: SCHEMA, strict: true } },
    }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) throw new Error(`The model server answered ${res.status}.`)
  const j = await res.json() as { choices?: { message?: { content?: string } }[] }
  const raw = j.choices?.[0]?.message?.content ?? ''
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  const out = JSON.parse(json)
  return { title: String(out.title ?? 'Agreement'), clauses: Array.isArray(out.clauses) ? out.clauses : [], notes: String(out.notes ?? '') }
}
