import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Rect } from 'react-native-svg';

import { DIAGRAMS, type DiagramFrame } from '@/data';
import { type Palette, useTheme } from '@/theme';
import { T } from '@/ui';

/* Stick-figure start/finish diagrams, drawn from the same pattern data as the web app. */

type Prop = (string | number)[];
const pts = (a: number[]) => a.reduce<string>((s, v, i) => s + v + (i % 2 ? ' ' : ','), '').trim();

function propEl(p: Prop, k: string, c: Palette) {
  const [t, ...raw] = p;
  const v = raw as number[];
  switch (t) {
    case 'bench':
      return (
        <G key={k}>
          <Line x1={v[0] + 5} y1={v[1] + 5} x2={v[0] + 5} y2={95} stroke={c.steel} strokeWidth={2.6} strokeLinecap="round" />
          <Line x1={v[0] + v[2] - 5} y1={v[1] + 5} x2={v[0] + v[2] - 5} y2={95} stroke={c.steel} strokeWidth={2.6} strokeLinecap="round" />
          <Rect x={v[0]} y={v[1]} width={v[2]} height={5} rx={1.5} fill={c.steel} />
        </G>
      );
    case 'rect':
      return <Rect key={k} x={v[0]} y={v[1]} width={v[2]} height={v[3]} rx={1.5} fill={c.steel} />;
    case 'line':
      return <Line key={k} x1={v[0]} y1={v[1]} x2={v[2]} y2={v[3]} stroke={c.steel} strokeWidth={2.6} strokeLinecap="round" />;
    case 'pad':
      return <Circle key={k} cx={v[0]} cy={v[1]} r={4.5} fill={c.steel} />;
    case 'cable':
      return (
        <G key={k}>
          <Line x1={v[0]} y1={v[1]} x2={v[2]} y2={v[3]} stroke={c.blue} strokeWidth={1.6} strokeDasharray="3 2" />
          <Circle cx={v[0]} cy={v[1]} r={3} fill={c.blue} />
        </G>
      );
    case 'plate':
      return <Circle key={k} cx={v[0]} cy={v[1]} r={6} fill={c.accent} stroke={c.ink} strokeWidth={1.2} />;
    case 'db':
      return <Rect key={k} x={v[0] - 7} y={v[1] - 3} width={14} height={6} rx={2} fill={c.accent} stroke={c.ink} strokeWidth={1.2} />;
  }
  return null;
}

function Frame({ f, shared, c }: { f: DiagramFrame; shared: Prop[]; c: Palette }) {
  const props = shared.concat((f.q as Prop[] | undefined) ?? []);
  const front = props.filter((p) => p[0] === 'plate' || p[0] === 'db');
  const back = props.filter((p) => !(p[0] === 'plate' || p[0] === 'db'));
  const stroke = { stroke: c.ink, strokeWidth: 3.4, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <>
      {back.map((p, i) => propEl(p, `b${i}`, c))}
      <G>
        {f.b ? (
          <>
            <Line x1={f.h[0]} y1={f.h[1]} x2={f.b[0]} y2={f.b[1]} {...stroke} />
            <Polyline points={pts(f.b)} {...stroke} />
            {f.a ? <Polyline points={pts([f.b[0], f.b[1], ...f.a])} {...stroke} /> : null}
          </>
        ) : null}
        {(f.x ?? []).map((l, i) => (
          <Polyline key={i} points={pts(l)} {...stroke} />
        ))}
      </G>
      <Circle cx={f.h[0]} cy={f.h[1]} r={6} fill={c.ink} />
      {front.map((p, i) => propEl(p, `f${i}`, c))}
    </>
  );
}

function DiagramBase({ id }: { id: string }) {
  const { c } = useTheme();
  const P = DIAGRAMS[id];
  if (!P) return null;
  const shared = (P.p as Prop[] | undefined) ?? [];
  const start = P.s;
  const end = { ...P.s, ...P.e } as DiagramFrame;
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 6, paddingTop: 8, paddingBottom: 4, marginVertical: 4 }}>
      <Svg viewBox="0 0 250 100" width="100%" style={{ aspectRatio: 2.5 }} accessibilityLabel="Start and finish positions">
        <Line x1={0} y1={95} x2={250} y2={95} stroke={c.line} strokeWidth={2} />
        <G>
          <Frame f={start} shared={shared} c={c} />
        </G>
        <Path d="M116 48 h14 m-5 -5 l5 5 l-5 5" stroke={c.muted} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <G transform="translate(130 0)">
          <Frame f={end} shared={shared} c={c} />
        </G>
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, paddingHorizontal: 18 }}>
        <T v="label" muted>Start</T>
        <T v="label" muted style={{ opacity: 0.5 }}>→</T>
        <T v="label" muted>Finish</T>
      </View>
    </View>
  );
}
export const Diagram = memo(DiagramBase);
