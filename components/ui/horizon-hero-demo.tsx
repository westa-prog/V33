import { Component } from "@/components/ui/horizon-hero-section";

export function DemoOne() {
  return (
    <Component
      title="Horizon"
      boardName="Board A"
      subtitleLines={["Where vision meets reality,", "we shape the future of tomorrow."]}
      stats={[
        { label: "Drivers", value: 12 },
        { label: "Connected", value: 10, tone: "success" },
        { label: "Attention", value: 2, tone: "warning" },
        { label: "Board", value: "A" },
      ]}
      appraisals={[
        "Steady follow-through keeps the board healthy.",
        "The best operators win on consistency, not noise.",
        "Every clean update improves the whole team.",
      ]}
    />
  );
}
