import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe, type FilterDef } from './registry';

const R = '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0';
const G = '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0';
const B = '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0';

function Filter({ def }: { def: FilterDef }) {
  const source = def.blur > 0 ? 'soft' : 'SourceGraphic';
  return (
    <filter
      id={def.id}
      x="0"
      y="0"
      width={def.w}
      height={def.h}
      filterUnits="userSpaceOnUse"
      primitiveUnits="userSpaceOnUse"
      colorInterpolationFilters="sRGB"
    >
      {def.blur > 0 && <feGaussianBlur in="SourceGraphic" stdDeviation={def.blur} result="soft" />}
      <feImage href={def.url} x="0" y="0" width={def.w} height={def.h} preserveAspectRatio="none" result="map" />
      {def.dispersion ? (
        <>
          {/* Prisma-Effekt: Rot, Gruen und Blau werden unterschiedlich stark gebrochen */}
          <feDisplacementMap in={source} in2="map" scale={def.scale} xChannelSelector="R" yChannelSelector="G" result="dr" />
          <feColorMatrix in="dr" type="matrix" values={R} result="r" />
          <feDisplacementMap in={source} in2="map" scale={def.scale * 0.93} xChannelSelector="R" yChannelSelector="G" result="dg" />
          <feColorMatrix in="dg" type="matrix" values={G} result="g" />
          <feDisplacementMap in={source} in2="map" scale={def.scale * 0.86} xChannelSelector="R" yChannelSelector="G" result="db" />
          <feColorMatrix in="db" type="matrix" values={B} result="b" />
          <feBlend in="r" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="b" mode="screen" result="bent" />
        </>
      ) : (
        <feDisplacementMap in={source} in2="map" scale={def.scale} xChannelSelector="R" yChannelSelector="G" result="bent" />
      )}
      <feColorMatrix in="bent" type="saturate" values={String(def.saturate)} />
    </filter>
  );
}

/** Einmal im App-Root: haelt alle aktiven Glasfilter im DOM. */
export function GlassDefs() {
  const defs = useSyncExternalStore(subscribe, getSnapshot);
  return (
    <svg className="glass-defs" aria-hidden="true" focusable="false">
      <defs>
        {defs.map((d) => (
          <Filter key={d.id} def={d} />
        ))}
      </defs>
    </svg>
  );
}
