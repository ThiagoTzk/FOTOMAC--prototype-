import { Redirect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { AuthCard } from '@/components/auth/AuthCard';
import { AuthLink } from '@/components/auth/AuthLink';
import { PrimaryButton } from '@/components/ui/Button';
import { Feedback } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';

/** Figma: "Login padrão" + "Login — validação". */
export default function LoginScreen() {
  const { login, account } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Counted HERE, in the screen, for any e-mail typed: the warning below therefore says
  // nothing about whether an account exists (RF002 note 1), yet tells the real owner why
  // the correct password may stop working (lock after 5 failures, RF002 note 7).
  const [failures, setFailures] = useState(0);

  // Already logged in: the staff login has nothing to do ("/" is the visitor home, not the panel).
  if (account) return <Redirect href="/painel" />;

  async function submit() {
    const missing = {
      email: email.trim() ? undefined : 'Informe seu e-mail institucional.',
      password: password ? undefined : 'Informe sua senha.',
    };
    setErrors(missing);
    setServerError(null);
    if (missing.email || missing.password) return;

    setLoading(true);
    try {
      await login(email.trim(), password);
      // The session now exists: the check below moves to the panel.
    } catch (err) {
      // The server answers with one generic message for every failure (RF002 note 1).
      setServerError(err instanceof Error ? err.message : 'Não foi possível entrar.');
      setFailures((n) => n + 1);
      setPassword('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Acesse sua conta"
      subtitle="Esta área é destinada à equipe FOTOMAC. Use suas credenciais institucionais para continuar.">
      <View style={styles.form}>
        {serverError && <Feedback tone="error" message={serverError} />}
        {failures >= 3 && (
          <Feedback
            tone="info"
            message="Por segurança, após 5 tentativas sem sucesso o acesso é bloqueado por 15 minutos. Se esqueceu a senha, use “Esqueci minha senha” — isso também desbloqueia a conta."
          />
        )}
        <TextField
          label="E-mail institucional"
          value={email}
          onChangeText={setEmail}
          placeholder="nome@cesmac.edu.br"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="username"
          autoFocus
          error={errors.email}
        />
        <TextField
          label="Senha"
          value={password}
          onChangeText={setPassword}
          placeholder="Digite sua senha"
          secure
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={submit}
          error={errors.password}
        />
        <PrimaryButton label="Entrar" onPress={submit} loading={loading} />
      </View>
      <AuthLink href="/recuperar-senha" label="Esqueci minha senha" />
    </AuthCard>
  );
}

const styles = StyleSheet.create({ form: { gap: 16, width: '100%' } });
