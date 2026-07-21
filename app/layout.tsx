import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Everroot — the Living Legacy Forest",
  description: "Preserve your family's history before it's gone.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
