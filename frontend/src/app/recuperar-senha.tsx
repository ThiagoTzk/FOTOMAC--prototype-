import { Redirect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { AuthCard } from '@/components/auth/AuthCard';
import { AuthLink } from '@/components/auth/AuthLink';
import { PrimaryButton } from '@/components/ui/Button';
import { Feedback } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';

/** Figma: "Recuperação de senha" + "Recuperação de senha — sucesso". */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { account } = useAuth();

  if (account) return <Redirect href="/painel" />;

  async function submit() {
    if (!email.trim().includes('@')) {
      setError('Informe seu e-mail institucional.');
      return;
    }
    setError(undefined);
    setServerError(null);
    setLoading(true);
    try {
      await api('/auth/password/forgot', { body: { email: email.trim() } });
      setSent(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Algo deu errado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthCard
        success
        title="Verifique seu e-mail"
        subtitle="Se o e-mail pertencer a uma conta cadastrada, as instruções de recuperação serão enviadas.">
        <Feedback
          tone="info"
          message="Por segurança, não informamos se o endereço está cadastrado. Verifique também a caixa de spam."
        />
        <AuthLink href="/login" label="Voltar para o login" back />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Recuperar senha"
      subtitle="Informe seu e-mail institucional para receber as instruções de redefinição de senha.">
      <View style={styles.form}>
        {serverError && <Feedback tone="error" message={serverError} />}
        <TextField
          label="E-mail institucional"
          value={email}
          onChangeText={setEmail}
          placeholder="nome@cesmac.edu.br"
          keyboardType="email-address"
          autoComplete="email"
          autoFocus
          onSubmitEditing={submit}
          error={error}
        />
        <PrimaryButton label="Enviar link de recuperação" onPress={submit} loading={loading} />
      </View>
      <AuthLink href="/login" label="Voltar para o login" back />
    </AuthCard>
  );
}

const styles = StyleSheet.create({ form: { gap: 16, width: '100%' } });
