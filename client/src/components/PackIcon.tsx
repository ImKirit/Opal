import {
  Blocks,
  Car,
  Castle,
  Clapperboard,
  Drama,
  Gamepad2,
  Globe,
  GraduationCap,
  Landmark,
  Leaf,
  Map as MapIcon,
  Music,
  Package,
  Palette,
  Popcorn,
  ShoppingBag,
  Smartphone,
  Sparkles,
  SprayCan,
  Star,
  Swords,
  Trophy,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  globe: Globe,
  sparkles: Sparkles,
  gamepad: Gamepad2,
  clapperboard: Clapperboard,
  smartphone: Smartphone,
  music: Music,
  spray: SprayCan,
  star: Star,
  trophy: Trophy,
  utensils: UtensilsCrossed,
  drama: Drama,
  landmark: Landmark,
  map: MapIcon,
  leaf: Leaf,
  palette: Palette,
  car: Car,
  graduation: GraduationCap,
  popcorn: Popcorn,
  swords: Swords,
  castle: Castle,
  blocks: Blocks,
  bag: ShoppingBag,
};

export function PackIcon({ icon, hue, size = 40 }: { icon: string; hue: number; size?: number }) {
  const Icon = ICONS[icon] ?? Package;
  return (
    <span className="pack-icon" style={{ '--pk-h': hue, width: size, height: size } as React.CSSProperties}>
      <Icon size={size * 0.5} strokeWidth={1.8} />
    </span>
  );
}
