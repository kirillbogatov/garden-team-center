import * as React from 'react';
import { cn } from '@/lib/utils';

export function BrandIcon({ className, size = 24 }) {
  return (
    <span
      className={cn('garden-brand-icon', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1.5" y="1.5" width="21" height="21" rx="7" className="garden-brand-icon-bg" />
        <path d="M8 14.25C8.96 12.82 10.38 12.1 12.26 12.1C14.15 12.1 15.56 11.38 16.5 9.95" className="garden-brand-icon-line" />
        <path d="M7.5 10.35C8.49 8.93 9.93 8.22 11.82 8.22C13.71 8.22 15.12 7.5 16.06 6.08" className="garden-brand-icon-line garden-brand-icon-line-soft" />
        <path d="M8.1 18.04C8.95 16.97 10.1 16.44 11.55 16.44C13.27 16.44 14.55 15.82 15.39 14.58" className="garden-brand-icon-line garden-brand-icon-line-faint" />
      </svg>
    </span>
  );
}

export function BrandWordmark({ className }) {
  return (
    <span className={cn('garden-wordmark', className)} aria-label="Garden">Garden</span>
  );
}

export function BrandLockup({ className, iconClassName, wordmarkClassName, iconSize = 24 }) {
  return (
    <span className={cn('garden-brand-lockup', className)}>
      <BrandIcon className={iconClassName} size={iconSize} />
      <BrandWordmark className={wordmarkClassName} />
    </span>
  );
}
