import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { CircleCheck, Eraser, ShieldCheck, TriangleAlert } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { authorizationPhotoUrl, getAuthorization, refuse, sign, type AuthorizationPage } from '@/api/institutional';
import { SignaturePad } from '@/components/visitor/SignaturePad';
import { VisitorHeader } from '@/components/visitor/Header';
import { Column, Note, Sheet, useWide, VButton, vtext } from '@/components/visitor/ui';
import { PageBand, WebPage, Wrap } from '@/components/visitor/web/Site';
import { poppins, visitor } from '@/theme/tokens';

type Step = 'loading' | 'invalid' | 'form' | 'signed' | 'refused';

/**
 * The page an institutional person opens from the e-mail (RF020 note 3): reads the term, sees the photos
 * of them that will be used, and SIGNS on the screen — or refuses. Nothing about them is processed before
 * this. The link is single use: once signed or refused, it stops working.
 */
export default function AuthorizationScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [page, setPage] = useState<AuthorizationPage | null>(null);
  const [step, setStep] = useState<Step>(token ? 'loading' : 'invalid');   // no token, nothing to load
  const [signature, setSignature] = useState<string | null>(null);
  const [clear, setClear] = useState(0);
  const [revokeUrl, setRevokeUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!token) return;
    getAuthorization(token).then((p) => { setPage(p); setStep('form'); }).catch(() => setStep('invalid'));
  }, [token]);

  async function submit(png: string) {
    setBusy(true); setError(null);
    try {
      const r = await sign(token!, png);
      setRevokeUrl(r.revoke_url);
      setStep('signed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível registrar a assinatura. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true); setError(null);
    try { await refuse(token!); setStep('refused'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível registrar. Tente de novo.'); }
    finally { setBusy(false); setAsking(false); }
  }

  const title = 'Autorização de uso de imagem';
  let body: ReactNode = <Text style={vtext.body}>Carregando…</Text>;
  if (step === 'invalid') {
    body = <Note tone="danger" icon={TriangleAlert}>Link inválido, já usado ou vencido. Se você ainda não assinou, peça à administração do FOTOMAC um novo link.</Note>;
  } else if (step === 'refused') {
    body = <Note icon={CircleCheck}>Pronto: você não autorizou. O seu cadastro e as suas fotografias foram apagados do FOTOMAC.</Note>;
  } else if (step === 'signed') {
    body = (
      <View style={{ gap: 14 }}>
        <Note icon={CircleCheck}>Autorização assinada. Enviamos para o seu e-mail a confirmação, com o link para revogar quando quiser.</Note>
        {revokeUrl && (
          <Text style={vtext.body}>
            Guarde também este link de revogação: <Text selectable style={styles.link}>{revokeUrl}</Text>
          </Text>
        )}
      </View>
    );
  } else if (page) {
    body = (
      <View style={{ gap: 22 }}>
        <View style={{ gap: 6 }}>
          <Text style={vtext.h2}>{page.term.title}</Text>
          <Text style={vtext.small}>Versão do termo: {page.term.version} · link válido até {new Date(page.expires_at).toLocaleDateString('pt-BR')}</Text>
        </View>
        <View style={{ gap: 10 }}>
          <Text style={styles.label}>Fotografias que serão usadas para localizar você</Text>
          <View style={styles.photos}>
            {page.photos.map((id) => (
              <Image key={id} source={{ uri: authorizationPhotoUrl(token!, id) }} style={styles.photo} contentFit="cover"
                     accessibilityLabel="Fotografia de referência" />
            ))}
          </View>
        </View>
        <View style={{ gap: 10 }}>
          {page.term.paragraphs.map((p) => <Text key={p} style={[vtext.body, { textAlign: 'justify' }]}>{p}</Text>)}
        </View>
        <View style={{ gap: 10 }}>
          <Text style={styles.label}>Sua assinatura</Text>
          <Text style={vtext.small}>Assine dentro do quadro com o mouse, o dedo ou a caneta.</Text>
          <SignaturePad onChange={setSignature} clearSignal={clear} />
          <View style={{ alignSelf: 'flex-start' }}>
            <VButton label="Limpar assinatura" variant="ghost" icon={Eraser} onPress={() => setClear((n) => n + 1)} disabled={!signature} />
          </View>
          <Text style={styles.name}>{page.full_name} · {page.position}{page.unit ? ` · ${page.unit}` : ''}</Text>
        </View>
        {error && <Note tone="danger" icon={TriangleAlert}>{error}</Note>}
        <View style={styles.actions}>
          <VButton label="Não autorizo" variant="ghost" onPress={() => setAsking(true)} disabled={busy} />
          <VButton label="Assinar e autorizar" icon={ShieldCheck} loading={busy} disabled={!signature}
                   onPress={() => signature && submit(signature)} />
        </View>
        <Sheet visible={asking} title="Não autorizar?" onClose={() => setAsking(false)} width={420}>
          <Text style={vtext.body}>O seu cadastro e as suas fotografias serão apagados do FOTOMAC, e este link deixará de funcionar.</Text>
          <View style={styles.actions}>
            <VButton label="Voltar" variant="ghost" onPress={() => setAsking(false)} />
            <VButton label="Não autorizo" loading={busy} onPress={decline} />
          </View>
        </Sheet>
      </View>
    );
  }

  const intro = 'Pessoa institucional do Centro Universitário CESMAC — leia com atenção antes de assinar.';
  if (useWide()) {
    return (
      <WebPage>
        <PageBand crumbs={[{ label: title }]} title={title} sub={intro} />
        <Wrap style={{ paddingVertical: 48 }}><View style={styles.card}>{body}</View></Wrap>
      </WebPage>
    );
  }
  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 48 }}>
      <VisitorHeader back />
      <Column narrow style={{ gap: 20, marginTop: 24 }}>
        <View style={{ gap: 6 }}>
          <Text style={vtext.h1} accessibilityRole="header">{title}</Text>
          <Text style={vtext.body}>{intro}</Text>
        </View>
        {body}
      </Column>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: visitor.page },
  card: { backgroundColor: visitor.surface, borderRadius: 16, padding: 32, maxWidth: 860, alignSelf: 'center', width: '100%',
          boxShadow: visitor.cardShadow },
  label: { fontFamily: poppins.semiBold, fontSize: 15, color: visitor.heading },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photo: { width: 104, height: 130, borderRadius: 10, backgroundColor: visitor.page },
  name: { fontFamily: poppins.regular, fontSize: 14, color: visitor.text },
  link: { color: visitor.primary },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' },
});
