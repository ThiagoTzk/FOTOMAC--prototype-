import { SvgXml } from 'react-native-svg';

import { SVGS, type IconName } from './svgs';

type Props = { name: IconName; size: number };

/** Renders one of the icons exported from Figma, at the size the design uses. */
export function Icon({ name, size }: Props) {
  // Decorative: every icon sits next to a text that already says what it means.
  return <SvgXml xml={SVGS[name]} width={size} height={size} />;
}
