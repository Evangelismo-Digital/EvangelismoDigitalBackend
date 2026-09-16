import { Text, Section } from '@react-email/components'
import React from 'react'
import { EmailLayout } from './layout'

interface DecisionForChristStaffEmailProps {
  name: string
  lastName: string
  email: string
  location?: string
  ipAddress?: string
}

export function DecisionForChristStaffEmail({ 
  name, 
  lastName, 
  email, 
  location, 
  ipAddress 
}: DecisionForChristStaffEmailProps) {
  return (
    <EmailLayout headerTitle="Nova Decisão por Cristo!">
      <Section className="text-gray-700 text-[16px]">
        <Text className="font-semibold text-[18px] mb-[15px]">
          Alguém tomou uma decisão por Cristo:
        </Text>
        
        <ul className="list-disc list-inside space-y-2 mt-[10px]">
          <li>
            <strong>Nome:</strong> {name} {lastName}
          </li>
          <li>
            <strong>Email:</strong> {email}
          </li>
          <li>
            <strong>Local:</strong> {location ?? 'não informado'}
          </li>
          {ipAddress && (
            <li>
              <strong>IP de origem:</strong> {ipAddress}
            </li>
          )}
        </ul>
      </Section>
    </EmailLayout>
  )
}
