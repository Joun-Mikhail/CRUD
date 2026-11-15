export interface PasswordRule {
  id: string
  label: string
  test: (password: string) => boolean
}

/** Mirrors the Cognito user pool password policy configured in infrastructure/template.yaml. */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: 'At least 12 characters', test: (p) => p.length >= 12 },
  { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'number', label: 'A number', test: (p) => /[0-9]/.test(p) },
  { id: 'symbol', label: 'A symbol (e.g. ! ? # $ %)', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
]

export function passwordMeetsPolicy(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password))
}

export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}
