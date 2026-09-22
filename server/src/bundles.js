import { getPackMeta } from './packs.js';

/**
 * Themenpakete: fertige Zusammenstellungen fuer die Themen-Seite. Ein Eintrag ist ein ganzes
 * Thema ("anime") oder ein einzelner Bereich ("filme/starwars"). Die Auswahl selbst bleibt
 * eine normale Bereichsliste, ein Paket fuellt sie nur auf einen Klick.
 */
export const BUNDLES = [
  {
    id: 'wissen',
    name: 'Wissen',
    desc: 'Allgemeinbildung aus Geschichte, Welt, Natur und Kultur',
    icon: 'graduation',
    hue: 205,
    items: ['allgemein', 'geschichte', 'welt', 'natur', 'kultur'],
  },
  {
    id: 'popkultur',
    name: 'Popkultur',
    desc: 'Filme, Serien, Musik, Stars, Internet und Marken',
    icon: 'popcorn',
    hue: 340,
    items: ['filme', 'musik', 'promis', 'internet', 'marken', 'charaktere/figuren'],
  },
  {
    id: 'nerd',
    name: 'Nerd',
    desc: 'Anime, Games, Superhelden, Zauberer und Star Wars',
    icon: 'swords',
    hue: 280,
    items: ['anime', 'gaming', 'filme/marvel', 'filme/starwars', 'filme/harrypotter', 'internet/tech', 'kultur/mythologie'],
  },
  {
    id: 'deutschland',
    name: 'Made in Germany',
    desc: 'Alles mit Deutschland-Bezug, von Geschichte bis Fernsehen',
    icon: 'castle',
    hue: 48,
    items: ['geschichte/deutschland', 'welt/deutschland', 'musik/deutsch', 'promis/tv', 'charaktere/kinderhelden'],
  },
  {
    id: 'kindheit',
    name: 'Kindheit',
    desc: 'Kinderhelden, Cartoons, Märchen, Disney und Retro-Spiele',
    icon: 'blocks',
    hue: 18,
    items: ['charaktere', 'kultur/maerchen', 'filme/disney', 'anime/ghibli', 'anime/klassiker', 'gaming/retro'],
  },
  {
    id: 'lifestyle',
    name: 'Lifestyle',
    desc: 'Essen, Getränke, Mode, Sneaker, Sport und Marken',
    icon: 'bag',
    hue: 150,
    items: ['essen', 'stil', 'sport', 'marken'],
  },
];

/** Pakete mit aufgeloesten Bereichs-Schluesseln. Unbekannte Eintraege fallen raus. */
export function bundleMeta() {
  const packs = getPackMeta();
  const keys = new Set(packs.flatMap((p) => p.sections.map((s) => s.key)));
  return BUNDLES.map(({ items, ...bundle }) => {
    const sections = [];
    for (const item of items) {
      const found = item.includes('/')
        ? keys.has(item) ? [item] : []
        : (packs.find((p) => p.id === item)?.sections.map((s) => s.key) ?? []);
      for (const key of found) if (!sections.includes(key)) sections.push(key);
    }
    return { ...bundle, sections };
  }).filter((b) => b.sections.length > 0);
}
