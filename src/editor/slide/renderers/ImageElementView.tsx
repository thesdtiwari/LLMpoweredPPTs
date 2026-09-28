import type { ImageElement } from '@/domain/schema/elements';

export function ImageElementView({ element }: { element: ImageElement }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary AI URLs and data: URLs from uploads
    <img
      className="image-element"
      src={element.src}
      alt={element.alt}
      draggable={false}
      style={{ objectFit: element.fit }}
    />
  );
}
