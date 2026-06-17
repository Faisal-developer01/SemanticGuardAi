import React from 'react';
import { cn } from '@/lib/utils';

/**
 * SemanticGuard AI brand mark — the colored ribbon icon.
 * Transparent background, so it renders cleanly on any surface.
 * Use this on its own where only the icon is needed (compact / collapsed spots).
 */
interface BrandMarkProps {
  /** Rendered height in pixels (width scales automatically). */
  size?: number;
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ size = 32, className }) => (
  <img
    src="/logo-icon.png"
    alt="SemanticGuard AI"
    style={{ height: size, width: 'auto' }}
    className={cn('object-contain shrink-0 select-none', className)}
    draggable={false}
  />
);

/**
 * Full logo lockup: brand mark + "SemanticGuard AI" wordmark.
 * `variant` controls the wordmark colour for light (dark surfaces) or
 * dark (light surfaces) backgrounds.
 */
interface LogoProps {
  size?: number;
  variant?: 'light' | 'dark';
  subtitle?: string;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  size = 32,
  variant = 'dark',
  subtitle,
  className,
}) => {
  const accent = variant === 'light' ? 'hsl(211,73%,72%)' : 'hsl(211,73%,59%)';
  const main = variant === 'light' ? '#ffffff' : 'hsl(214,68%,19%)';
  const sub =
    variant === 'light' ? 'rgba(255,255,255,0.45)' : 'hsl(215,16%,47%)';

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark size={size} />
      <div className="min-w-0 leading-tight">
        <p className="font-bold" style={{ color: main }}>
          SemanticGuard <span style={{ color: accent }}>AI</span>
        </p>
        {subtitle && (
          <p className="text-[10px]" style={{ color: sub }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};
