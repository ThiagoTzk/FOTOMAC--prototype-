import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import {
  CircleCheck, Copy, FileDown, Images, Link2, Mail, RefreshCw, ScanFace, ShieldOff, Trash2, TriangleAlert,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { formatDateTime } from '@/api/images';
import {
  deletePerson, devLink, endAuthorization, formUrl, getPerson, personPhotoUrl, rescan, resendLink, signatureUrl, type PersonDetail,
} from '@/api/institutional';
import { STATUS_PILL } from '@/components/admin/institutional';
import { Modal } from '@/components/panel/Modal';
import { PageHeader } from '@/components/panel/PageHeader';
import { Button, Card, InfoItem, Notice, Pill, SectionTitle } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

/**
 * One institutional registration (RF020), for the administrator: data, reference photos, the signature
 * as drawn by the person, the proof of the signature and the official copy in PDF.
 */
export default function InstitutionalPersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [p, setP] = useState<PersonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'end' | 'delete' | null>(null);
  const [link, setLink] = useState<string | null>(null); // TEMPORÁRIO — remover antes da implantação

  const load = useCallback(() => getPerson(id).then(setP).catch((e) => setError(e.message)), [id]);
  useEffect(() => { void load(); }, [load]);
  // While the collection is being searched, follow it.
  useEffect(() => {
    if (p?.scan_status !== 'pending') return;
    const t = setTimeout(() => void load(), 2500);
    return () => clearTimeout(t);
  }, [p, load]);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(null); setDone(null);
    try { await action(); setDone(message); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir.'); }
    finally { setBusy(false); setConfirm(null); }
  }

  // The id is a PARAMETER (React Compiler: never read `p` inside a memoized function).
  function downloadForm(personId: string) {
    if (Platform.OS === 'web') window.location.href = formUrl(personId); else Linking.openURL(formUrl(personId));
  }

  if (!p) return error ? <Notice tone="danger" icon={TriangleAlert} title={error} /> : <Card><ActivityIndicator color={panel.primary} /></Card>;
  const pill = STATUS_PILL[p.status];
  const expired = p.status === 'awaiting' && p.link_expires_at && new Date(p.link_expires_at) < new Date();
  return (
    <View style={{ gap: 20 }}>
      <PageHeader crumbs={[{ label: 'Pessoas institucionais', href: '/pessoas-institucionais' },
                           { label: 'Cadastro', href: '/pessoas-institucionais/cadastro' }, { label: p.full_name }]}
                  title={p.full_name} badge={<Pill label={p.status_label} bg={pill.bg} fg={pill.fg} />}
                  subtitle={`${p.position}${p.unit ? ` · ${p.unit}` : ''}`}
                  actions={(
                    <>
                      {p.signed && <Button variant="secondary" icon={FileDown} label="Baixar formulário (PDF)" onPress={() => downloadForm(p.id)} />}
                      {p.status === 'active' && (
                        <Button icon={Images} label="Ver fotos" onPress={() => router.navigate(`/pessoas-institucionais?pessoa=${p.id}`)} />)}
                    </>)} />
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      {done && <Notice tone="success" icon={CircleCheck} title={done} />}

      {p.status === 'awaiting' && (
        <Notice tone="warning" icon={Mail} title={expired ? 'O link de autorização venceu' : 'Aguardando a assinatura da pessoa'}
                description={`O termo foi enviado para ${p.email}${p.link_expires_at ? `; o link ${expired ? 'venceu' : 'vale até'} ${formatDateTime(p.link_expires_at)}` : ''}. Até a assinatura, as fotos não são processadas. Sem assinatura em 30 dias, o cadastro é apagado.`}
                actionLabel="Reenviar link" onAction={() => run(() => resendLink(p.id), 'Link reenviado. O anterior deixou de funcionar.')} />
      )}
      {/* TEMPORÁRIO — REMOVER ANTES DA IMPLANTAÇÃO: link à mostra só em desenvolvimento, enquanto não há e-mail real. */}
      {p.dev_link_available && (
        <View style={styles.devBox}>
          <Text style={styles.devTag}>SÓ DEMONSTRAÇÃO · REMOVER ANTES DA IMPLANTAÇÃO</Text>
          <Text style={styles.text}>Gera um link novo (o anterior para de funcionar) e mostra aqui, para abrir numa janela anônima e assinar como a pessoa.</Text>
          <View style={styles.actions}>
            <Button label="Mostrar link" variant="secondary" icon={Link2} loading={busy}
                    onPress={() => { setError(null); devLink(p.id).then((r) => setLink(r.url)).catch((e) => setError(e.message)); }} />
            {link && Platform.OS === 'web' && (
              <Button label="Copiar" variant="secondary" icon={Copy}
                      onPress={() => { void navigator.clipboard?.writeText(link); setDone('Link copiado.'); }} />)}
          </View>
          {link && <Text selectable style={styles.devLink}>{link}</Text>}
        </View>
      )}
      {/* FIM DO TRECHO TEMPORÁRIO */}
      {p.status === 'active' && p.scan_status === 'pending' && (
        <Notice tone="info" icon={ScanFace} title="Procurando esta pessoa no acervo publicado…"
                description="A busca percorre todos os eventos publicados. As fotos novas são comparadas sozinhas quando publicadas." />
      )}
      {p.status === 'revoked' && (
        <Notice tone="info" icon={ShieldOff} title={`Autorização revogada em ${formatDateTime(p.revoked_at!)}${p.revoked_by === 'holder' ? ', pela própria pessoa' : ', pela administração'}`}
                description="As fotografias de referência, o vetor facial e todas as marcações foram eliminados. O termo assinado fica guardado como prova." />
      )}

      <Card padding={24} style={{ gap: 16 }}>
        <SectionTitle title="Dados" />
        <View style={styles.grid}>
          <InfoItem label="Nome completo" value={p.full_name} style={styles.cell} />
          <InfoItem label="Cargo ou função" value={p.position} style={styles.cell} />
          <InfoItem label="Unidade ou curso" value={p.unit ?? '—'} style={styles.cell} />
          <InfoItem label="E-mail" value={p.email} style={styles.cell} />
          <InfoItem label="Cadastrada em" value={formatDateTime(p.created_at)} style={styles.cell} />
          {p.status === 'active' && (
            <InfoItem label="Fotos localizadas" value={`${p.marks.confirmed} confirmadas · ${p.marks.pending} a confirmar · ${p.marks.rejected} rejeitadas`} style={styles.cell} />)}
        </View>
      </Card>

      {p.photos.length > 0 && (
        <Card padding={24} style={{ gap: 14 }}>
          <SectionTitle title="Fotografias de referência" />
          <View style={styles.photos}>
            {p.photos.map((ph) => (
              <View key={ph.id} style={{ gap: 6 }}>
                <Image source={{ uri: personPhotoUrl(p.id, ph.id) }} style={styles.photo} contentFit="cover" />
                {ph.faces_found !== null && (
                  <Text style={[styles.small, ph.faces_found === 0 && { color: panel.danger }]}>
                    {ph.faces_found === 0 ? 'Nenhum rosto encontrado' : 'Rosto encontrado'}</Text>)}
              </View>
            ))}
          </View>
        </Card>
      )}

      {p.signed && (
        <Card padding={24} style={{ gap: 14 }}>
          <SectionTitle title="Assinatura eletrônica" />
          <View style={styles.signature}>
            <Image source={{ uri: signatureUrl(p.id) }} style={styles.signatureImg} contentFit="contain"
                   accessibilityLabel={`Assinatura de ${p.full_name}`} />
            <View style={styles.signatureLine} />
            <Text style={styles.value}>{p.full_name}</Text>
          </View>
          <View style={styles.grid}>
            <InfoItem label="Assinado em" value={formatDateTime(p.authorized_at!)} style={styles.cell} />
            <InfoItem label="Versão do termo" value={p.term_version ?? '—'} style={styles.cell} />
            <InfoItem label="Endereço de rede (IP)" value={p.authorized_ip ?? '—'} style={styles.cell} />
          </View>
          <InfoItem label="Código de verificação (SHA-256)" value={p.document_sha256 ?? '—'} />
          <Text style={styles.small}>
            Assinatura feita na tela pela própria pessoa, a partir do link de uso único enviado ao e-mail institucional. O código de
            verificação muda se qualquer palavra do termo, foto de referência ou traço da assinatura for alterado.
          </Text>
        </Card>
      )}

      <View style={styles.actions}>
        {p.status === 'awaiting' && <Button variant="danger" icon={Trash2} label="Excluir cadastro" onPress={() => setConfirm('delete')} />}
        {p.status === 'active' && (
          <>
            <Button variant="secondary" icon={RefreshCw} label="Procurar de novo no acervo"
                    onPress={() => run(() => rescan(p.id), 'A busca no acervo vai ser refeita.')} />
            <Button variant="danger" icon={ShieldOff} label="Encerrar autorização" onPress={() => setConfirm('end')} />
          </>
        )}
      </View>

      <Modal visible={confirm === 'end'} onClose={() => setConfirm(null)} icon={ShieldOff} tone="danger" title="Encerrar a autorização?" width={520}>
        <Text style={styles.text}>
          Use na revisão anual ou quando a pessoa deixar a função. As fotografias de referência, o vetor facial e todas as marcações
          são eliminados na hora, sem volta. O termo assinado fica guardado como prova.
        </Text>
        <View style={styles.actions}>
          <Button variant="secondary" label="Cancelar" onPress={() => setConfirm(null)} />
          <Button variant="danger" label="Encerrar autorização" loading={busy}
                  onPress={() => run(() => endAuthorization(p.id), 'Autorização encerrada; dados biométricos eliminados.')} />
        </View>
      </Modal>
      <Modal visible={confirm === 'delete'} onClose={() => setConfirm(null)} icon={Trash2} tone="danger" title="Excluir o cadastro?" width={520}>
        <Text style={styles.text}>A pessoa ainda não assinou: o cadastro e as fotos são apagados e o link deixa de funcionar.</Text>
        <View style={styles.actions}>
          <Button variant="secondary" label="Cancelar" onPress={() => setConfirm(null)} />
          <Button variant="danger" label="Excluir cadastro" loading={busy}
                  onPress={() => run(() => deletePerson(p.id), 'Cadastro excluído.').then(() => router.replace('/pessoas-institucionais/cadastro'))} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  cell: { flexBasis: 220, flexGrow: 1 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photo: { width: 120, height: 150, borderRadius: 10, backgroundColor: panel.page },
  signature: { alignSelf: 'flex-start', gap: 6, paddingVertical: 8 },
  signatureImg: { width: 320, height: 107 },
  signatureLine: { height: 1, backgroundColor: panel.text, width: 320 },
  value: { fontFamily: fonts.regular, fontSize: 14, color: panel.text },
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: panel.muted },
  small: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: panel.muted },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
  // TEMPORÁRIO — remover junto com o link de demonstração.
  devBox: { gap: 10, padding: 14, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: panel.warning, backgroundColor: panel.warningSoft },
  devTag: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, color: panel.warning },
  devLink: { fontFamily: fonts.regular, fontSize: 13, color: panel.text, backgroundColor: '#FFFFFF', padding: 10, borderRadius: 8 },
});
