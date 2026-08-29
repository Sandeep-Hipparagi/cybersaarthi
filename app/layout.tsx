import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://cybersaarthi-safe-complaint.hipparagi95.chatgpt.site"),
  title: "CyberSaarthi — Independent multilingual cyber-support prototype",
  description:
    "A voice-first browser prototype with multilingual TTS, speech-to-text, Vision evidence extraction, human review, and a persistent mocked backend.",
  applicationName: "CyberSaarthi",
  authors: [{ name: "CyberSaarthi" }],
  keywords: [
    "cybercrime complaint preparation",
    "India cybercrime",
    "citizen-first AI",
    "multilingual cyber support",
    "synthetic case tracking",
  ],
  robots: { index: true, follow: true },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "CyberSaarthi",
    title: "CyberSaarthi — Independent multilingual cyber-support prototype",
    description:
      "Speak in your own language with automatic detection, parse evidence, review facts, and save a traceable prototype case.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "CyberSaarthi — Independent multilingual cyber-support prototype",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CyberSaarthi — Independent multilingual cyber-support prototype",
    description:
      "A voice-first browser prototype with multilingual speech, Vision evidence extraction, and citizen-confirmed facts.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/cybersaarthi-mark.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
