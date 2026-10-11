import { Redirect, Slot } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { Shell } from '@/components/panel/Shell';

/** Every operation-area screen shares the sidebar + header of the Figma "Área autenticada". */
export default function PanelLayout() {
  const { account } = useAuth();
  // Without a session (never logged in, or just clicked "Sair") the panel sends to the staff
  // login — not to "/", which is the visitor's home. The API refuses the data anyway (RF002 note 4).
  if (!account) return <Redirect href="/login" />;
  return (
    <Shell>
      <Slot />
    </Shell>
  );
}
