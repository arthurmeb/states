import { INDEX_MAP } from '~~/shared/indices'
import { useGame } from './useGame'

export function useRanks() {
  const { snap } = useGame()
  function rankOf(nationId: number, key: string) {
    const list = snap.value?.nations ?? []
    const def = INDEX_MAP[key]
    const higher = def ? def.higher : true
    const sorted = [...list].filter(n => n.idx[key] != null).sort((a, b) => (higher ? b.idx[key] - a.idx[key] : a.idx[key] - b.idx[key]))
    return { rank: sorted.findIndex(n => n.id === nationId) + 1, of: sorted.length }
  }
  function worldMedian(key: string) {
    const v = (snap.value?.nations ?? []).map(n => n.idx[key]).filter(x => x != null).sort((a, b) => a - b)
    return v.length ? v[Math.floor(v.length / 2)] : 0
  }
  return { rankOf, worldMedian }
}
