export function decisionForChristStaffTextTemplate(name: string, email: string, ipAddress?: string, phone?: string) {
  const phoneSection = phone ? `\nTelefone: ${phone}` : ''
  const ipSection = ipAddress ? `\nIP de origem: ${ipAddress}` : ''
  return `
            ${name} <${email}> aceitou a Cristo.${phoneSection}${ipSection}
        `
}
