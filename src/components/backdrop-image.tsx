import { getImageProps } from "next/image";
import type { Backdrop } from "@/data/site-backgrounds";

/**
 * Art-directed background photo: the wide file from 768px up, the tighter mobile crop below.
 * Uses next/image's getImageProps so both files are resized and served in modern formats.
 * The image fills its (sized) parent, so it never causes layout shift.
 */
export function BackdropImage({
  image,
  decorative = true,
  priority = false,
  sizes = "100vw",
  className = "",
}: {
  image: Backdrop;
  /** Decorative backgrounds get alt="" so screen readers skip them. */
  decorative?: boolean;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const common = {
    alt: decorative ? "" : image.alt,
    sizes,
    loading: priority ? ("eager" as const) : ("lazy" as const),
    fetchPriority: priority ? ("high" as const) : undefined,
  };
  const {
    props: { srcSet: desktopSet },
  } = getImageProps({ ...common, ...image.desktop });
  // Its inline style is replaced below by the object-position variable (a later JSX prop wins over the spread).
  const { props: mobileProps } = getImageProps({ ...common, ...image.mobile });
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={desktopSet} sizes={sizes} />
      <img
        {...mobileProps}
        alt={common.alt}
        className={`absolute inset-0 h-full w-full object-cover md:[object-position:var(--pv-pos)] ${className}`}
        style={{ ["--pv-pos" as string]: image.position ?? "50% 50%" }}
      />
    </picture>
  );
}
