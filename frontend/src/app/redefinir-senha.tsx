import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { api } from '@/api/client';
import { AuthCard } from '@/components/auth/AuthCard';
import { AuthLink } from '@/components/auth/AuthLink';
import { NewPasswordForm } from '@/components/auth/NewPasswordForm';
import { useLinkCheck } from '@/components/auth/useLinkCheck';
import { PrimaryButton } from '@/components/ui/Button';
import { Feedback } from '@/components/ui/Feedback';
import { colors } from '@/theme/tokens';

/** Figma: "Redefinição de senha" + "— validação" + "— sucesso". Opened from the e-mail link. */
export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const link = useLinkCheck('/auth/password/reset/check', token);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <AuthCard success title="Senha alterada com sucesso"
                subtitle="Sua nova senha já está ativa. Use-a no próximo acesso ao FOTOMAC.">
        <PrimaryButton label="Ir para o login" onPress={() => router.replace('/login')} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Definir nova senha" subtitle="Crie uma senha segura para voltar a acessar sua conta FOTOMAC.">
      {link === 'checking' && <ActivityIndicator color={colors.primary} />}
      {link === 'invalid' && (
        <Feedback tone="error" message="Este link é inválido, já foi usado ou expirou. Solicite um novo link para continuar." />
      )}
      {link === 'valid' && (
        <NewPasswordForm
          submitLabel="Redefinir senha"
          onSubmit={async (password, password_confirmation) => {
            await api('/auth/password/reset', { body: { token, password, password_confirmation } });
            setDone(true);
          }}
        />
      )}
      {link === 'invalid'
        ? <AuthLink href="/recuperar-senha" label="Solicitar novo link" />
        : <AuthLink href="/login" label="Voltar para o login" back />}
    </AuthCard>
  );
}
