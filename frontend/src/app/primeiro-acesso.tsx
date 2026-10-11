import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { api } from '@/api/client';
import { useAuth, type Account } from '@/auth/AuthContext';
import { AuthCard } from '@/components/auth/AuthCard';
import { NewPasswordForm } from '@/components/auth/NewPasswordForm';
import { useLinkCheck } from '@/components/auth/useLinkCheck';
import { PrimaryButton } from '@/components/ui/Button';
import { Feedback } from '@/components/ui/Feedback';
import { colors } from '@/theme/tokens';

/**
 * Figma: "Primeiro acesso obrigatório" + "— sucesso".
 *
 * DIVERGES FROM FIGMA ON PURPOSE: the design has a "Senha atual (senha provisória)" field,
 * from requirements v1.4. Version 1.6 replaced the provisional password with a single-use
 * e-mail link (RF001 note 5: the system never assigns a password). So the screen is opened
 * by that link and has no "current password" field. The rest of the layout is the design's.
 */
export default function FirstAccessScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { setAccount } = useAuth();
  const link = useLinkCheck('/auth/first-access/check', token);
  const [activated, setActivated] = useState<Account | null>(null);

  if (activated) {
    return (
      <AuthCard success title="Nova senha criada"
                subtitle="Seu primeiro acesso foi concluído. Agora você já pode usar os recursos do FOTOMAC com segurança.">
        <Feedback tone="success" message="Sua conta está pronta para continuar." />
        <PrimaryButton
          label={activated.role === 'admin' ? 'Continuar para o painel' : 'Continuar para o painel do fotógrafo'}
          onPress={() => {
            setAccount(activated); // the API already opened the session (HttpOnly cookie)
            router.replace('/painel');
          }}
        />
      </AuthCard>
    );
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
          notice="Esta etapa é obrigatória. Você terá acesso ao painel após salvar sua senha."
          onSubmit={async (password, password_confirmation) => {
            setActivated(await api<Account>('/auth/first-access', { body: { token, password, password_confirmation } }));
          }}
        />
      )}
    </AuthCard>
  );
}
