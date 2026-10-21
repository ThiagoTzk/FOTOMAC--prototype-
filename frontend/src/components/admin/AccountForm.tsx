import { Clock, TriangleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AccountInput, Role } from '@/api/accounts';
import { listEvents } from '@/api/events';
import { Select } from '@/components/panel/Select';
import { Button, Field, Input, Notice } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

const ROLES: { value: Role; label: string }[] = [
  { value: 'photographer', label: 'Fotógrafo' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'contractor', label: 'Fotógrafo contratado (conta temporária)' },
  { value: 'admin', label: 'Administrador' },
];
/** Profiles that send photos and therefore sign them (credit, RF001 note 4). */
const AUTHORS: Role[] = ['photographer', 'marketing', 'contractor'];
const DOMAIN = 'cesmac.edu.br';

type Props = {
  initial?: { full_name: string; email: string; role: Role; photographer_signature: string | null };
  /** Edit mode: the e-mail is the login identifier and is not changed here. */
  editing?: boolean;
  roleLocked?: boolean;
  /** Why the role cannot be changed (own account, or a temporary account — RF001 note 3). */
  roleLockedReason?: string;
  submitLabel: string;
  onSubmit: (data: AccountInput) => Promise<void>;
};

/** Fields of RF001 with the same rules the server applies (it re-checks everything). */
export function AccountForm({ initial, editing, roleLocked, roleLockedReason, submitLabel, onSubmit }: Props) {
  const [name, setName] = useState(initial?.full_name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [role, setRole] = useState<Role>(initial?.role ?? 'photographer');
  const [signature, setSignature] = useState(initial?.photographer_signature ?? '');
  const [eventId, setEventId] = useState<string | null>(null);
  const [contract, setContract] = useState('');
  const [events, setEvents] = useState<{ value: string; label: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const author = AUTHORS.includes(role);
  const contractor = role === 'contractor' && !editing;
  // Whoever works for the CESMAC has an institutional e-mail (subdomains included); only the hired
  // photographer may use a personal one (decision of 17/10/2026). The server checks it again.
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  const institutional = domain === DOMAIN || domain.endsWith(`.${DOMAIN}`);

  // The events a hired photographer can be bound to (not expired). Loaded only when needed.
  useEffect(() => {
    if (!contractor || events.length) return;
    (async () => {
      const out: { value: string; label: string }[] = [];
      for (let page = 1; page <= 10; page++) {
        const r = await listEvents({ page });
        r.items.filter((e) => e.status !== 'expired').forEach((e) => out.push({ value: e.id, label: `${e.name} · ${e.date_label}` }));
        if (page * r.page_size >= r.total) break;
      }
      setEvents(out);
    })().catch(() => setServerError('Não foi possível carregar os eventos.'));
  }, [contractor, events.length]);

  async function submit() {
    const e: Record<string, string> = {};
    if (name.trim().split(/\s+/).length < 2) e.name = 'Informe o nome completo (nome e sobrenome).';
    if (!editing && (!email.includes('@') || email.trim().length > 100)) e.email = 'Informe um e-mail válido, com até 100 caracteres.';
    else if (!editing && role !== 'contractor' && !institutional) e.email = `Use o e-mail institucional (@${DOMAIN}). E-mail pessoal só para fotógrafo contratado.`;
    if (author && !signature.trim()) e.signature = 'A assinatura é obrigatória para quem envia fotos (é o crédito nas fotos).';
    if (contractor && !eventId) e.event = 'Escolha o evento para o qual o fotógrafo foi contratado.';
    if (contractor && !contract.trim()) e.contract = 'Informe o número do contrato de prestação de serviço.';
    setErrors(e);
    setServerError(null);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await onSubmit({ full_name: name, email: editing ? undefined : email.trim(), role,
                       photographer_signature: author ? signature : signature || null,
                       ...(contractor ? { bound_event_id: eventId, contract_number: contract.trim() } : {}) });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  const clear = (key: string) => setErrors((x) => ({ ...x, [key]: '' }));
  return (
    <View style={{ gap: 16 }}>
      {serverError && <Notice tone="danger" icon={TriangleAlert} title={serverError} />}
      <Field label="Nome completo *" error={errors.name} help="Aparece nos registros das operações feitas pela conta.">
        <Input value={name} onChangeText={(t) => { setName(t); clear('name'); }} maxLength={120}
               invalid={!!errors.name} accessibilityLabel="Nome completo" />
      </Field>
      <View style={{ zIndex: 20 }}>
        <Field label="Perfil de acesso *" help={roleLocked ? roleLockedReason ?? 'O perfil desta conta não pode ser alterado.' : 'A mudança de perfil fica registrada.'}>
          {roleLocked ? <Input value={ROLES.find((r) => r.value === role)!.label} readOnly accessibilityLabel="Perfil de acesso" />
            : <Select placeholder="Perfil" options={editing ? ROLES.filter((r) => r.value !== 'contractor') : ROLES} value={role}
                      onChange={(v: Role | null) => v && setRole(v)} accessibilityLabel="Perfil de acesso" />}
        </Field>
      </View>
      <Field label={role === 'contractor' ? 'E-mail *' : 'E-mail institucional *'} error={errors.email}
             help={editing ? 'É o identificador de acesso e não é alterado aqui.'
               : role === 'contractor' ? 'O fotógrafo contratado não tem e-mail do CESMAC: use o e-mail dele. É para lá que vai o link de acesso.'
                 : `É o login da conta. Obrigatoriamente do domínio @${DOMAIN} (ou um subdomínio, como @academico.${DOMAIN}).`}>
        <Input value={email} onChangeText={(t) => { setEmail(t); clear('email'); }} readOnly={editing}
               inputMode="email" autoCapitalize="none" maxLength={100} invalid={!!errors.email} accessibilityLabel="E-mail" />
      </Field>
      {contractor && (
        <>
          <Notice tone="info" icon={Clock} title="Conta temporária (RF031)"
                  description="Vale 24 horas a partir do momento em que o fotógrafo definir a senha e só envia fotos ao evento escolhido. No primeiro acesso ele informa CPF e data de nascimento (guardados criptografados). As fotos dele só podem ser publicadas depois da sua aprovação. Ao vencer, a conta é desativada — nunca apagada." />
          <View style={{ zIndex: 10 }}>
            <Field label="Evento da cobertura *" error={errors.event}>
              <Select placeholder={events.length ? 'Selecione o evento' : 'Carregando eventos…'} options={events} value={eventId}
                      onChange={(v: string | null) => { setEventId(v); clear('event'); }} accessibilityLabel="Evento da cobertura" />
            </Field>
          </View>
          <Field label="Número do contrato *" error={errors.contract}
                 help="Liga a conta ao contrato de prestação de serviço, que guarda os demais dados do fotógrafo.">
            <Input value={contract} onChangeText={(t) => { setContract(t); clear('contract'); }} maxLength={60}
                   invalid={!!errors.contract} accessibilityLabel="Número do contrato" />
          </Field>
        </>
      )}
      <Field label={author ? 'Assinatura (crédito nas fotos) *' : 'Assinatura (opcional)'} error={errors.signature}
             help="Nome profissional exibido como crédito nas fotos. O próprio titular pode alterar depois.">
        <Input value={signature} onChangeText={(t) => { setSignature(t); clear('signature'); }} maxLength={80}
               invalid={!!errors.signature} accessibilityLabel="Assinatura" />
      </Field>
      {author && !!signature.trim() && (
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
