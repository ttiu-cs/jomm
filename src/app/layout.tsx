import type { Metadata, Viewport } from "next";
import "@fontsource/lexend/400.css";
import "@fontsource/lexend/700.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stallkeeper: an AI shop assistant you teach by talking",
  description: "Show your stall to the camera and talk. Your AI shop assistant learns your stock, negotiates with buyer agents and gets paid through PayPal.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1d5a3b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
