import { router, type Href } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, panel } from '@/theme/tokens';

type Crumb = { label: string; href?: Href };

/**
 * "Título da página": breadcrumb, title (+ status), subtitle and actions on the right.
 *
 * Every page deeper than the first level gets a "Voltar" button before the breadcrumb. It goes
 * UP one level — to the nearest crumb with a link (Imagem → Imagens → Evento → Eventos) — not
 * back in the browser history, which could be anywhere (feedback of the 1st committee: deep
 * pages had no easy way back).
 */
export function PageHeader({ crumbs, title, badge, subtitle, actions }: {
  crumbs?: Crumb[]; title: string; badge?: ReactNode; subtitle?: string; actions?: ReactNode;
}) {
  const parent = crumbs?.slice(0, -1).reverse().find((c) => c.href);
  return (
    <View style={{ gap: 10 }}>
      {crumbs && (
        <View style={styles.crumbs} role="navigation" accessibilityLabel="Caminho">
          {parent && (
            <Pressable accessibilityRole="link" accessibilityLabel={`Voltar para ${parent.label}`}
                       onPress={() => router.navigate(parent.href!)}
                       style={({ hovered }: any) => [styles.back, hovered && { backgroundColor: panel.primarySoft }]}>
              <ArrowLeft size={18} color={panel.primary} strokeWidth={2} absoluteStrokeWidth />
              <Text style={styles.backText}>Voltar</Text>
            </Pressable>
          )}
          {crumbs.map((c, i) => (
            <View key={c.label} style={{ flexDirection: 'row' }}>
              {i > 0 && <Text style={styles.crumb}> / </Text>}
              {c.href ? (
                <Pressable accessibilityRole="link" onPress={() => router.navigate(c.href!)}>
                  <Text style={styles.crumb}>{c.label}</Text>
                </Pressable>
              ) : (
                <Text style={styles.crumb}>{c.label}</Text>
              )}
            </View>
          ))}
        </View>
      )}
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 240, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            {badge}
          </View>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {actions && <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>{actions}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  crumbs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, marginRight: 14,
          borderRadius: 8, borderWidth: 1, borderColor: panel.primary },
  backText: { fontFamily: fonts.semiBold, fontSize: 14, color: panel.primary },
  crumb: { fontFamily: fonts.semiBold, fontSize: 14, color: panel.primary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  title: { fontFamily: fonts.regular, fontSize: 28, color: panel.text },
  subtitle: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: panel.muted },
});
