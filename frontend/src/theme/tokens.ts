/**
 * Design tokens extracted from the Figma file "FOTOMAC (Copy)" (CITEC team).
 * The Figma file uses raw values, not variables, so this is the single place that names
 * them. If CITEC changes the palette, only this file changes (RNF24).
 */
export const colors = {
  primary: '#007DC5',
  primaryText: '#005F97',
  primarySoft: '#E8F5FC',

  text: '#1E2933',
  textMuted: '#65727E',
  placeholder: '#8A96A0',

  background: '#F6F8FA',
  surface: '#FFFFFF',
  border: '#DDE3E8',
  inputBorder: '#C7D0D8',

  danger: '#C73B47',
  dangerSoft: '#FCECEF',
  success: '#23855B',
  successSoft: '#E8F7F0',
} as const;

/** Fonts used by the designs, loaded in src/app/_layout.tsx. */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
  /** The FOTOMAC wordmark next to the camera symbol: "FOTO" regular + "MAC" extra bold. */
  brandRegular: 'Montserrat_400Regular',
  brandBold: 'Montserrat_800ExtraBold',
} as const;

/**
 * Operation area (photographer / administrator). Read from the .fig file: these screens use
 * a slightly different grey scale from the authentication cards above.
 */
export const panel = {
  text: '#26343D',
  muted: '#667781',
  placeholder: '#8A99A3',
  border: '#DDE5EA',
  borderSoft: '#F5F7FA',
  page: '#F5F7F9',
  navText: '#072D44',
  navDivider: '#31536A',
  primary: '#007DC5',
  primaryText: '#00659F',
  primarySoft: '#E8F5FC',
  success: '#15835D',
  successSoft: '#E8F7F1',
  warning: '#9A6500',
  warningSoft: '#FFF4D6',
  danger: '#C63D4A',
  dangerSoft: '#FDECEF',
  notificationDot: '#FFC506',
  radius: 10,
  cardRadius: 14,
  cardShadow: '0px 2px 8px rgba(24, 55, 72, 0.05)',
} as const;

export const radius = { sm: 8, md: 12, pill: 999 } as const;

export const shadow = {
  // Figma (read from the .fig file): drop shadow 0 2, blur 8, rgba(20,35,47,0.04). boxShadow works on web, iOS and Android
  // (the older shadowColor/shadowOffset props are deprecated in React Native).
  card: { boxShadow: '0px 2px 8px rgba(20, 35, 47, 0.04)' },
} as const;

/**
 * Visitor area (public pages, RF013-RF023). Read from the .fig file: these screens were drawn
 * for mobile (402 px) with Poppins and an iOS-like grey page; on the web the same column is
 * centred and the event lists widen into a grid.
 */
export const visitor = {
  page: '#F2F2F7',
  surface: '#FFFFFF',
  title: '#111827',
  heading: '#1F2937',
  text: '#374151',
  muted: '#4B5563',
  placeholder: '#9CA3AF',
  primary: '#007DC5',
  danger: '#D51C44',
  chip: '#E5E5EA',
  inputBg: 'rgba(5, 27, 59, 0.04)',
  cardBorder: 'rgba(0, 0, 0, 0.10)',
  overlay: 'rgba(75, 75, 75, 0.53)',
  /** Theme pills alternate between the two institutional accents. */
  pills: [
    { bg: 'rgba(68, 200, 245, 0.20)', fg: '#007DC5' },
    { bg: 'rgba(255, 205, 11, 0.20)', fg: '#CFA70A' },
  ],
  headerShadow: '0px 4px 12px 2px rgba(0, 0, 0, 0.08)',
  cardShadow: '0px 0px 12px rgba(0, 0, 0, 0.12)',
  menuShadow: '0px 0px 6px rgba(0, 0, 0, 0.20)',
  /** Width of the content column on phones/tablets — and of reading pages (privacy, removal). */
  column: 760,
  /** On a computer the visitor area is a WEB page, not a stretched phone screen (feedback of the
   *  1st committee): from this window width on, the column widens. Phones keep the Figma layout. */
  wideFrom: 1024,
  columnWide: 1200,
} as const;

export const poppins = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;
