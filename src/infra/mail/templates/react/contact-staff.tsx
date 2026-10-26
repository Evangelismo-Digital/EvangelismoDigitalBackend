import { Text, Section, Heading } from '@react-email/components'
import React from 'react'
import { EmailLayout } from './layout'

interface ContactStaffEmailProps {
  name: string
  lastName: string
  email: string
  phone?: string
  ipAddress?: string
}

export function ContactStaffEmail({ name, lastName, email, phone, ipAddress }: Readonly<ContactStaffEmailProps>) {
  return (
    <EmailLayout headerTitle="Boas notícias!">
      <Heading className="text-[20px] font-semibold text-gray-800 text-center mb-[20px]">
        Um novo formulário acaba de ser enviado!
      </Heading>

      <Section className="text-[16px] text-gray-700 space-y-2">
        <Text className="m-0">
          <strong>Nome:</strong> {name} {lastName}
        </Text>
        <Text className="m-0">
          <strong>Email:</strong> {email}
        </Text>
        {phone && (
          <Text className="m-0">
            <strong>Telefone:</strong> {phone}
          </Text>
        )}
        {ipAddress && (
          <Text className="m-0">
            <strong>IP de origem:</strong> {ipAddress}
          </Text>
        )}
      </Section>
    </EmailLayout>
  )
}
