import type { AccountStatus } from '@/api/accounts';
import { Pill } from '@/components/panel/ui';
import { panel } from '@/theme/tokens';

const TONE: Record<AccountStatus, { bg: string; fg: string }> = {
  pending: { bg: panel.warningSoft, fg: panel.warning },
  active: { bg: panel.successSoft, fg: panel.success },
  inactive: { bg: panel.page, fg: panel.muted },
  suspended: { bg: panel.dangerSoft, fg: panel.danger },
  expired: { bg: panel.page, fg: panel.muted },   // temporary account after its 24 h (RF031)
};

/** Situação da conta (RF001 note 6) in the same pill style as the event status. */
export function AccountStatusPill({ status, label }: { status: AccountStatus; label: string }) {
  return <Pill label={label} bg={TONE[status].bg} fg={TONE[status].fg} />;
}
