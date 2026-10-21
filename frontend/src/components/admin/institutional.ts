import type { InstitutionalStatus } from '@/api/institutional';
import { panel } from '@/theme/tokens';

/** Colours of the situation of an institutional registration (RF020). */
export const STATUS_PILL: Record<InstitutionalStatus, { bg: string; fg: string }> = {
  awaiting: { bg: panel.warningSoft, fg: panel.warning },
  active: { bg: panel.successSoft, fg: panel.success },
  revoked: { bg: panel.page, fg: panel.muted },
};
