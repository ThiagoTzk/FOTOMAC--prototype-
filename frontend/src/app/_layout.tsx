import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts,
} from '@expo-google-fonts/inter';
import { Montserrat_400Regular, Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat';
import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/auth/AuthContext';

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { loading } = useAuth();
  const [fontsLoaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Montserrat_400Regular,
    Montserrat_800ExtraBold, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold,
  });
  const ready = fontsLoaded && !loading;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  // Screens only decide what the INTERFACE shows. The real protection is the API, which
  // refuses any request without a valid session (RF002 note 4).
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Visitor area: public, no account (RF002 note 5, RF013-RF023). */}
      <Stack.Screen name="index" options={{ title: 'FOTOMAC — Encontre suas fotos' }} />
      <Stack.Screen name="explorar" options={{ title: 'Eventos — FOTOMAC' }} />
      <Stack.Screen name="evento/[id]" options={{ title: 'Evento — FOTOMAC' }} />
      <Stack.Screen name="privacidade" options={{ title: 'Política de Privacidade — FOTOMAC' }} />
      {/* Staff entry. Someone already logged in is sent to the panel (see each screen). */}
      <Stack.Screen name="login" options={{ title: 'Entrar — FOTOMAC' }} />
      <Stack.Screen name="recuperar-senha" options={{ title: 'Recuperar senha — FOTOMAC' }} />
      {/* Guarded in (painel)/_layout.tsx, which redirects to /login (not to the visitor home). */}
      <Stack.Screen name="(painel)" options={{ title: 'Painel — FOTOMAC' }} />
      {/* Reached from e-mail links: open whether or not someone is logged in. */}
      <Stack.Screen name="redefinir-senha" options={{ title: 'Definir nova senha — FOTOMAC' }} />
      <Stack.Screen name="primeiro-acesso" options={{ title: 'Primeiro acesso — FOTOMAC' }} />
      <Stack.Screen name="autorizacao/index" options={{ title: 'Autorização de uso de imagem — FOTOMAC' }} />
      <Stack.Screen name="autorizacao/revogar" options={{ title: 'Revogar autorização — FOTOMAC' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootStack />
    </AuthProvider>
  );
}
