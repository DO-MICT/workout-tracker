import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { View } from 'react-native';

import { fmtNum, hDate } from '@/lib/history';
import { F, useTheme } from '@/theme';
import { T } from '@/ui';

export type ChartPoint = { at: string; best: number };

/** Line chart of the best value per workout, oldest to newest. Ported from the web app's histChart. */
export function ProgressChart({ points, label, unit }: { points: ChartPoint[]; label: string; unit: string }) {
  const { c } = useTheme();
  const W = 320;
  const H = 150;
  const pl = 38;
  const pr = 12;
  const pt = 14;
  const pb = 24;
  const vs = points.map((p) => p.best);
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  if (hi === lo) {
    hi += 1;
    lo = Math.max(0, lo - 1);
  }
  /* round the axis to friendly steps (1, 2, 2.5, 5 × 10^n) */
  const raw = (hi - lo) / 3;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).filter((v) => v >= raw)[0];
  const minVal = Math.min(...vs);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (lo < 0 && minVal >= 0) lo = 0;
  const x = (i: number) => pl + (points.length < 2 ? 0 : (i * (W - pl - pr)) / (points.length - 1));
  const y = (v: number) => pt + ((hi - v) * (H - pt - pb)) / (hi - lo);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.best).toFixed(1)}`).join(' ');
  const ticks: number[] = [];
  for (let tv = lo; tv <= hi + step / 2; tv += step) ticks.push(Math.round(tv * 100) / 100);
  const short = { day: 'numeric', month: 'short' } as const;
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 12, padding: 12, marginVertical: 8 }}>
      <T v="label" muted style={{ marginBottom: 6 }}>{`${label} per workout (${unit})`}</T>
      <Svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ aspectRatio: W / H }}
        accessibilityLabel={`${label} per workout, ${points.length} workouts, from ${fmtNum(points[0].best)} to ${fmtNum(points[points.length - 1].best)} ${unit}`}>
        {ticks.map((v) => (
          <Line key={`g${v}`} x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke={c.line} strokeWidth={1} />
        ))}
        {ticks.map((v) => (
          <SvgText key={`t${v}`} x={pl - 6} y={y(v) + 4} fontSize={11} fontFamily={F.med} fill={c.muted} textAnchor="end">
            {fmtNum(v)}
          </SvgText>
        ))}
        <Path d={line} fill="none" stroke={c.blue} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <Circle key={i} cx={x(i)} cy={y(p.best)} r={i === points.length - 1 ? 4.5 : 3} fill={c.blue} stroke={c.card} strokeWidth={1.5} />
        ))}
        <SvgText x={pl} y={H - 6} fontSize={11} fontFamily={F.med} fill={c.muted}>
          {hDate(points[0].at, short)}
        </SvgText>
        <SvgText x={W - pr} y={H - 6} fontSize={11} fontFamily={F.med} fill={c.muted} textAnchor="end">
          {hDate(points[points.length - 1].at, short)}
        </SvgText>
      </Svg>
    </View>
  );
}
