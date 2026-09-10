import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Продуктовая ферма', description: 'Проверяйте гипотезы. Принимайте решения на данных.' };
export default function Layout({children}: Readonly<{children:React.ReactNode}>) {
  return <html lang="ru"><body>{children}</body></html>;
}
