// Sandbox preview stand-in for next/image (plain <img>, fill supported) and getImageProps (no resizing).
/* eslint-disable */
export default function Image({ src, alt, fill, sizes: _s, priority: _p, className = "", style, ...rest }: any) {
  return <img src={src} alt={alt} className={className} style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style} {...rest} />;
}
export function getImageProps({ src, alt, width, height, sizes, loading, fetchPriority }: any) {
  return { props: { src, srcSet: src, alt, width, height, sizes, loading, fetchPriority, decoding: "async", style: { color: "transparent" } } };
}
