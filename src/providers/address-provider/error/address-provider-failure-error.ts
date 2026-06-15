export class AddressProviderFailureError extends Error {
  private readonly originalReason?: unknown

  constructor(reason?: unknown) {
    super('Falha no provedor de endereços')

    this.originalReason = reason
  }
}
