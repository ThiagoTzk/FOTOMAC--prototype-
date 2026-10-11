import { router } from 'expo-router';
import { ArrowLeft, Settings2 } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/components/panel/Brand';
import { poppins, visitor } from '@/theme/tokens';

import { Backdrop, Column } from './ui';

const MENU = [
  { label: 'Política de Privacidade', href: '/privacidade' },
  { label: 'Solicitar remoção de imagem', href: '/remocao' },
  { label: 'Acesso da equipe', href: '/login' },
] as const;

type Props = { back?: boolean | string; children?: ReactNode };

/**
 * White top card of every visitor screen ("Rectangle 3" with shadow 0 4 12 2 / 8%): the brand,
 * the settings icon and, below them, the screen's own header content.
 *
 * The settings icon opens the menu with the Privacy Policy — reachable from ANY screen
 * (RF022 note 2) — the removal channel open to anyone (RF022 note 6) and the staff login.
 */
export function VisitorHeader({ back, children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.card}>
      <Column style={{ gap: 20, paddingTop: 24, paddingBottom: 20 }}>
        <View style={[styles.top, { zIndex: 30 }]}>
          <Pressable accessibilityRole="link" accessibilityLabel="FOTOMAC — início" onPress={() => router.navigate('/')}>
            <Brand small />
          </Pressable>
          <View>
            {open && <Backdrop onPress={() => setOpen(false)} />}
            <Pressable accessibilityRole="button" accessibilityLabel="Menu" accessibilityState={{ expanded: open }}
                       onPress={() => setOpen((o) => !o)} hitSlop={6}>
              <Settings2 size={28} color={visitor.heading} strokeWidth={1.6} absoluteStrokeWidth />
            </Pressable>
            {open && (
              <View style={styles.menu} accessibilityRole="menu">
                {MENU.map((m) => (
                  <Pressable key={m.href} accessibilityRole="menuitem"
                             onPress={() => { setOpen(false); router.push(m.href); }}
                             style={({ hovered }: any) => [styles.item, hovered && { backgroundColor: visitor.page }]}>
                    <Text style={styles.itemText}>{m.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
        {back && (
          <Pressable accessibilityRole="link" style={styles.back}
                     // Really goes back (removes this screen) — "navigate" would stack the previous
                     // page on top and keep this one alive underneath. Opened by a direct link:
                     // there is nothing behind it, so it is replaced by the given page (or home).
                     onPress={() => (router.canGoBack() ? router.back() : router.replace((typeof back === 'string' ? back : '/') as never))}>
            <ArrowLeft size={24} color={visitor.primary} strokeWidth={1.8} absoluteStrokeWidth />
            <Text style={styles.backText}>Voltar</Text>
          </Pressable>
        )}
        {children}
      </Column>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: visitor.surface, boxShadow: visitor.headerShadow, zIndex: 10 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menu: { position: 'absolute', right: 0, top: 38, width: 250, backgroundColor: visitor.surface, borderRadius: 12,
          padding: 8, boxShadow: visitor.menuShadow },
  item: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8 },
  itemText: { fontFamily: poppins.medium, fontSize: 13, color: visitor.text },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  backText: { fontFamily: poppins.medium, fontSize: 16, color: visitor.primary },
});
