import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, panel } from '@/theme/tokens';

type Crumb = { label: string; href?: Href };

/** "Título da página": breadcrumb, title (+ status), subtitle and actions on the right. */
export function PageHeader({ crumbs, title, badge, subtitle, actions }: {
  crumbs?: Crumb[]; title: string; badge?: ReactNode; subtitle?: string; actions?: ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      {crumbs && (
        <View style={styles.crumbs} role="navigation" accessibilityLabel="Caminho">
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
  crumbs: { flexDirection: 'row', flexWrap: 'wrap' },
  crumb: { fontFamily: fonts.semiBold, fontSize: 14, color: panel.primary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  title: { fontFamily: fonts.regular, fontSize: 28, color: panel.text },
  subtitle: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: panel.muted },
});
