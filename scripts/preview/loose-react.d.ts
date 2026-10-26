// Sandbox-only loose typings so app code can be type-checked without @types/react installed.
declare module "react" {
  export type ReactNode = any; export type MouseEvent<T = any> = any; export type SVGProps<T = any> = any; export type AnchorHTMLAttributes<T = any> = any; export type FormEvent<T = any> = any; export type DragEvent<T = any> = any; export type PointerEvent<T = any> = any; export type KeyboardEvent<T = any> = any; export type CSSProperties = Record<string, string | number | undefined>;
  export function useState<T>(v: T | (() => T)): [T, (v: T | ((p: T) => T)) => void];
  export function useEffect(f: () => void | (() => void), d?: unknown[]): void;
  export function useRef<T>(v: T | null): { current: T | null };
  export function useMemo<T>(f: () => T, d: unknown[]): T;
  export function useId(): string;
  export function useCallback<T>(f: T, d: unknown[]): T;
  export type KeyboardEvent<T = any> = any;
  export function useSyncExternalStore<T>(s: (l: () => void) => () => void, g: () => T, gs?: () => T): T;
  export const Fragment: any;
  export interface Context<T> { Provider: any; __t?: T }
  export function createContext<T>(v: T): Context<T>;
  export function useContext<T>(c: Context<T>): T;
}
declare module "react/jsx-runtime" { export const jsx: any, jsxs: any, Fragment: any; }
declare module "next" { export type Metadata = any; export type Viewport = any; export type NextConfig = any; export namespace MetadataRoute { type Robots = any; type Sitemap = any; } }
declare module "next/link" { const L: any; export default L; }
declare module "next/navigation" { export function useRouter(): { push(h: string): void }; export function notFound(): never; export function usePathname(): string; export function redirect(u: string): never; }
declare module "next/font/google" { export function Inter(o: any): { variable: string; className: string }; export function Plus_Jakarta_Sans(o: any): { variable: string; className: string }; }
declare module "lucide-react" { export type LucideIcon = any; const x: any; export const AlertTriangle: any, ArrowRight: any, Baby: any, Bell: any, BookOpen: any, Briefcase: any, Car: any, Check: any, ChefHat: any, ChevronDown: any, ChevronLeft: any, ChevronRight: any, Clock: any, Dumbbell: any, Flower2: any, Footprints: any, Globe: any, Heart: any, HeartPulse: any, Info: any, LayoutGrid: any, Laptop: any, Luggage: any, MapPin: any, Menu: any, Monitor: any, Moon: any, Navigation: any, Package: any, PawPrint: any, Puzzle: any, Radar: any, Recycle: any, Scale: any, Search: any, Shirt: any, ShoppingBasket: any, Smartphone: any, Sofa: any, Sparkles: any, Store: any, Sun: any, Tag: any, Tent: any, Truck: any, Tv: any, User: any, Watch: any, Wrench: any, X: any, ArrowUp: any, ArrowUpRight: any, BadgePercent: any, BellRing: any, History: any, Plane: any, ShieldCheck: any, Camera: any, Mail: any, ClipboardCheck: any, Eye: any, EyeOff: any, Lock: any, LogIn: any, LogOut: any; }
declare module "clsx" { export default function clsx(...a: any[]): string; }
declare module "*.css";
declare const process: { env: Record<string, string | undefined>; cwd(): string; chdir(d: string): void };
declare namespace JSX { interface IntrinsicElements { [k: string]: any } interface Element {} interface IntrinsicAttributes { key?: any } interface ElementChildrenAttribute { children: {} } }
declare module "next/server" { export class NextResponse extends Response { static json(b: unknown, i?: ResponseInit): NextResponse; static redirect(u: string | URL, s?: number | ResponseInit): NextResponse; cookies: { set(n: string, v: string, o?: unknown): void }; } }
declare module "next/headers" { export function cookies(): Promise<{ get(n: string): { value: string } | undefined; set(n: string, v: string, o?: unknown): void; delete(n: string): void }>; }
declare module "node:crypto" { export function createHmac(a: string, k: string): { update(d: string): { digest(e: string): string } }; export function scryptSync(...a: unknown[]): any; export function timingSafeEqual(a: any, b: any): boolean; export function randomBytes(n: number): any; }
declare const Buffer: { from(s: string | ArrayBuffer, enc?: string): any };
declare module "next/cache" { export function revalidatePath(p: string, t?: string): void; }
declare module "node:fs/promises" { export function readFile(p: string, e: string): Promise<string>; export function writeFile(p: string, d: string): Promise<void>; export function mkdir(p: string, o?: unknown): Promise<unknown>; }
declare module "node:fs" { export function readFileSync(p: string, e: string): string; export function writeFileSync(p: string, d: string): void; export function mkdirSync(p: string, o?: unknown): unknown; }
declare module "node:path" { const path: { join(...p: string[]): string; dirname(p: string): string; resolve(...p: string[]): string }; export default path; }
declare module "next/image" { const I: any; export default I; export function getImageProps(p: any): { props: any }; }
declare module "react-dom" { export function createPortal(children: any, container: any): any; }
