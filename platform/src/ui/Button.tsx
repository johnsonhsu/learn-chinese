import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. primary = gold candy; secondary = cream + purple lip; ghost = subtle. */
  variant?: ButtonVariant;
  children?: ReactNode;
}

/**
 * The app's 3D candy button. Encapsulates the pressable-lip recipe that used to
 * be re-implemented per module (.sp-btn-*, .ws-card, .cc-btn-*, .btn-3d).
 *
 * Forwards every native button prop (onClick, disabled, type, aria-*, …) plus an
 * optional extra `className`. Styling lives in ui-kit.css under `.app-shell`.
 *
 *   <Button variant="primary" onClick={onStart}>Start Practice</Button>
 */
export function Button({
  variant = 'primary',
  className,
  type,
  children,
  ...rest
}: ButtonProps) {
  const cls = ['ui-btn', `ui-btn--${variant}`, className].filter(Boolean).join(' ');
  return (
    // Default to type="button" so a Button inside a <form> doesn't submit it
    // unless the caller explicitly opts into type="submit".
    <button type={type ?? 'button'} className={cls} {...rest}>
      {children}
    </button>
  );
}
