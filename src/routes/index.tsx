import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const MagicStage = lazy(() => import("@/magic/MagicStage"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Anime Magic — Hand-Controlled Particle Magic" },
      {
        name: "description",
        content:
          "Control 14,000 shimmering particles with your bare hand. Point, pinch, open your palm or make a fist to cast anime-style magic.",
      },
      { property: "og:title", content: "Anime Magic — Hand-Controlled Particle Magic" },
      {
        property: "og:description",
        content: "Your hand is the controller; the particles are the magic.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Fallback() {
  return <main className="magic-stage" />;
}

function Index() {
  return (
    <ClientOnly fallback={<Fallback />}>
      <Suspense fallback={<Fallback />}>
        <MagicStage />
      </Suspense>
    </ClientOnly>
  );
}
