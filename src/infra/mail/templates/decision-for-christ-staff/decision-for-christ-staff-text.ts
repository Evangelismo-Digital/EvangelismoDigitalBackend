export function decisionForChristStaffTextTemplate(name: string, email: string, ipAddress?: string) {
  const ipSection = ipAddress ? `\nIP de origem: ${ipAddress}` : ''
  return `
            ${name} <${email}> aceitou a Cristo.${ipSection}
        `
}
