import {
  Clapperboard,
  Drama,
  Gamepad2,
  Globe,
  Music,
  Package,
  Smartphone,
  Sparkles,
  SprayCan,
  Star,
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
};

export function PackIcon({ icon, hue, size = 40 }: { icon: string; hue: number; size?: number }) {
  const Icon = ICONS[icon] ?? Package;
  return (
    <span className="pack-icon" style={{ '--pk-h': hue, width: size, height: size } as React.CSSProperties}>
      <Icon size={size * 0.5} strokeWidth={1.8} />
    </span>
  );
}
