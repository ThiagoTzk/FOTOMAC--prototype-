import { useLocalSearchParams } from 'expo-router';
import { CircleCheck, ShieldOff, TriangleAlert } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getRevocation, revoke } from '@/api/institutional';
import { VisitorHeader } from '@/components/visitor/Header';
import { Column, Note, useWide, VButton, vtext } from '@/components/visitor/ui';
import { PageBand, WebPage, Wrap } from '@/components/visitor/web/Site';
import { visitor } from '@/theme/tokens';

type Info = Awaited<ReturnType<typeof getRevocation>>;

/**
 * Revocation by the person, from the link received when signing (RF020 note 4; LGPD Art. 8 §5: free,
 * at any time, without a reason). At once: reference photos, facial data and every mark are eliminated.
 */
export default function RevocationScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [invalid, setInvalid] = useState(!token);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    getRevocation(token).then(setInfo).catch(() => setInvalid(true));
  }, [token]);

  async function confirm() {
    setBusy(true); setError(null);
    try {
      const r = await revoke(token!);
      setInfo((i) => (i ? { ...i, status: 'revoked', revoked_at: r.revoked_at } : i));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível revogar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  let body: ReactNode = <Text style={vtext.body}>Carregando…</Text>;
  if (invalid) body = <Note tone="danger" icon={TriangleAlert}>Link de revogação inválido.</Note>;
  else if (info?.status === 'revoked') {
    body = (
      <Note icon={CircleCheck}>
        Autorização revogada{info.revoked_at ? ` em ${new Date(info.revoked_at).toLocaleString('pt-BR')}` : ''}. As suas fotografias de
        referência, o vetor facial e todas as marcações foram eliminados. O termo assinado fica guardado apenas como prova.
      </Note>
    );
  } else if (info) {
    body = (
      <View style={{ gap: 16 }}>
        <Text style={vtext.body}>
          {info.full_name}, ao revogar, o FOTOMAC deixa de localizar você nas fotografias dos eventos, e o que foi guardado para isso
          (fotografias de referência, vetor facial e marcações) é eliminado na hora, sem volta. Não é preciso justificar.
        </Text>
        {error && <Note tone="danger" icon={TriangleAlert}>{error}</Note>}
        <View style={{ alignSelf: 'flex-end' }}>
          <VButton label="Revogar minha autorização" icon={ShieldOff} loading={busy} onPress={confirm} />
        </View>
      </View>
    );
  }

  const title = 'Revogar autorização';
  if (useWide()) {
    return (
      <WebPage>
        <PageBand crumbs={[{ label: title }]} title={title} sub="Pessoa institucional do Centro Universitário CESMAC." />
        <Wrap style={{ paddingVertical: 48 }}><View style={styles.card}>{body}</View></Wrap>
      </WebPage>
    );
  }
  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 48 }}>
      <VisitorHeader back />
      <Column narrow style={{ gap: 20, marginTop: 24 }}>
        <Text style={vtext.h1} accessibilityRole="header">{title}</Text>
        {body}
      </Column>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: visitor.page },
  card: { backgroundColor: visitor.surface, borderRadius: 16, padding: 32, maxWidth: 760, alignSelf: 'center', width: '100%',
          boxShadow: visitor.cardShadow },
});
