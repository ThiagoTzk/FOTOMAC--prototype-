import { useLocalSearchParams } from 'expo-router';
import { Ban, CircleCheck, Copy, Link2, Lock, LockOpen, Mail, PauseCircle, PlayCircle, TriangleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import {
  changeStatus, devActivationLink, getAccount, resendLink, unlockAccount, updateAccount, type AccountDetail, type AccountStatus,
} from '@/api/accounts';
import { AccountForm } from '@/components/admin/AccountForm';
import { AccountStatusPill } from '@/components/admin/AccountPills';
import { Modal } from '@/components/panel/Modal';
import { PageHeader } from '@/components/panel/PageHeader';
import { Button, Card, Notice, SectionTitle } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

type Change = { target: AccountStatus; verb: string; title: string };

const CHANGES: Record<AccountStatus, Change[]> = {
  pending: [{ target: 'inactive', verb: 'Inativar', title: 'Inativar conta?' }, { target: 'suspended', verb: 'Suspender', title: 'Suspender conta?' }],
  active: [{ target: 'inactive', verb: 'Inativar', title: 'Inativar conta?' }, { target: 'suspended', verb: 'Suspender', title: 'Suspender conta?' }],
  inactive: [{ target: 'active', verb: 'Reativar', title: 'Reativar conta?' }, { target: 'suspended', verb: 'Suspender', title: 'Suspender conta?' }],
  suspended: [{ target: 'active', verb: 'Reativar', title: 'Reativar conta?' }, { target: 'inactive', verb: 'Inativar', title: 'Inativar conta?' }],
};

/** One account: its data (RF001), situation (RF003), password link and lock (RF002 note 7). */
export default function AccountScreen() {
  const { id, criada } = useLocalSearchParams<{ id: string; criada?: string }>();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(criada ? 'Conta criada. O link para definir a senha foi enviado ao e-mail do titular.' : null);
  const [confirm, setConfirm] = useState<Change | null>(null);
  const [busy, setBusy] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null); // TEMPORÁRIO — remover antes da implantação

  useEffect(() => { getAccount(id).then(setAccount).catch((e) => setError(e.message)); }, [id]);

  async function run(action: () => Promise<AccountDetail | void>, message: string) {
    setBusy(true); setError(null); setDone(null);
    try {
      const r = await action();
      setAccount(r ?? await getAccount(id));
      setDone(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  if (!account) return error ? <Notice tone="danger" icon={TriangleAlert} title={error} /> : null;
  const a = account;

  return (
    <View style={{ gap: 24, maxWidth: 900 }}>
      <PageHeader crumbs={[{ label: 'Contas', href: '/contas' }, { label: a.full_name }]} title={a.full_name}
                  badge={<AccountStatusPill status={a.status} label={a.status_label} />}
                  subtitle={`${a.role_label} · ${a.email}`} />
      {done && <Notice tone="success" icon={CircleCheck} title={done} />}
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}

      <Card padding={24}>
        <SectionTitle title="Acesso" />
        {a.status === 'pending' && (
          <Notice tone={a.activation_link === 'expired' ? 'warning' : 'info'} icon={Mail}
                  title={a.activation_link === 'expired' ? 'O link para definir a senha venceu' : 'Aguardando o titular definir a senha'}
                  description="A conta só passa a “Ativa” quando o titular define a senha pelo link de uso único (válido por 24 horas). Reenviar invalida o link anterior."
                  actionLabel="Reenviar link" onAction={() => run(() => resendLink(a.id), 'Novo link enviado ao e-mail do titular.')} />
        )}
        {/* TEMPORÁRIO — REMOVER ANTES DA IMPLANTAÇÃO: link à mostra só para demonstração, e só em desenvolvimento
            (o servidor não atende em produção, onde o link vai apenas ao e-mail do titular — RF001 nota 5). */}
        {a.status === 'pending' && a.dev_link_available && (
          <View style={styles.devBox}>
            <Text style={styles.devTag}>SÓ DEMONSTRAÇÃO · REMOVER ANTES DA IMPLANTAÇÃO</Text>
            <Text style={styles.text}>
              Gera um link novo (o anterior para de funcionar) e mostra aqui, para abrir numa janela anônima.
            </Text>
            <View style={styles.actions}>
              <Button label="Mostrar link" variant="secondary" icon={Link2} loading={busy}
                      onPress={() => {
                        setError(null);
                        devActivationLink(a.id).then((r) => setDevLink(r.url))
                          .catch((e) => setError(e instanceof Error ? e.message : 'Não foi possível gerar o link.'));
                      }} />
              {devLink && Platform.OS === 'web' && (
                <Button label="Copiar" variant="secondary" icon={Copy}
                        onPress={() => { void navigator.clipboard?.writeText(devLink); setDone('Link copiado.'); }} />
              )}
            </View>
            {devLink && <Text selectable style={styles.devLink}>{devLink}</Text>}
          </View>
        )}
        {/* FIM DO TRECHO TEMPORÁRIO */}
        {a.locked && (
          <Notice tone="danger" icon={Lock} title="Bloqueada após 5 tentativas de senha sem sucesso"
                  description="O bloqueio dura 15 minutos e também é desfeito pela recuperação de senha."
                  actionLabel="Desbloquear" onAction={() => run(() => unlockAccount(a.id), 'Conta desbloqueada.')} />
        )}
        {a.is_me ? (
          <Text style={styles.text}>Esta é a sua conta. A situação dela só pode ser alterada por outro administrador.</Text>
        ) : (
          <>
            <Text style={styles.text}>
              Situação atual: <Text style={{ fontFamily: fonts.bold }}>{a.status_label}</Text>. Toda mudança é registrada com
              o seu nome e comunicada ao titular por e-mail. Contas nunca são excluídas, para preservar o histórico.
            </Text>
            <View style={styles.actions}>
              {CHANGES[a.status].map((c) => (
                <Button key={c.target} label={c.verb} variant={c.target === 'suspended' ? 'danger' : 'secondary'}
                        icon={c.target === 'active' ? PlayCircle : c.target === 'inactive' ? PauseCircle : Ban}
                        onPress={() => setConfirm(c)} />
              ))}
            </View>
          </>
        )}
      </Card>

      <Card padding={24}>
        <SectionTitle title="Dados da conta" />
        <AccountForm key={a.id + a.role} editing roleLocked={a.is_me} initial={a} submitLabel="Salvar alterações"
                     onSubmit={(data) => run(() => updateAccount(a.id, data), 'Alterações salvas.')} />
      </Card>

      <Modal visible={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ''}
             icon={confirm?.target === 'active' ? LockOpen : Ban} tone={confirm?.target === 'active' ? 'primary' : 'danger'}>
        {confirm && (
          <View style={{ gap: 16 }}>
            {/* RF003 note 1: explicit confirmation, with the consequences spelled out. */}
            <Text style={styles.text}>
              {confirm.target === 'active'
                ? `${a.full_name} voltará a poder entrar no sistema. Se ainda não tiver definido a senha, receberá um novo link para defini-la.`
                : `${a.full_name} deixa de poder entrar no sistema agora mesmo, em todos os dispositivos.`}
            </Text>
            {confirm.target !== 'active' && a.owned_events > 0 && (
              <Text style={styles.text}>
                Os {a.owned_events} {a.owned_events === 1 ? 'evento' : 'eventos'} desta conta e todas as fotos continuam no acervo, com o
                crédito. Enquanto isso, o administrador passa a responder por eles (edição, colaboração, publicação e pacote).
              </Text>
            )}
            <Text style={styles.text}>O titular será avisado por e-mail e a mudança fica registrada.</Text>
            <View style={styles.actions}>
              <Button variant="secondary" label="Cancelar" onPress={() => setConfirm(null)} />
              <Button variant={confirm.target === 'active' ? 'primary' : 'danger'} label={`Confirmar: ${confirm.verb.toLowerCase()}`}
                      loading={busy} onPress={() => run(() => changeStatus(a.id, confirm.target), `Situação alterada para “${
                        confirm.target === 'active' ? 'Ativa' : confirm.target === 'inactive' ? 'Inativa' : 'Suspensa'}”.`)} />
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: panel.muted },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
  // TEMPORÁRIO — remover junto com o link de demonstração.
  devBox: { gap: 10, padding: 14, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: panel.warning, backgroundColor: panel.warningSoft },
  devTag: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, color: panel.warning },
  devLink: { fontFamily: fonts.regular, fontSize: 13, color: panel.text, backgroundColor: '#FFFFFF', padding: 10, borderRadius: 8 },
});
