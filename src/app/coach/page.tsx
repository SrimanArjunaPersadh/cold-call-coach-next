import { CoachPanel } from "@/components/coach-panel"

export const metadata = { title: "Coach · Cold Call Coach" }

// The whole loop is browser work — MediaRecorder, Web Audio, sessionStorage, a
// signed direct-PUT to Storage — so the page is a thin server shell around one
// client component (Phase 3).
export default function CoachPage() {
  return <CoachPanel />
}
