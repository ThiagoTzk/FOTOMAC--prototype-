import { TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AccountInput, Role } from '@/api/accounts';
import { Select } from '@/components/panel/Select';
import { Button, Field, Input, Notice } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

const ROLES: { value: Role; label: string }[] = [
  { value: 'photographer', label: 'Fotógrafo' },
  { value: 'admin', label: 'Administrador' },
];
const DOMAIN = 'cesmac.edu.br';

type Props = {
  initial?: { full_name: string; email: string; role: Role; photographer_signature: string | null };
  /** Edit mode: the e-mail is the login identifier and is not changed here. */
  editing?: boolean;
  roleLocked?: boolean;
  submitLabel: string;
  onSubmit: (data: AccountInput) => Promise<void>;
};

/** Fields of RF001 with the same rules the server applies (it re-checks everything). */
export function AccountForm({ initial, editing, roleLocked, submitLabel, onSubmit }: Props) {
  const [name, setName] = useState(initial?.full_name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [role, setRole] = useState<Role>(initial?.role ?? 'photographer');
  const [signature, setSignature] = useState(initial?.photographer_signature ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const photographer = role === 'photographer';
  const outsideDomain = !editing && email.includes('@') && !email.trim().toLowerCase().endsWith(DOMAIN);

  async function submit() {
    const e: Record<string, string> = {};
    if (name.trim().split(/\s+/).length < 2) e.name = 'Informe o nome completo (nome e sobrenome).';
    if (!editing && (!email.includes('@') || email.trim().length > 100)) e.email = 'Informe um e-mail válido, com até 100 caracteres.';
    if (photographer && !signature.trim()) e.signature = 'A assinatura é obrigatória para o perfil Fotógrafo.';
    setErrors(e);
    setServerError(null);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await onSubmit({ full_name: name, email: editing ? undefined : email.trim(), role,
                       photographer_signature: photographer ? signature : signature || null });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      {serverError && <Notice tone="danger" icon={TriangleAlert} title={serverError} />}
      <Field label="Nome completo *" error={errors.name} help="Aparece nos registros das operações feitas pela conta.">
        <Input value={name} onChangeText={(t) => { setName(t); setErrors((x) => ({ ...x, name: '' })); }} maxLength={120}
               invalid={!!errors.name} accessibilityLabel="Nome completo" />
      </Field>
      <Field label="E-mail institucional *" error={errors.email}
             help={editing ? 'É o identificador de acesso e não é alterado aqui.' : `É o login da conta. De preferência, do domínio @${DOMAIN}.`}>
        <Input value={email} onChangeText={(t) => { setEmail(t); setErrors((x) => ({ ...x, email: '' })); }} readOnly={editing}
               inputMode="email" autoCapitalize="none" maxLength={100} invalid={!!errors.email} accessibilityLabel="E-mail institucional" />
      </Field>
      {outsideDomain && (
        <Notice tone="warning" icon={TriangleAlert} title={`Este e-mail não é do domínio @${DOMAIN}`}
                description="É permitido, mas o requisito recomenda o e-mail institucional (RF001 nota 2)." />
      )}
      <View style={{ zIndex: 10 }}>
        <Field label="Perfil de acesso *" help={roleLocked ? 'Você não pode alterar o seu próprio perfil.' : 'A mudança de perfil fica registrada.'}>
          {roleLocked ? <Input value={ROLES.find((r) => r.value === role)!.label} readOnly accessibilityLabel="Perfil de acesso" />
            : <Select placeholder="Perfil" options={ROLES} value={role} onChange={(v: Role | null) => v && setRole(v)} accessibilityLabel="Perfil de acesso" />}
        </Field>
      </View>
      <Field label={photographer ? 'Assinatura do fotógrafo *' : 'Assinatura do fotógrafo (opcional)'} error={errors.signature}
             help="Nome profissional exibido como crédito nas fotos. O próprio fotógrafo pode alterar depois.">
        <Input value={signature} onChangeText={(t) => { setSignature(t); setErrors((x) => ({ ...x, signature: '' })); }} maxLength={80}
               invalid={!!errors.signature} accessibilityLabel="Assinatura do fotógrafo" />
      </Field>
      {photographer && !!signature.trim() && (
        <Text style={styles.preview}>Crédito nas fotos: Fotografia por: {signature.trim()} — Centro Universitário CESMAC</Text>
      )}
      <View style={styles.actions}><Button label={submitLabel} onPress={submit} loading={saving} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { fontFamily: fonts.regular, fontSize: 13, color: panel.primaryText, backgroundColor: panel.primarySoft, padding: 12,
             borderRadius: panel.radius },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
