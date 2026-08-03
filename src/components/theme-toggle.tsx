"use client"

import { useEffect, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  isDark,
  isDarkServer,
  subscribeTheme,
  syncThemeColor,
  toggleTheme,
} from "@/lib/theme"

// §4.5 — the one dark-mode control in the app.
//
// Ghost, not cyan: flipping the skin is a utility, not the screen's primary
// action, and §4.1 caps cyan at interactions that matter. size="icon" is 44px
// (§10) without a size override.
//
// Both icons are always in the DOM and CSS picks one off the `.dark` class, so
// the button is already showing the right face in the server's HTML — the init
// script put the class on <html> before React ever ran. Only `aria-pressed`
// needs the hook, because an attribute cannot be chosen by a stylesheet.
//
// Moon means "tap for dark", Sun means "tap for light": the icon names what you
// get, not what you have. The aria-label stays constant for the same reason a
// checkbox's label does — `aria-pressed` carries the state.
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeTheme, isDark, isDarkServer)

  // Re-tint the browser chrome after every client-side navigation. Next owns the
  // theme-color meta and re-renders it per route, resetting it to light's white
  // while the page stays dark — see syncThemeColor's note. This component is the
  // theme's only client-side presence in the shell, and the shell survives
  // navigation, so this is where the correction belongs. If the toggle ever
  // moves out of the nav, this has to move with it.
  const pathname = usePathname()
  useEffect(syncThemeColor, [pathname, dark])

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-pressed={dark}
      aria-label="Dark mode"
      onClick={() => toggleTheme()}
    >
      <Moon aria-hidden className="dark:hidden" />
      <Sun aria-hidden className="hidden dark:block" />
    </Button>
  )
}
