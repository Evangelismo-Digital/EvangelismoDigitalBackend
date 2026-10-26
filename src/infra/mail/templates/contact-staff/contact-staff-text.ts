export function contactStaffTextTemplate(name: string, email: string, ipAddress?: string, phone?: string) {
  const phoneSection = phone ? `\nTelefone: ${phone}` : ''
  const ipSection = ipAddress ? `\nIP de origem: ${ipAddress}` : ''
  return `
            ${name} <${email}> enviou um formulário.${phoneSection}${ipSection}
        `
}
