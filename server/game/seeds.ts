// AI powers seeded at real-world power centres. Fictional names, organic borders.
// Their ideology, government, taxes, budgets and policies are derived from the real
// country data of their heartland (see ai.ts setupAINation).
// [name, leader, lat, lon, size, color]
export const AI_SEEDS: [string, string, number, number, number, string][] = [
  ['Kingdom of Albion', 'Queen Maren II', 52.5, -1.5, 3, '#c0392b'],
  ['Gallic Republic', 'President Aurel Vance', 47, 2.5, 5, '#3b5bdb'],
  ['Rhenish Confederation', 'Chancellor Ida Brenner', 51, 10, 5, '#868e96'],
  ['Iberian Union', 'Premier Tomás Ferro', 40, -4, 5, '#e67700'],
  ['League of Latium', 'Consul Dario Vel', 43, 12.5, 4, '#2b8a3e'],
  ['Sarmatian Commonwealth', 'Hetman Jurek Sowa', 52, 21, 5, '#c2255c'],
  ['Muscovite Federation', 'Director Oleg Varin', 56, 40, 9, '#7048e8'],
  ['Anatolian Sultanate', 'Sultan Kerem I', 39, 33, 6, '#d6336c'],
  ['Persian Imperium', 'Shahbanu Leyla', 32.5, 53, 7, '#0ca678'],
  ['Kingdom of the Nile', 'Regent Amun Saad', 27, 31, 4, '#f59f00'],
  ['Maghreb Emirate', 'Emir Idris Haddou', 32, -6, 5, '#fd7e14'],
  ['Hindustan Union', 'Prime Minister Asha Rao', 23, 79, 10, '#ff922b'],
  ['Bengal Free State', 'Chief Minister Rafi Ahsan', 24, 90, 3, '#20c997'],
  ['Celestial Republic', 'Chairman Wen Liang', 34, 112, 11, '#e03131'],
  ['Yamato Dominion', 'Prime Minister Haru Seki', 36, 138.5, 3, '#f8f9fa'],
  ['Siamese Kingdom', 'King Rama Thep', 15, 101, 4, '#9c36b5'],
  ['Sunda Archipelago', 'President Dewi Sukma', -6.5, 107, 4, '#e64980'],
  ['Commonwealth of Australis', 'Premier Jack Monro', -33, 148, 5, '#1098ad'],
  ['Columbian Federation', 'President Grace Holloway', 39, -80, 8, '#1c7ed6'],
  ['Pacific Republic', 'Governor-General Lena Ortiz', 37, -120, 4, '#15aabf'],
  ['Lone Star Republic', 'President Cole Harlan', 31, -98, 4, '#a61e4d'],
  ['Dominion of Laurentia', 'Prime Minister Élise Roy', 46, -73, 4, '#c92a2a'],
  ['Aztlán Republic', 'President Inés Ocampo', 20, -100, 6, '#2f9e44'],
  ['Gran Colombia', 'El Libertador Simón Ruiz', 5, -74, 5, '#fab005'],
  ['Lusitanian Empire of Brasil', 'Emperor Pedro IV', -20, -45, 9, '#37b24d'],
  ['Republic of La Plata', 'President Martín Aráoz', -34, -61, 5, '#74c0fc'],
  ['Yoruba Federation', 'Oba Adewale', 8, 5, 5, '#099268'],
  ['Abyssinian Crown', 'Negus Tewodros III', 9.5, 39, 5, '#5c940d'],
  ['Swahili Coast League', 'Sultan Zuberi', -4, 38, 4, '#0b7285'],
  ['Cape Republic', 'President Thandi Mokoena', -28, 26, 5, '#845ef7'],
  ['Hanguk Republic', 'President Min-jun Kang', 37, 127.5, 2, '#4dabf7'],
]

/** Names for nations that emerge during play (secessions, new states). */
export const NEW_STATE_COLORS = ['#ff8787', '#da77f2', '#748ffc', '#3bc9db', '#69db7c', '#ffd43b', '#ffa94d', '#a9e34b', '#63e6be', '#e599f7', '#91a7ff', '#ffc078']

/**
 * Claude's own rival nation: a small, rich trade hub on the Malacca Strait.
 * Run by the regular AI, but with a fixed finance strategy, a dovish, outward-looking ideology
 * and an opening play (SEZ capital, low corporate tax, education + R&D, naval deterrence).
 */
export const PERSONA = {
  id: 'claude', name: 'Straits Republic', leader: 'Premier Claude', motto: 'Everyone needs the strait. Nobody fights for it.',
  lat: 1.35, lon: 103.82, size: 3, color: '#d97757', strategy: 'finance',
  ideology: { left: 0.35, right: 0.6, auth: 0.25, lib: 0.6, trad: 0.2, prog: 0.55, nat: 0.05, glob: 0.95, green: 0.45, hawk: 0.1 },
  aggression: 0.04, ambition: 0.45,
  policy: { economicSystem: 'free', centralBank: 'independent', fdiPolicy: 'incentives', capitalControls: 'open', corporateTax: 12, tariff: 0 } as Record<string, string | number>,
  budget: { education: 5.5, rnd: 2.6, health: 4.5, infrastructure: 3.5, defense: 2.8, culture: 0.6, sports: 0.35, diplomacy: 0.7 } as Record<string, number>,
  capital: { sez: 'on', focus: 'services' } as Record<string, string>,
}
