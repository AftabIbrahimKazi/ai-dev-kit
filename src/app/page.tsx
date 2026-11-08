import type { Metadata } from "next";
import { LANDING_CHAPTERS } from "@/content/landing";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/content/site-meta";
import LandingChapter from "./landing-chapter";
import LandingHero from "./landing-hero";
import LandingIntro from "./landing-intro";
import LandingModules from "./landing-modules";
import LandingRail from "./landing-rail";
import LandingStage from "./landing-stage";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { title: SITE_TITLE, description: SITE_DESCRIPTION, type: "website", siteName: SITE_NAME },
};

export default function Home() {
  return (
    <>
      <LandingStage />
      <LandingIntro />
      <LandingRail />
      <LandingHero />
      {LANDING_CHAPTERS.map((chapter) => (
        <LandingChapter key={chapter.id} chapter={chapter} />
      ))}
      <LandingModules />
    </>
  );
}
