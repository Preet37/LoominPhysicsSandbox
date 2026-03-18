import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loomin - The Future of Learning",
  description: "Transform your notes into interactive 3D simulations. AI-powered learning platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
