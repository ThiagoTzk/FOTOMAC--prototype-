import { KeyRound, TriangleAlert, CircleCheck } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api, ApiError } from '@/api/client';
import { useAuth, type Account } from '@/auth/AuthContext';
import { failedRules, type PasswordRuleKey } from '@/auth/password-rules';
import { PasswordRequirements } from '@/components/auth/PasswordRequirements';
import { PageHeader } from '@/components/panel/PageHeader';
import { initials } from '@/components/panel/Shell';
import { Button, Card, Field, Input, Notice, Pill, SectionTitle } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

function ChangePassword({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [failed, setFailed] = useState<PasswordRuleKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const rules = failedRules(password);
    setFailed(rules);
    setError(null);
    if (!current) return setError('Informe sua senha atual.');
    if (rules.length) return setError('A nova senha ainda não atende aos requisitos.');
    if (password !== confirmation) return setError('As senhas não coincidem.');
    setSaving(true);
    try {
      await api('/auth/password/change', { body: { current_password: current, password, password_confirmation: confirmation } });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível alterar a senha.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      <Field label="Senha atual"><Input secureTextEntry value={current} onChangeText={setCurrent} autoComplete="current-password" accessibilityLabel="Senha atual" /></Field>
      <Field label="Nova senha"><Input secureTextEntry value={password} onChangeText={setPassword} autoComplete="new-password" accessibilityLabel="Nova senha" /></Field>
      <Field label="Confirmar nova senha"><Input secureTextEntry value={confirmation} onChangeText={setConfirmation} autoComplete="new-password" accessibilityLabel="Confirmar nova senha" /></Field>
      <PasswordRequirements failed={failed} />
      <Text style={styles.help}>Ao alterar a senha, as sessões abertas em outros dispositivos são encerradas.</Text>
      <View style={styles.actions}><Button label="Salvar nova senha" onPress={submit} loading={saving} /></View>
    </View>
  );
}

/**
 * Figma "19 — Meu perfil", adapted to v1.6: no profile photo (initials), name/e-mail/role are
 * read-only (set by the administrator), and the signature keeps only the professional name —
 * the institution is added automatically to the credit (RF001 note 4, RF018 note 3).
 */
export default function ProfileScreen() {
  const { account, setAccount } = useAuth();
  const [signature, setSignature] = useState(account?.photographer_signature ?? '');
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);

  if (!account) return null;
  const photographer = account.role === 'photographer';
  const role = photographer ? 'Fotógrafo' : 'Administrador';

  async function save() {
    setError(null); setSaved(null); setSaving(true);
    try {
      setAccount(await api<Account>('/auth/me', { method: 'PATCH', body: { photographer_signature: signature } }));
      setSaved('Assinatura atualizada.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Meu perfil" subtitle="Gerencie seus dados de conta e sua assinatura fotográfica." />
      <View style={styles.layout}>
        <Card padding={24} style={styles.side}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials(account.full_name)}</Text></View>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Text style={styles.name}>{account.full_name}</Text>
            <Pill label={role} />
          </View>
        </Card>
        <View style={{ flex: 1, minWidth: 300, gap: 18 }}>
          <Card padding={24} style={{ gap: 18 }}>
            <SectionTitle title="Informações pessoais" />
            {saved && <Notice tone="success" icon={CircleCheck} title={saved} />}
            {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
            <Field label="Nome"><Input value={account.full_name} readOnly accessibilityLabel="Nome" /></Field>
            <Field label="E-mail institucional"><Input value={account.email} readOnly accessibilityLabel="E-mail institucional" /></Field>
            <Field label="Perfil" help="O papel da conta é definido pela instituição e não pode ser editado.">
              <Input value={role} readOnly accessibilityLabel="Perfil" />
            </Field>
            {photographer && (
              <>
                <Field label="Assinatura / crédito fotográfico"
                       help={`Como aparecerá nas fotos e nos metadados: “Fotografia por: ${signature.trim() || '…'} — Centro Universitário CESMAC”.`}>
                  <Input value={signature} onChangeText={setSignature} maxLength={80} accessibilityLabel="Assinatura" />
                </Field>
                <View style={styles.actions}>
                  <Button variant="secondary" label="Cancelar" onPress={() => setSignature(account.photographer_signature ?? '')} />
                  <Button label="Salvar alterações" onPress={save} loading={saving}
                          disabled={signature.trim() === (account.photographer_signature ?? '')} />
                </View>
              </>
            )}
          </Card>
          <Card padding={24}>
            <SectionTitle title="Senha e segurança" />
            {changing ? (
              <ChangePassword onDone={() => { setChanging(false); setSaved('Senha alterada. Outros dispositivos foram desconectados.'); }} />
            ) : (
              <>
                <Text style={styles.help}>Atualize sua senha do FOTOMAC periodicamente para manter sua conta segura.</Text>
                <View style={{ alignSelf: 'flex-start' }}>
                  <Button variant="secondary" icon={KeyRound} label="Alterar senha" onPress={() => setChanging(true)} />
                </View>
              </>
            )}
          </Card>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  layout: { flexDirection: 'row', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' },
  side: { width: 330, maxWidth: '100%', alignItems: 'center', gap: 16 },
  avatar: { width: 96, height: 96, borderRadius: 999, backgroundColor: panel.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.bold, fontSize: 32, color: panel.primaryText },
  name: { fontFamily: fonts.bold, fontSize: 18, color: panel.text, textAlign: 'center' },
  help: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: panel.muted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
});
