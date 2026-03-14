import type { Metadata } from "next";
import { Noto_Sans_KR, Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans-kr",
});

export const metadata: Metadata = {
  title: "네이버 블로그 자동 작성",
  description: "안경원 네이버 블로그 자동 작성 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body suppressHydrationWarning className={`${notoSansKR.variable} font-sans antialiased bg-gray-50 min-h-screen`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
