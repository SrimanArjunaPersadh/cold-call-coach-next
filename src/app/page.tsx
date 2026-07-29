import { redirect } from "next/navigation"

// Coach is the spine of the tool (§3), so it is the front door.
export default function RootPage() {
  redirect("/coach")
}
