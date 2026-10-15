import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "제품별 AS 현황",
  description: "주간 품질회의용 제품별 AS(불량) 건수·비용 대시보드",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
