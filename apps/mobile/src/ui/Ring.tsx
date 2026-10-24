import { useEffect, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useSharedValue, withSpring } from 'react-native-reanimated';
import { motion, useTheme } from '@/theme';

export interface RingProps {
  size: number;
  stroke?: number;
  /** 0..1 */
  progress: number;
  color: string;
  /** Optional second ring (e.g. screen-on behind attended). */
  ghost?: number;
  ghostColor?: string;
  children?: ReactNode;
}

/** Skia progress ring with spring-animated sweep. Children are centred inside. */
export function Ring({ size, stroke = 10, progress, color, ghost, ghostColor, children }: RingProps) {
  const { c } = useTheme();
  const end = useSharedValue(0);
  const ghostEnd = useSharedValue(0);

  useEffect(() => {
    end.value = withSpring(clamp(progress), motion.spring.gentle);
    ghostEnd.value = withSpring(clamp(ghost ?? 0), motion.spring.gentle);
  }, [progress, ghost, end, ghostEnd]);

  const path = useMemo(() => {
    const r = (size - stroke) / 2;
    return Skia.PathBuilder.Make()
      .arcToOval({ x: stroke / 2, y: stroke / 2, width: r * 2, height: r * 2 }, -90, 359.99, true)
      .build();
  }, [size, stroke]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Canvas style={{ position: 'absolute', width: size, height: size }}>
        <Path path={path} style="stroke" strokeWidth={stroke} color={c.surfacePressed} strokeCap="round" />
        {ghost !== undefined && (
          <Path path={path} style="stroke" strokeWidth={stroke} color={ghostColor ?? c.borderStrong} strokeCap="round" start={0} end={ghostEnd} />
        )}
        <Path path={path} style="stroke" strokeWidth={stroke} color={color} strokeCap="round" start={0} end={end} />
      </Canvas>
      {children}
    </View>
  );
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));
