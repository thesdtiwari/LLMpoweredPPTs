'use client';

import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '@/domain/schema/geometry';

interface Props {
  /** 'width': fill the container width (height follows 16:9). 'contain': fit inside the container. */
  fit: 'width' | 'contain';
  /** Clip content to the container. The canvas turns this off so edge handles stay visible. */
  clip?: boolean;
  className?: string;
  children: (scale: number) => ReactNode;
}

/**
 * Renders children in the fixed 1920×1080 slide space and scales them to the
 * available screen size with a CSS transform. Anything that converts pointer
 * positions back to slide units must divide by the same `scale`.
 */
export function ScaledArtboard({ fit, clip = true, className, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale =
    fit === 'width' ? size.width / SLIDE_WIDTH : Math.min(size.width / SLIDE_WIDTH, size.height / SLIDE_HEIGHT);
  const offsetX = fit === 'contain' ? (size.width - SLIDE_WIDTH * scale) / 2 : 0;
  const offsetY = fit === 'contain' ? (size.height - SLIDE_HEIGHT * scale) / 2 : 0;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        overflow: clip ? 'hidden' : 'visible',
        ...(fit === 'width' ? { width: '100%', aspectRatio: '16 / 9' } : { width: '100%', height: '100%' }),
      }}
    >
      {scale > 0 && (
        <div
          style={{
            position: 'absolute',
            left: offsetX,
            top: offsetY,
            width: SLIDE_WIDTH,
            height: SLIDE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          {children(scale)}
        </div>
      )}
    </div>
  );
}
