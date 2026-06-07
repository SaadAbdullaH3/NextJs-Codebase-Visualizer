import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NextVis — Next.js Codebase Visualizer",
  description:
    "Interactive dependency graph viewer for Next.js projects. Analyze component relationships, render edges, server actions, and barrel imports at a glance.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#0a0a0f] text-[#e8e8ed] antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
