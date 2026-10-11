/**
 * Same three rules as backend/app/auth/passwords.py. The screen checks them instantly for
 * a good experience; the SERVER checks them again and is the one that decides.
 */
export type PasswordRuleKey = 'min_length' | 'upper_lower' | 'digit_special';

export const PASSWORD_RULES: { key: PasswordRuleKey; label: string }[] = [
  { key: 'min_length', label: 'No mínimo 8 caracteres' },
  { key: 'upper_lower', label: 'Uma letra maiúscula e uma minúscula' },
  { key: 'digit_special', label: 'Um número e um caractere especial' },
];

export function failedRules(password: string): PasswordRuleKey[] {
  const failed: PasswordRuleKey[] = [];
  if (password.length < 8) failed.push('min_length');
  if (!(/[a-zà-ÿ]/.test(password) && /[A-ZÀ-Ý]/.test(password))) failed.push('upper_lower');
  if (!(/\d/.test(password) && /[^\w\s]|_/.test(password))) failed.push('digit_special');
  return failed;
}
