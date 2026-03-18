import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Company Researcher",
  description: "Generate stored company outreach briefs from live web sources and a shared resume.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
