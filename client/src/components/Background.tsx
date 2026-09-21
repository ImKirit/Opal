/**
 * Hintergrund: tiefes Blau, drei weiche Lichtflecken, ein feines Punktraster und ein
 * schraeger Lichtstrahl. Die Struktur ist Absicht: ohne Punkte und Kanten gaebe es fuer
 * das Glas nichts zu brechen. Je nach Screen wandern die Lichter an andere Stellen.
 */
export function Background({ scene }: { scene: string }) {
  return (
    <div className="backdrop" data-scene={scene} aria-hidden="true">
      <div className="backdrop__light backdrop__light--a" />
      <div className="backdrop__light backdrop__light--b" />
      <div className="backdrop__light backdrop__light--c" />
      <div className="backdrop__beam" />
      <div className="backdrop__grid" />
      <div className="backdrop__vignette" />
    </div>
  );
}
