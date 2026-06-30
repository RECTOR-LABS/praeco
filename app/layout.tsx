import "./globals.css";
import type { ReactNode } from "react";
export const metadata = { title: "Praeco", description: "A general contractor for product launches." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
