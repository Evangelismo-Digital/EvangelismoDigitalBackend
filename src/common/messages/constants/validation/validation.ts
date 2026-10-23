export const VALIDATION_CONSTANTS = {
  CPF: {
    INVALID: 'CPF inválido!',
  },
  PASSWORD: {
    TOO_SHORT: 'A senha deve ter pelo menos 8 caracteres.',
    TOO_LONG: 'A senha deve ter no máximo 64 caracteres.',
    UPPERCASE: 'A senha deve conter pelo menos uma letra maiúscula.',
    LOWERCASE: 'A senha deve conter pelo menos uma letra minúscula.',
    DIGIT: 'A senha deve conter pelo menos um número.',
    SPECIAL: 'A senha deve conter pelo menos um caractere especial.',
    NO_SPACES: 'A senha não pode conter espaços.',
  },
  CEP: {
    INVALID_FORMAT: 'CEP inválido. Use o formato 12345-678 ou 12345678.',
  },
} as const
