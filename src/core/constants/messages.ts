export const messages = {
  validation: {
    invalidData: 'Dados de registro inválidos!',
    userAlreadyExists: 'Usuário já existe !',
    invalidCpf: 'CPF inválido!',
    invalidJson: 'O corpo da requisição não está em formato JSON válido. Verifique a estrutura dos dados enviados.',
    passwordTooShort: 'A senha deve ter pelo menos 8 caracteres.',
    passwordTooLong: 'A senha deve ter no máximo 64 caracteres.',
    passwordUppercase: 'A senha deve conter pelo menos uma letra maiúscula.',
    passwordLowercase: 'A senha deve conter pelo menos uma letra minúscula.',
    passwordDigit: 'A senha deve conter pelo menos um número.',
    passwordSpecial: 'A senha deve conter pelo menos um caractere especial.',
    passwordNoSpaces: 'A senha não pode conter espaços.',
  },
  errors: {
    internalServer: 'Erro interno do servidor!',
    invalidCredentials: 'Credenciais inválidas!',
    resourceNotFound: 'Recurso não encontrado!',
    forbidden: 'Acesso negado!',
    unauthorized: 'Não autorizado!',
    invalidToken: 'Token inválido ou expirado!',
    passwordChangeRequired: 'É necessário alterar a senha antes de acessar o sistema!',
    formSubmissionFailed: 'Falha ao enviar o formulário.',
    createUserFailed: 'Falha ao criar o usuário.',
    operationAbortedError: 'Operação abortada pelo cache manager.',
  },
  info: {
    passwordResetGeneric: 'Se o usuário existir, você receberá um e-mail com instruções para redefinir a senha.',
  },
  email: {
    passwordRecoverySubject: 'Recuperação de senha',
  },
}

export type Messages = typeof messages
