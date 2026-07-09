export function contactStaffTextTemplate(name: string, email: string, ipAddress?: string) {
  const ipSection = ipAddress ? `\nIP de origem: ${ipAddress}` : ''
  return `
            ${name} <${email}> enviou um formulário.${ipSection}
        `
}
