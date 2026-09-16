import { render } from '@react-email/render'
import React from 'react'
import { ContactStaffEmail } from './src/templates/react/contact-staff'

async function run() {
  const html = await render(<ContactStaffEmail name="John" lastName="Doe" email="john@example.com" />)
  console.log(html)
}
run()
