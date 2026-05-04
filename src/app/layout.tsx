import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { env } from "@/lib/env";
import {
  SITE_METADATA_DEFAULT_TITLE,
  SITE_METADATA_TITLE_TEMPLATE,
} from "@/lib/site";
import "./globals.css";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const fontSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL()),
  title: {
    default: SITE_METADATA_DEFAULT_TITLE,
    template: SITE_METADATA_TITLE_TEMPLATE,
  },
  description: "Explore public art in Waco with location-based detail pages.",
  openGraph: {
    type: "website",
    url: "/",
    title: SITE_METADATA_DEFAULT_TITLE,
    description: "Explore public art in Waco with location-based detail pages.",
    images: [{ url: "/opengraph-image" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_METADATA_DEFAULT_TITLE,
    description: "Explore public art in Waco with location-based detail pages.",
    images: ["/twitter-image"],
  },
  icons: {
    icon: [{ url: "/globe.svg" }],
    apple: [{ url: "/globe.svg" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${fontMono.variable} ${fontSerif.variable}`}
    >
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
