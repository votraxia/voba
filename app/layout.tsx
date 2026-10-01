import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components";
import { SubscriptionProvider } from "@/components/billing/SubscriptionProvider";
import { ThemeProvider, themeBootScript } from "@/components/theme/ThemeProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Shopify Theme Builder",
  description: "Generate beautiful Shopify themes with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `suppressHydrationWarning` is required: the inline boot script below sets
    // data-theme before React hydrates, so the server and client markup differ
    // by design.
    <html
      lang="en"
      suppressHydrationWarning
      data-theme="obsidian"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/* Applies the saved theme before first paint (no flash of the default). */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-app text-fg">
        <ThemeProvider>
          <AuthProvider>
            <SubscriptionProvider>{children}</SubscriptionProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
