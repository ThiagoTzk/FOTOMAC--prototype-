import { router, usePathname, type Href } from 'expo-router';
import { Bell, CircleCheck, Clock, Info, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getNotifications, type PanelNotice } from '@/api/events';
import { fonts, panel } from '@/theme/tokens';

const ICON: Record<PanelNotice['tone'], { icon: LucideIcon; fg: string; bg: string }> = {
  danger: { icon: TriangleAlert, fg: panel.danger, bg: panel.dangerSoft },
  warning: { icon: Clock, fg: panel.warning, bg: panel.warningSoft },
  info: { icon: Info, fg: panel.primary, bg: panel.primarySoft },
};
const REFRESH_MS = 60_000;

/** The header bell (17/10/2026): what needs this account's attention, from GET /notifications. The red
 *  counter shows only URGENT items (something will be lost or someone waits); the others just inform.
 *  Nothing is stored: an item disappears when its situation is solved. */
export function NotificationBell({ onOpen }: { onOpen?: () => void }) {
  const [data, setData] = useState<{ items: PanelNotice[]; urgent: number } | null>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const load = useCallback(() => { getNotifications().then(setData).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [load, pathname]);           // every screen change…
  useEffect(() => {                                         // …and every minute while the panel is open
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const urgent = data?.urgent ?? 0;
  const items = data?.items ?? [];
  function toggle() {
    if (!open) { load(); onOpen?.(); }
    setOpen((o) => !o);
  }
  function go(href: string) {
    setOpen(false);
    router.navigate(href as Href);
  }

  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }}
                 accessibilityLabel={urgent ? `Notificações: ${urgent} ${urgent === 1 ? 'pendência' : 'pendências'}` : 'Notificações'}
                 onPress={toggle} style={styles.round}>
        <Bell size={18} color={panel.navText} strokeWidth={1.6} absoluteStrokeWidth />
        {urgent > 0 && (
          <View style={styles.badge}><Text style={styles.badgeText}>{urgent > 9 ? '9+' : urgent}</Text></View>
        )}
      </Pressable>
      {open && (
        <View style={styles.panel} accessibilityRole="menu">
          <View style={styles.head}>
            <Text style={styles.title}>Notificações</Text>
            {items.length > 0 && <Text style={styles.count}>{items.length} {items.length === 1 ? 'aviso' : 'avisos'}</Text>}
          </View>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <CircleCheck size={22} color={panel.success} strokeWidth={1.6} absoluteStrokeWidth />
              <Text style={styles.emptyText}>Nada pendente por aqui.</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 420 }}>
              {items.map((n, i) => {
                const t = ICON[n.tone];
                return (
                  <Pressable key={`${n.kind}-${i}`} accessibilityRole="menuitem" onPress={() => go(n.href)}
                             style={({ hovered }: any) => [styles.item, hovered && { backgroundColor: panel.page }]}>
                    <View style={[styles.icon, { backgroundColor: t.bg }]}>
                      <t.icon size={15} color={t.fg} strokeWidth={1.8} absoluteStrokeWidth />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.itemTitle}>{n.title}</Text>
                      <Text style={styles.itemText}>{n.description}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Pressable accessibilityRole="link" onPress={() => go('/painel')} style={styles.foot}>
            <Text style={styles.footText}>Abrir a Visão geral</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  round: { width: 38, height: 38, borderRadius: 999, backgroundColor: panel.page, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -3, right: -4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 999,
           backgroundColor: panel.notificationDot, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.bold, fontSize: 10, color: '#FFFFFF' },
  panel: { position: 'absolute', top: 50, right: -8, width: 380, maxWidth: '92vw' as unknown as number, backgroundColor: '#FFFFFF',
           borderWidth: 1, borderColor: panel.border, borderRadius: panel.radius, boxShadow: '0px 12px 32px rgba(24, 55, 72, 0.16)',
           overflow: 'hidden' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
          borderBottomWidth: 1, borderColor: panel.border },
  title: { fontFamily: fonts.bold, fontSize: 15, color: panel.text },
  count: { fontFamily: fonts.regular, fontSize: 12, color: panel.muted },
  item: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: panel.borderSoft },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: panel.text },
  itemText: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: panel.muted },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  emptyText: { fontFamily: fonts.regular, fontSize: 13, color: panel.muted },
  foot: { paddingVertical: 12, alignItems: 'center' },
  footText: { fontFamily: fonts.bold, fontSize: 13, color: panel.primary },
});
