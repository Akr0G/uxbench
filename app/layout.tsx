import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "UXBench — Website evidence & benchmarks",
  description:
    "Repeatable website audits with Lighthouse, accessibility evidence, responsive checks, and transparent comparisons.",
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
