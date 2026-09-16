import { Text, Link, Section } from '@react-email/components'
import React from 'react'
import { EmailLayout } from './layout'

interface ContactUserEmailProps {
  name: string
}

export function ContactUserEmail({ name }: ContactUserEmailProps) {
  return (
    <EmailLayout
      headerTitle="Evangelismo Digital"
      footerContent={
        <Text className="text-[12px] text-gray-500 m-0">
          Se deseja não receber mais estes e-mails,{' '}
          <Link href="#" className="text-gray-500 underline">
            clique aqui
          </Link>
          .
        </Text>
      }
    >
      <Section className="text-center text-gray-700 text-[16px]">
        <Text className="text-[20px] font-semibold mb-[20px]">
          Graça e paz, <strong>{name}</strong>!
        </Text>

        <Text className="mb-[15px]">Recebemos sua mensagem. É uma honra que você esteja se conectando conosco!</Text>

        <Text className="m-0">
          Você será adicionado à nossa lista de e-mails para receber atualizações, recursos e inspiração para lhe
          auxiliar na sua jornada.
        </Text>
      </Section>
    </EmailLayout>
  )
}
