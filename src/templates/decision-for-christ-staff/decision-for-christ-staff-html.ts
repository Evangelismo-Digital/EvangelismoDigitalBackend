export function decisionForChristStaffHtmlTemplate(name: string, lastName: string, email: string, location?: string, ipAddress?: string) {
  const ipSection = ipAddress ? `
                <li>
                    IP de origem: ${ipAddress}
                </li>` : ''
  return `
            <p>
                Nova decisão por Cristo:
            </p>
            <ul>
                <li>
                    Nome: ${name} ${lastName}
                </li>
                <li>
                    Email: ${email}
                </li>
                <li>
                    Local: ${location ?? 'não informado'}
                </li>
                ${ipSection}
            </ul>
        `
}
