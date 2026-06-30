/* Shared UI kit barrel — import primitives via `@platform/ui`.
   The kit's stylesheet (ui-kit.css) is imported once by platform/src/main.tsx,
   so modules only import the components from here. */
export { Button } from './Button.tsx';
export type { ButtonProps, ButtonVariant } from './Button.tsx';
export { BackButton } from './BackButton.tsx';
export type { BackButtonProps } from './BackButton.tsx';
export { Card } from './Card.tsx';
export type { CardProps } from './Card.tsx';
export { ModuleScreen } from './ModuleScreen.tsx';
export type { ModuleScreenProps } from './ModuleScreen.tsx';
export { CharTile } from './CharTile.tsx';
export type { CharTileProps, CharTileRibbon, CharResultCode } from './CharTile.tsx';
