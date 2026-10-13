import { useState } from "react";
import type { ReactNode } from "react";

export function PublicImage({
  src,
  alt,
  className,
  width,
  height,
  fallback,
}: {
  src: string | null;
  alt: string;
  className?: string;
  width: number;
  height: number;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img
      src={src}
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className={className}>{fallback}</span>
  );
}
