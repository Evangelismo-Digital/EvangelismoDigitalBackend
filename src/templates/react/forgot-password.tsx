import { Text, Section, Button, Link, Heading } from '@react-email/components'
import React from 'react'
import { EmailLayout } from './layout'

interface ForgotPasswordEmailProps {
  userName: string
  resetUrl: string
  appName: string
  expiresInMinutes: number
}

export function ForgotPasswordEmail({ userName, resetUrl, appName, expiresInMinutes }: ForgotPasswordEmailProps) {
  return (
    <EmailLayout headerTitle="Recuperação de Senha">
      <Section className="text-gray-700 text-[16px]">
        <Heading className="text-[20px] font-semibold mb-[20px] m-0">Olá, {userName}!</Heading>

        <Text className="mb-[20px]">
          Recebemos uma solicitação para redefinir a sua senha. Para continuar, clique no botão abaixo:
        </Text>

        <Section className="text-center mb-[20px]">
          <Button
            href={resetUrl}
            className="bg-[#1976d2] text-white px-[24px] py-[12px] rounded-[6px] font-bold decoration-none"
          >
            Redefinir senha
          </Button>
        </Section>

        <Text className="mb-[20px]">
          Ou copie e cole este link no seu navegador: <br />
          <Link href={resetUrl} className="text-[#1976d2] underline break-all">
            {resetUrl}
          </Link>
        </Text>

        <Text className="mb-[20px]">Este link é válido por {expiresInMinutes} minutos.</Text>

        <Text className="mb-[20px]">Se você não solicitou a recuperação de senha, ignore este e-mail.</Text>

        <Text className="m-0">
          Atenciosamente, <br />
          Equipe {appName}
        </Text>
      </Section>
    </EmailLayout>
  )
}
