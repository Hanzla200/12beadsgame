import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "12 Beads — Bara Tehni",
  description: "A responsive take on the classic Bara Tehni strategy game.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
