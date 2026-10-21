import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { useAuth, type Account } from '@/auth/AuthContext';
import { AuthCard } from '@/components/auth/AuthCard';
import { NewPasswordForm } from '@/components/auth/NewPasswordForm';
import { useLinkInfo } from '@/components/auth/useLinkCheck';
import { PrimaryButton } from '@/components/ui/Button';
import { Feedback } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';
import { colors, fonts } from '@/theme/tokens';

type LinkInfo = { valid: boolean; needs_identity: boolean; full_name: string | null };

/** Same check digits the server verifies (RF031): catches a typo before sending. */
function validCpf(value: string): boolean {
  const d = value.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (const size of [9, 10]) {
    const sum = [...d.slice(0, size)].reduce((acc, n, i) => acc + Number(n) * (size + 1 - i), 0);
    if (((sum * 10) % 11) % 10 !== Number(d[size])) return false;
  }
  return true;
}

/** "dd/mm/aaaa" → "aaaa-mm-dd", or null when it is not a real past date. */
function isoDate(value: string): string | null {
  const m = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime()) || date.getDate() !== Number(m[1]) || date > new Date() || Number(m[3]) < 1900) return null;
  return iso;
}

const maskCpf = (v: string) => v.replace(/\D/g, '').slice(0, 11)
  .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const maskDate = (v: string) => v.replace(/\D/g, '').slice(0, 8).replace(/(\d{2})(\d)/, '$1/$2').replace(/(\d{2})(\d)/, '$1/$2');

/**
 * Figma: "Primeiro acesso obrigatório" + "— sucesso".
 *
 * DIVERGES FROM FIGMA ON PURPOSE: the design has a "Senha atual (senha provisória)" field,
 * from requirements v1.4. Version 1.6 replaced the provisional password with a single-use
 * e-mail link (RF001 note 5: the system never assigns a password). So the screen is opened
 * by that link and has no "current password" field. The rest of the layout is the design's.
 *
 * v2.0 (RF031 note 6): the hired photographer also informs CPF and birth date here, before the
 * password — the temporary account only works with them, and its 24 hours start now.
 */
export default function FirstAccessScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { setAccount } = useAuth();
  const { state: link, info } = useLinkInfo<LinkInfo>('/auth/first-access/check', token);
  const [activated, setActivated] = useState<Account | null>(null);
  const [cpf, setCpf] = useState('');
  const [birth, setBirth] = useState('');
  const [errors, setErrors] = useState<{ cpf?: string; birth?: string }>({});
  const identity = !!info?.needs_identity;

  if (activated) {
    const until = activated.valid_until
      ? new Date(activated.valid_until).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;
    return (
      <AuthCard success title="Nova senha criada"
                subtitle={until
                  ? `Sua conta temporária está ativa até ${until}. Envie as fotos da cobertura ao evento indicado no painel.`
                  : 'Seu primeiro acesso foi concluído. Agora você já pode usar os recursos do FOTOMAC com segurança.'}>
        <Feedback tone="success" message="Sua conta está pronta para continuar." />
        <PrimaryButton
          label="Continuar para o painel"
          onPress={() => {
            setAccount(activated); // the API already opened the session (HttpOnly cookie)
            router.replace('/painel');
          }}
        />
      </AuthCard>
    );
  }

  async function submit(password: string, password_confirmation: string) {
    let body: Record<string, string | undefined> = { token, password, password_confirmation };
    if (identity) {
      const e = { cpf: validCpf(cpf) ? undefined : 'Informe um CPF válido.', birth: isoDate(birth) ? undefined : 'Informe a data no formato dd/mm/aaaa.' };
      setErrors(e);
      if (e.cpf || e.birth) throw new Error('Revise o CPF e a data de nascimento.');
      body = { ...body, cpf, birth_date: isoDate(birth)! };
    }
    setActivated(await api<Account>('/auth/first-access', { body }));
  }

  return (
    <AuthCard width={520} title="Crie sua senha"
              subtitle="Para ativar sua conta, defina a senha pessoal que você usará para acessar o FOTOMAC.">
      {link === 'checking' && <ActivityIndicator color={colors.primary} />}
      {link === 'invalid' && (
        <Feedback tone="error"
                  message="Este link de ativação é inválido, já foi usado ou expirou. Peça ao administrador do FOTOMAC um novo link." />
      )}
      {link === 'valid' && (
        <NewPasswordForm
          submitLabel="Salvar nova senha"
          notice={identity
            ? 'Conta temporária de fotógrafo contratado: ela vale 24 horas a partir de agora e só envia fotos ao evento da sua contratação.'
            : 'Esta etapa é obrigatória. Você terá acesso ao painel após salvar sua senha.'}
          extra={identity ? (
            <View style={styles.identity}>
              <Text style={styles.title}>Sua identificação</Text>
              <Text style={styles.text}>
                Confira o seu nome: <Text style={styles.name}>{info?.full_name}</Text>. O CPF e a data de nascimento identificam
                quem responde pelas fotos enviadas, conforme o seu contrato com o CESMAC (LGPD, Art. 7º, V). São guardados
                criptografados, só a administração vê o CPF mascarado, e são apagados depois que as suas fotos saem do acervo
                e termina o prazo de guarda.
              </Text>
              <TextField label="CPF" value={cpf} onChangeText={(t) => { setCpf(maskCpf(t)); setErrors((x) => ({ ...x, cpf: undefined })); }}
                         placeholder="000.000.000-00" keyboardType="number-pad" error={errors.cpf} />
              <TextField label="Data de nascimento" value={birth}
                         onChangeText={(t) => { setBirth(maskDate(t)); setErrors((x) => ({ ...x, birth: undefined })); }}
                         placeholder="dd/mm/aaaa" keyboardType="number-pad" error={errors.birth} />
            </View>
          ) : undefined}
          onSubmit={submit}
        />
      )}
    </AuthCard>
  );
}

const styles = StyleSheet.create({
  identity: { gap: 12 },
  title: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.text },
  text: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  name: { fontFamily: fonts.semiBold, color: colors.text },
});
