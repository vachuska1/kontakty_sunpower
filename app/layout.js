import './globals.css'

export const metadata = {
  title: 'Sunpower Kontakty',
  description: 'Evidence kontaktů pro Sunpower',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Kontakty', statusBarStyle: 'default' },
}

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#62666a' }

export default function RootLayout({ children }) {
  return <html lang="cs"><body>{children}</body></html>
}
