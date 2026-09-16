import { Text, Section } from '@react-email/components'
import React from 'react'
import { EmailLayout } from './layout'

interface DecisionForChristUserEmailProps {
  name: string
}

export function DecisionForChristUserEmail({ name }: DecisionForChristUserEmailProps) {
  return (
    <EmailLayout headerTitle="Evangelismo Digital">
      <Section className="text-gray-700 text-[16px]">
        <Text className="mb-[15px]">
          Olá <strong>{name}</strong>,
        </Text>

        <Text className="mb-[15px]">É uma alegria saber que você tomou uma decisão por Cristo.</Text>

        <Text className="m-0">Em breve, nossa equipe entrará em contato para acompanhá-lo nessa nova jornada.</Text>
      </Section>
    </EmailLayout>
  )
}
