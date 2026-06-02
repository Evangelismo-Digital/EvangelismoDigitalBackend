export const messages = {
  validation: {
    invalidData: 'Dados de registro inválidos!',
    userAlreadyExists: 'Usuário já existe !',
    churchAlreadyExists: 'Já existe uma igreja cadastrada com este nome e/ou coordenadas',
    invalidCpf: 'CPF inválido!',
    invalidJson: 'O corpo da requisição não está em formato JSON válido. Verifique a estrutura dos dados enviados.',
    invalidCep: 'CEP inválido!',
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
    cepDoesNotExist: 'O CEP fornecido não existe.',
    coordinatesNotFound: 'Coordenadas não encontradas para o endereço fornecido.',
    churchNotFound: 'Igreja não encontrada.',
    noAddressProvided: 'Nenhum endereço fornecido para conversão de CEP.',
    forbidden: 'Acesso negado!',
    unauthorized: 'Não autorizado!',
    invalidToken: 'Token inválido ou expirado!',
    passwordChangeRequired: 'É necessário alterar a senha antes de acessar o sistema!',
    formSubmissionFailed: 'Falha ao enviar o formulário.',
    createChurchFailed: 'Falha ao criar a igreja.',
    createUserFailed: 'Falha ao criar o usuário.',
    geoProviderFailureError: `Falha de sistema ao tentar obter coordendas do provedor de serviços.`,
    serviceOverloadError:
      'Número de requisições simultâneas excedeu o limite de maxPendingFetches na memória cache do Redis.',
    timeoutExceededOnFetch: 'Tempo limite excedido ao buscar dados nos provedores externos.',
    noGeoProviderError:
      'Provedor resiliente de geolocalização requer pelo menos um provedor de geolocalização configurado.',
    noAddressProviderError: 'Provedor resiliente de endereço requer pelo menos um provedor de endereço configurado.',
    operationAbortedError: 'Operação abortada pelo cache manager.',
    addressProviderFailureError: 'Falha de sistema ao tentar obter endereço do provedor de serviços.',
    cepToLatLonError: 'Falha de sistema ao tentar converter CEP para coordenadas.',
    noRateLimiterSetError: 'Nenhum rate limiter foi configurado para este provedor.',
    serviceBusy: 'Serviço temporariamente indisponível devido a limite de requisições.',
    providerFailure: 'Falha de sistema ao tentar processar dados no provedor de serviços externos.',
    databaseQueryFailure: 'Falha de sistema ao processar consulta no banco de dados.',
    emptyChurchList: 'Lista de igrejas vazia!',
    noNearbyChurchesFound: 'Nenhuma igreja encontrada nas proximidades.',
  },
  info: {
    passwordResetGeneric: 'Se o usuário existir, você receberá um e-mail com instruções para redefinir a senha.',
  },
  email: {
    passwordRecoverySubject: 'Recuperação de senha',
  },
  latitude: {
    outOfRange: 'A Latitude deve estar entre -90 e 90 graus.',
  },
  longitude: {
    outOfRange: 'A longitude deve estar entre -180 e 180 graus.',
  },
}

export type Messages = typeof messages
