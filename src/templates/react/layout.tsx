import { Html, Head, Body, Container, Section, Text, Tailwind } from '@react-email/components'
import React from 'react'

interface EmailLayoutProps {
  headerTitle: string
  children: React.ReactNode
  footerContent?: React.ReactNode
}

export function EmailLayout({ headerTitle, children, footerContent }: Readonly<EmailLayoutProps>) {
  return (
    <Html>
      <Tailwind>
        <Head />
        <Body className="bg-gray-100 font-sans">
          <Container className="bg-white mx-auto my-[40px] shadow-sm rounded-lg overflow-hidden w-full max-w-[600px]">
            {/* Header */}
            <Section className="bg-[#eb5933] p-[20px] text-center">
              <Text className="text-white text-[24px] font-bold m-0">{headerTitle}</Text>
            </Section>

            {/* Body Content */}
            <Section className="p-[30px]">{children}</Section>

            {/* Optional Footer */}
            {footerContent && (
              <Section className="bg-gray-50 border-t border-gray-200 p-[20px] text-center">{footerContent}</Section>
            )}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
