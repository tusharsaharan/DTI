import { useMemo } from 'react';
import { Canvas, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';

export interface SparklineProps {
  data: number[];
  width: number;
  height: number;
  color: string;
  /** Fill the area under the line with a fading gradient. */
  fill?: boolean;
  strokeWidth?: number;
  min?: number;
  max?: number;
}

/** Smooth (Catmull-Rom → cubic) line chart drawn with Skia. */
export function Sparkline({ data, width, height, color, fill = true, strokeWidth = 2, min, max }: SparklineProps) {
  const { line, area } = useMemo(() => {
    const lo = min ?? Math.min(...data);
    const hi = max ?? Math.max(...data);
    const span = hi - lo || 1;
    const pad = strokeWidth;
    const pts = data.map((v, i) => ({
      x: data.length === 1 ? width / 2 : (i / (data.length - 1)) * width,
      y: pad + (1 - (v - lo) / span) * (height - pad * 2),
    }));
    const l = Skia.PathBuilder.Make();
    if (pts.length) l.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      l.cubicTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
    }
    const line = l.build();
    const area = Skia.PathBuilder.MakeFromPath(line).lineTo(width, height).lineTo(0, height).close().build();
    return { line, area };
  }, [data, width, height, strokeWidth, min, max]);

  if (data.length === 0) return null;
  return (
    <Canvas style={{ width, height }}>
      {fill && (
        <Path path={area}>
          <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={[color + '55', color + '00']} />
        </Path>
      )}
      <Path path={line} style="stroke" strokeWidth={strokeWidth} color={color} strokeCap="round" strokeJoin="round" />
    </Canvas>
  );
}
