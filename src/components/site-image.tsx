import Image from "next/image";
import type React from "react";

/**
 * Local site photography (public/images/site) through next/image, so Next.js serves
 * resized, modern-format versions and reserves space (no layout shift).
 */
export function SiteImage({
  src,
  alt,
  sizes,
  priority = false,
  className = "",
  style,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} style={style} className={`object-cover ${className}`} />;
}
