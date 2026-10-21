import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { failedRules, type PasswordRuleKey } from '@/auth/password-rules';
import { PasswordRequirements } from '@/components/auth/PasswordRequirements';
import { PrimaryButton } from '@/components/ui/Button';
import { Feedback } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';

type Props = {
  submitLabel: string;
  /** Sends the new password to the API; throws ApiError when the server refuses it. */
  onSubmit: (password: string, confirmation: string) => Promise<void>;
  /** The first-access screen shows an info box above the fields. */
  notice?: string;
  /** Fields shown before the password (the hired photographer's identification, RF031). */
  extra?: ReactNode;
};

/** Shared by "Redefinição de senha" and "Primeiro acesso" — same fields, same rules. */
export function NewPasswordForm({ submitLabel, onSubmit, notice, extra }: Props) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [failed, setFailed] = useState<PasswordRuleKey[] | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const rules = failedRules(password);
    const differs = password !== confirmation || confirmation === '';
    setFailed(rules);
    setMismatch(differs);
    setServerError(null);
    if (rules.length > 0 || differs) return;

    setLoading(true);
    try {
      await onSubmit(password, confirmation);
    } catch (err) {
      const detail = err instanceof ApiError ? (err.detail as { failed_rules?: PasswordRuleKey[] }) : undefined;
      if (detail?.failed_rules) setFailed(detail.failed_rules);
      setServerError(err instanceof Error ? err.message : 'Algo deu errado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const invalid = (failed?.length ?? 0) > 0 || mismatch;
  return (
    <View style={styles.form}>
      {notice && <Feedback tone="info" message={notice} />}
      {serverError ? (
        <Feedback tone="error" message={serverError} />
      ) : (
        invalid && <Feedback tone="error" message="Revise os campos destacados antes de continuar." />
      )}
      {extra}
      <TextField
        label="Nova senha"
        value={password}
        onChangeText={setPassword}
        placeholder="Crie uma nova senha"
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        error={failed?.length ? 'A nova senha ainda não atende aos requisitos.' : undefined}
      />
      <TextField
        label="Confirmar nova senha"
        value={confirmation}
        onChangeText={setConfirmation}
        placeholder="Digite novamente a nova senha"
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={submit}
        error={mismatch ? 'As senhas não coincidem.' : undefined}
      />
      <PasswordRequirements failed={failed} />
      <PrimaryButton label={submitLabel} onPress={submit} loading={loading} />
    </View>
  );
}

const styles = StyleSheet.create({ form: { gap: 16, width: '100%' } });
