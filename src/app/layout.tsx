import type { Metadata } from "next";
import { Big_Shoulders, IBM_Plex_Mono } from "next/font/google";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/content/site-meta";
import { THEME_DEFAULT, THEME_INIT_SCRIPT } from "./theme-config";
import { INTRO_INIT_SCRIPT } from "./intro-config";
import CursorFx from "./cursor-fx";
import SoundFx from "./sound-fx";
import SiteFooter from "./site-footer";
import SiteHeader from "./site-header";
import StrataPackages from "./strata-packages";
import "./variables.css";
import "./globals.css";

const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  display: "swap",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-st-theme={THEME_DEFAULT} className={`${bigShoulders.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT + INTRO_INIT_SCRIPT }} />
      </head>
      <body className="d-flex flex-column min-h-[100dvh]">
        <SiteHeader />
        <main className="rk-main flex-fill pt-[min(var(--space-lg),4dvh)] pb-[var(--space-xxl)]">{children}</main>
        <SiteFooter />
        <StrataPackages />
        <CursorFx />
        <SoundFx />
        <div aria-hidden="true" className="rk-vignette" />
        <div aria-hidden="true" className="rk-vignette-scroll" />
      </body>
    </html>
  );
}
