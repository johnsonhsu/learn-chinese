import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

/**
 * The shared cream candy panel (the `.module-tile` look: purple border, 3D drop,
 * cream fill, centered max-width). Use it for the `.module-tile` appearance
 * OUTSIDE a full ModuleScreen — e.g. a standalone panel. Inside a module's main
 * screen prefer <ModuleScreen>, which already renders a Card.
 *
 * Extra `className` is appended, so a module can add its own inner-layout class.
 */
export function Card({ className, children, ...rest }: CardProps) {
  const cls = ['module-tile', className].filter(Boolean).join(' ');
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
