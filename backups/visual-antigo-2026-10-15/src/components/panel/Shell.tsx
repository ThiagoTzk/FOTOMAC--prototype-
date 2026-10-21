import { router, usePathname, type Href } from 'expo-router';
import {
  Bell, CalendarDays, ChevronDown, CircleUserRound, LayoutDashboard, LogOut, Menu, ScanFace, Tags, Users, X, type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Brand } from '@/components/panel/Brand';
import { fonts, panel } from '@/theme/tokens';

type NavEntry = { href: Href; label: string; icon: LucideIcon; match: string };

const NAV: NavEntry[] = [
  { href: '/painel', label: 'Visão geral', icon: LayoutDashboard, match: '/painel' },
  { href: '/eventos', label: 'Eventos', icon: CalendarDays, match: '/eventos' },
];

/** Administrator-only items (the Figma has no admin screens; same layout as the rest).
 *  Hiding them is only for the interface — the API refuses non-admins (RF002 note 4). */
const ADMIN_NAV: NavEntry[] = [
  { href: '/contas', label: 'Contas', icon: Users, match: '/contas' },
  { href: '/temas', label: 'Temas', icon: Tags, match: '/temas' },
  { href: '/reconhecimento', label: 'Reconhecimento facial', icon: ScanFace, match: '/reconhecimento' },
];

/** Below this width the sidebar becomes a drawer (RNF08: phones and tablets too). */
const WIDE = 1024;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function NavItem({ href, label, icon: Icon, active, onPress }: { href: Href; label: string; icon: LucideIcon; active: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      onPress={() => { onPress?.(); router.navigate(href); }}
      style={({ hovered }: any) => [styles.navItem, active ? styles.navActive : hovered && { backgroundColor: panel.page }]}>
      <Icon size={18} color={active ? '#FFFFFF' : panel.navText} strokeWidth={1.6} absoluteStrokeWidth />
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { account, logout } = useAuth();
  const items = account?.role === 'admin' ? [...NAV, ...ADMIN_NAV] : NAV;
  return (
    <View style={styles.sidebar}>
      <View style={{ gap: 30 }}>
        <Brand />
        <View style={{ gap: 8 }} role="navigation" accessibilityLabel="Menu principal">
          {items.map((n) => (
            <NavItem key={n.label} {...n} active={pathname.startsWith(n.match)} onPress={onNavigate} />
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <View style={styles.divider} />
        <NavItem href="/perfil" label="Meu perfil" icon={CircleUserRound} active={pathname === '/perfil'} onPress={onNavigate} />
        <Pressable accessibilityRole="button" onPress={logout}
                   style={({ hovered }: any) => [styles.navItem, hovered && { backgroundColor: panel.page }]}>
          <LogOut size={18} color={panel.navText} strokeWidth={1.6} absoluteStrokeWidth />
          <Text style={styles.navLabel}>Sair</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Header({ onMenu }: { onMenu?: () => void }) {
  const { account, logout } = useAuth();
  // Narrow screens (onMenu present): only the initials, so the header never overflows.
  const compact = !!onMenu;
  const [menu, setMenu] = useState(false);
  const [attention, setAttention] = useState(0);
  const pathname = usePathname();

  // The bell only shows the dot when something real needs attention (no decorative alert).
  useEffect(() => {
    api<{ attention: number }>('/dashboard').then((d) => setAttention(d.attention)).catch(() => undefined);
  }, [pathname]);

  if (!account) return null;
  const role = account.role === 'admin' ? 'Administrador' : 'Fotógrafo';
  return (
    <View style={[styles.header, compact && { paddingHorizontal: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {onMenu && (
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir menu" onPress={onMenu} style={styles.round}>
            <Menu size={18} color={panel.navText} strokeWidth={1.6} absoluteStrokeWidth />
          </Pressable>
        )}
        {!compact && <Text style={styles.context}>{account.role === 'admin' ? 'ÁREA DO ADMINISTRADOR' : 'ÁREA DO FOTÓGRAFO'}</Text>}
      </View>
      <View style={styles.account}>
        <Pressable accessibilityRole="button" accessibilityLabel={attention ? `${attention} itens requerem atenção` : 'Sem pendências'}
                   onPress={() => router.navigate('/painel')} style={styles.round}>
          <Bell size={18} color={panel.navText} strokeWidth={1.6} absoluteStrokeWidth />
          {attention > 0 && <View style={styles.dot} />}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Menu da conta" accessibilityState={{ expanded: menu }}
                   onPress={() => setMenu((m) => !m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {/* Initials instead of the profile photo of the design: a photo has no purpose in
              the system (LGPD Art. 6, III) — see docs/ADEQUACAO-FIGMA-V1.6.md. */}
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials(account.full_name)}</Text></View>
          {!compact && (
            <>
              <View style={{ gap: 2 }}>
                <Text style={styles.name} numberOfLines={1}>{account.full_name.split(' ').slice(0, 2).join(' ')}</Text>
                <Text style={styles.role}>{role}</Text>
              </View>
              <ChevronDown size={14} color={panel.muted} strokeWidth={1.6} absoluteStrokeWidth />
            </>
          )}
        </Pressable>
        {menu && (
          <View style={styles.menu} accessibilityRole="menu">
            <Pressable accessibilityRole="menuitem" style={styles.menuItem}
                       onPress={() => { setMenu(false); router.navigate('/perfil'); }}>
              <Text style={styles.menuText}>Meu perfil</Text>
            </Pressable>
            <Pressable accessibilityRole="menuitem" style={styles.menuItem} onPress={logout}>
              <Text style={styles.menuText}>Sair</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

/** Sidebar + header + scrollable content, as in every "Área autenticada" frame. */
export function Shell({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const [drawer, setDrawer] = useState(false);
  const wide = width >= WIDE;
  return (
    <View style={styles.root}>
      {wide && <Sidebar />}
      <View style={{ flex: 1 }}>
        <Header onMenu={wide ? undefined : () => setDrawer(true)} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, !wide && { padding: 16 }]}>
          {children}
        </ScrollView>
      </View>
      {!wide && drawer && (
        <View style={styles.overlay}>
          <View style={{ height: '100%' }}>
            <Sidebar onNavigate={() => setDrawer(false)} />
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar menu" onPress={() => setDrawer(false)}
                       style={[styles.round, { position: 'absolute', top: 20, right: -48 }]}>
              <X size={18} color={panel.navText} strokeWidth={1.6} absoluteStrokeWidth />
            </Pressable>
          </View>
          <Pressable style={{ flex: 1 }} accessibilityLabel="Fechar menu" onPress={() => setDrawer(false)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: panel.page },
  sidebar: { width: 240, height: '100%', backgroundColor: '#FFFFFF', paddingTop: 26, paddingBottom: 24, paddingHorizontal: 20,
             justifyContent: 'space-between', borderRightWidth: 1, borderColor: panel.border },
  navItem: { height: 44, borderRadius: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  navActive: { backgroundColor: panel.primary },
  navLabel: { fontFamily: fonts.medium, fontSize: 14, color: panel.navText },
  navLabelActive: { fontFamily: fonts.bold, color: '#FFFFFF' },
  divider: { height: 1, backgroundColor: panel.navDivider },
  header: { height: 72, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: panel.border, paddingHorizontal: 32,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 },
  context: { fontFamily: fonts.regular, fontSize: 12, color: panel.muted },
  account: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  round: { width: 38, height: 38, borderRadius: 999, backgroundColor: panel.page, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: 999, backgroundColor: panel.notificationDot,
         borderWidth: 1, borderColor: '#FFFFFF' },
  avatar: { width: 38, height: 38, borderRadius: 999, backgroundColor: panel.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.bold, fontSize: 14, color: panel.primaryText },
  name: { fontFamily: fonts.bold, fontSize: 14, color: panel.text, maxWidth: 160 },
  role: { fontFamily: fonts.regular, fontSize: 12, color: panel.muted },
  menu: { position: 'absolute', top: 50, right: 0, minWidth: 180, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: panel.border,
          borderRadius: panel.radius, boxShadow: '0px 8px 24px rgba(24, 55, 72, 0.12)', paddingVertical: 6 },
  menuItem: { paddingHorizontal: 14, paddingVertical: 10 },
  menuText: { fontFamily: fonts.regular, fontSize: 14, color: panel.text },
  content: { padding: 32, gap: 24 },
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: 'rgba(7, 45, 68, 0.35)', zIndex: 100 },
});
