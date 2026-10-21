import { router, usePathname, type Href } from 'expo-router';
import { ChevronRight, LogIn } from 'lucide-react-native';
import type { ReactNode, Ref } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Brand } from '@/components/panel/Brand';
import { poppins, visitor } from '@/theme/tokens';

/**
 * The visitor area on a COMPUTER is a web site, not a stretched phone screen (feedback of the
 * 1st committee). Bands run edge to edge; only their content is limited to a 1200 px column
 * ("Wrap"). Layout studied in docs/design/simulado-home (approved 15/10/2026), CITEC tokens.
 */
export const web = {
  navy: '#072D44',
  navy2: '#0B3B5A',
  yellow: '#FFC506',
  line: '#E5E7EB',
  soft: '#6B7280',
  softBlue: '#E8F5FC',
  cardShadow: '0px 1px 3px rgba(0,0,0,.08), 0px 8px 24px rgba(5,27,59,.06)',
  cardShadowHover: '0px 2px 6px rgba(0,0,0,.08), 0px 16px 32px rgba(5,27,59,.12)',
} as const;

export function Wrap({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.wrap, style]}>{children}</View>;
}

const NAV: { label: string; href: Href; match: (p: string) => boolean }[] = [
  { label: 'Eventos', href: '/', match: (p) => p === '/' || p.startsWith('/explorar') || p.startsWith('/evento') },
  { label: 'Como funciona', href: { pathname: '/', params: { secao: 'como-funciona' } }, match: () => false },
  { label: 'Privacidade', href: '/privacidade', match: (p) => p.startsWith('/privacidade') },
];

/** Full-width top bar: the FOTOMAC mark (camera symbol + wordmark), the menu and staff access. */
export function SiteHeader() {
  const path = usePathname();
  return (
    <View style={styles.top}>
      <Wrap style={styles.topRow}>
        <Pressable accessibilityRole="link" accessibilityLabel="FOTOMAC — início" onPress={() => router.navigate('/')}>
          <Brand large />
        </Pressable>
        <View style={styles.nav} role="navigation" accessibilityLabel="Menu principal">
          {NAV.map((n) => {
            const on = n.match(path);
            return (
              <Pressable key={n.label} accessibilityRole="link" onPress={() => router.navigate(n.href)}
                         style={({ hovered }: any) => [styles.navItem, (on || hovered) && styles.navItemOn]}>
                {({ hovered }: any) => <Text style={[styles.navText, (on || hovered) && { color: visitor.primary }]}>{n.label}</Text>}
              </Pressable>
            );
          })}
        </View>
        <Pressable accessibilityRole="link" onPress={() => router.push('/login')}
                   style={({ hovered }: any) => [styles.staff, hovered && { backgroundColor: web.softBlue }]}>
          <LogIn size={18} color={visitor.primary} strokeWidth={1.8} absoluteStrokeWidth />
          <Text style={styles.staffText}>Acesso da equipe</Text>
        </Pressable>
      </Wrap>
    </View>
  );
}

/** Footer in columns (RF022 note 2: the privacy policy and the removal channel on every page). */
export function SiteFooter() {
  const link = (label: string, href: Href) => (
    <Pressable accessibilityRole="link" onPress={() => router.navigate(href)}>
      {({ hovered }: any) => <Text style={[styles.footLink, hovered && { color: visitor.primary }]}>{label}</Text>}
    </Pressable>
  );
  return (
    <View style={styles.footer}>
      <Wrap style={styles.footCols}>
        <View style={{ flex: 1.6, gap: 14 }}>
          <Brand />
          <Text style={styles.about}>
            Acervo fotográfico dos eventos do Centro Universitário CESMAC. As fotos destinam-se exclusivamente às pessoas
            nelas retratadas.
          </Text>
        </View>
        <View style={styles.footCol}><Text style={styles.footTitle}>FOTOMAC</Text>{link('Eventos', '/')}{link('Como funciona', { pathname: '/', params: { secao: 'como-funciona' } })}</View>
        <View style={styles.footCol}><Text style={styles.footTitle}>Privacidade</Text>{link('Política de Privacidade', '/privacidade')}</View>
        <View style={styles.footCol}><Text style={styles.footTitle}>Equipe</Text>{link('Acesso da equipe', '/login')}</View>
      </Wrap>
      <Wrap><View style={styles.legal}><Text style={styles.legalText}>© {new Date().getFullYear()} Centro Universitário CESMAC</Text><Text style={styles.legalText}>Maceió – AL</Text></View></Wrap>
    </View>
  );
}

export type Crumb = { label: string; href?: Href };

/**
 * Title band of an inner page, in the colours of the home's hero: the breadcrumb ("Início ›
 * Eventos › …" — every level is a link, so going back is always one click) and the title.
 */
export function PageBand({ crumbs, title, sub, children }: { crumbs: Crumb[]; title?: string; sub?: string; children?: ReactNode }) {
  return (
    <View style={styles.band}>
      <Wrap style={{ paddingTop: 28, paddingBottom: 40 }}>
        <View style={styles.crumbs} role="navigation" accessibilityLabel="Você está em">
          {[{ label: 'Início', href: '/' as Href }, ...crumbs].map((c, i, all) => (
            <View key={c.label} style={styles.crumb}>
              {i > 0 && <ChevronRight size={14} color="rgba(255,255,255,0.6)" strokeWidth={1.8} absoluteStrokeWidth />}
              {c.href && i < all.length - 1 ? (
                <Pressable accessibilityRole="link" onPress={() => router.navigate(c.href!)}>
                  {({ hovered }: any) => <Text style={[styles.crumbText, hovered && { color: '#FFFFFF', textDecorationLine: 'underline' }]}>{c.label}</Text>}
                </Pressable>
              ) : <Text style={[styles.crumbText, { color: '#FFFFFF' }]} numberOfLines={1}>{c.label}</Text>}
            </View>
          ))}
        </View>
        {!!title && <Text style={styles.bandTitle} accessibilityRole="header">{title}</Text>}
        {!!sub && <Text style={styles.bandSub}>{sub}</Text>}
        {children}
      </Wrap>
    </View>
  );
}

/** A whole web page: top bar, the page's bands and the footer, in one scroll. */
export function WebPage({ children, scrollRef }: { children: ReactNode; scrollRef?: Ref<ScrollView> }) {
  return (
    <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: visitor.page }} contentContainerStyle={{ minHeight: '100%' }}>
      <SiteHeader />
      {/* Above the footer: a menu that opens near the end of the content (e.g. "Buscar minhas fotos")
          spills over it and must stay clickable. */}
      <View style={{ flexGrow: 1, zIndex: 1 }}>{children}</View>
      <SiteFooter />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: visitor.columnWide, alignSelf: 'center', paddingHorizontal: 32 },
  top: { backgroundColor: visitor.surface, boxShadow: visitor.headerShadow, zIndex: 50 },
  topRow: { height: 76, flexDirection: 'row', alignItems: 'center', gap: 40 },
  nav: { flex: 1, flexDirection: 'row', gap: 28, paddingLeft: 24 },
  navItem: { paddingVertical: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  navItemOn: { borderBottomColor: visitor.primary },
  navText: { fontFamily: poppins.medium, fontSize: 15, color: visitor.heading },
  staff: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1.5,
           borderColor: visitor.primary },
  staffText: { fontFamily: poppins.semiBold, fontSize: 15, color: visitor.primary },
  band: { zIndex: 20, backgroundImage: `radial-gradient(900px 360px at 90% -20%, rgba(68,200,245,.30), transparent 60%), linear-gradient(120deg, ${web.navy} 0%, ${web.navy2} 50%, ${visitor.primary} 100%)` } as object,
  crumbs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 560 },
  crumbText: { fontFamily: poppins.medium, fontSize: 14, color: 'rgba(255,255,255,0.75)' },
  bandTitle: { fontFamily: poppins.bold, fontSize: 38, lineHeight: 46, color: '#FFFFFF', marginTop: 18, maxWidth: 900 },
  bandSub: { fontFamily: poppins.regular, fontSize: 17, lineHeight: 27, color: 'rgba(255,255,255,0.85)', marginTop: 8, maxWidth: 760 },
  footer: { backgroundColor: visitor.surface, borderTopWidth: 1, borderTopColor: web.line },
  footCols: { flexDirection: 'row', gap: 32, paddingTop: 48, paddingBottom: 36 },
  footCol: { flex: 1, gap: 10 },
  footTitle: { fontFamily: poppins.semiBold, fontSize: 14, color: visitor.heading, marginBottom: 2 },
  footLink: { fontFamily: poppins.regular, fontSize: 14, color: visitor.muted },
  about: { fontFamily: poppins.regular, fontSize: 13, lineHeight: 22, color: web.soft, maxWidth: 340 },
  legal: { borderTopWidth: 1, borderTopColor: web.line, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 18,
           paddingBottom: 22 },
  legalText: { fontFamily: poppins.regular, fontSize: 13, color: web.soft },
});
