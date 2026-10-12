"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { Loader2, Maximize2, MonitorCog } from "lucide-react"

import { getSandboxVncUrl } from "@/actions/sandbox"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

type DesktopStatus = "idle" | "loading" | "ready" | "error"

type SandboxDesktopContextValue = {
  status: DesktopStatus
  error: string | null
  fullscreen: boolean
  load: () => void
  openFullscreen: () => void
  closeFullscreen: () => void
  setPanelHost: (node: HTMLElement | null) => void
  setDialogHost: (node: HTMLElement | null) => void
}

// One signed URL per chat per page lifetime: the VNC viewer (and its
// websocket session) is created once, then the same iframe is moved
// between the side-panel preview and the fullscreen dialog.
const urlCache = new Map<string, Promise<string>>()

function fetchVncUrlOnce(chatId: string): Promise<string> {
  const cached = urlCache.get(chatId)
  if (cached) {
    return cached
  }
  const pending = getSandboxVncUrl(chatId).then(
    ({ url }) => url,
    (error: unknown) => {
      urlCache.delete(chatId)
      throw error
    }
  )
  urlCache.set(chatId, pending)
  return pending
}

const SandboxDesktopContext =
  React.createContext<SandboxDesktopContextValue | null>(null)

export function useSandboxDesktop() {
  const context = React.useContext(SandboxDesktopContext)
  if (!context) {
    throw new Error(
      "useSandboxDesktop must be used within SandboxDesktopProvider"
    )
  }
  return context
}

export function SandboxDesktopProvider({
  chatId,
  children,
}: {
  chatId: string
  children: React.ReactNode
}) {
  const [status, setStatus] = React.useState<DesktopStatus>("idle")
  const [url, setUrl] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [fullscreen, setFullscreen] = React.useState(false)
  const [panelHost, setPanelHost] = React.useState<HTMLElement | null>(null)
  const [dialogHost, setDialogHost] = React.useState<HTMLElement | null>(null)

  const load = React.useCallback(() => {
    setStatus((current) => {
      if (current === "loading" || current === "ready") {
        return current
      }
      return "loading"
    })
    void fetchVncUrlOnce(chatId).then(
      (nextUrl) => {
        setUrl(nextUrl)
        setError(null)
        setStatus("ready")
      },
      (fetchError: unknown) => {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load the sandbox desktop."
        )
        setStatus("error")
      }
    )
  }, [chatId])

  const openFullscreen = React.useCallback(() => {
    setFullscreen(true)
  }, [])
  const closeFullscreen = React.useCallback(() => {
    setFullscreen(false)
  }, [])
  const handlePanelHost = React.useCallback((node: HTMLElement | null) => {
    setPanelHost(node)
  }, [])
  const handleDialogHost = React.useCallback((node: HTMLElement | null) => {
    setDialogHost(node)
  }, [])

  const value = React.useMemo(
    () => ({
      status,
      error,
      fullscreen,
      load,
      openFullscreen,
      closeFullscreen,
      setPanelHost: handlePanelHost,
      setDialogHost: handleDialogHost,
    }),
    [
      status,
      error,
      fullscreen,
      load,
      openFullscreen,
      closeFullscreen,
      handlePanelHost,
      handleDialogHost,
    ]
  )

  // Memoized so React moves the live iframe between hosts instead of
  // reloading it: one noVNC session shared by preview and dialog.
  const frame = React.useMemo(
    () =>
      url ? (
        <iframe
          title="Sandbox desktop"
          src={url}
          className="block h-full w-full border-0 bg-black"
          tabIndex={-1}
          allow="clipboard-read; clipboard-write"
        />
      ) : null,
    [url]
  )

  const activeHost =
    fullscreen && dialogHost ? dialogHost : panelHost

  return (
    <SandboxDesktopContext.Provider value={value}>
      {children}
      {frame && activeHost ? createPortal(frame, activeHost) : null}
    </SandboxDesktopContext.Provider>
  )
}

export function SandboxDesktopPreview() {
  const {
    status,
    error,
    load,
    openFullscreen,
    setPanelHost,
  } = useSandboxDesktop()

  React.useEffect(() => {
    load()
  }, [load])

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
      <div
        ref={(node) => {
          setPanelHost(node)
        }}
        className="absolute inset-0"
      />
      {status !== "ready" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/20 p-4 text-center">
          {status === "error" ? (
            <>
              <MonitorCog className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {error ?? "Failed to load the sandbox desktop."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={load}
              >
                Retry
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Starting sandbox desktop…
              </p>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={openFullscreen}
          aria-label="Open sandbox desktop fullscreen"
          className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition hover:bg-black/40 hover:opacity-100 focus-visible:bg-black/40 focus-visible:opacity-100"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-sm font-medium shadow">
            <Maximize2 className="size-4" />
            Open fullscreen
          </span>
        </button>
      )}
    </div>
  )
}

export function SandboxDesktopDialog() {
  const { status, error, fullscreen, closeFullscreen, setDialogHost } =
    useSandboxDesktop()

  return (
    <Dialog
      open={fullscreen}
      disablePointerDismissal
      onOpenChange={(next, eventDetails) => {
        if (next) {
          return
        }
        // Keystrokes and clicks belong to the remote desktop: never let
        // them dismiss the viewer. Only the explicit close button exits.
        if (
          eventDetails.reason === "escape-key" ||
          eventDetails.reason === "outside-press"
        ) {
          eventDetails.cancel()
          return
        }
        closeFullscreen()
      }}
    >
      <DialogContent
        showCloseButton
        className="flex h-[85dvh] w-[92dvw] max-w-none flex-col gap-3 p-3 sm:max-w-none"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 pr-8">
          <div className="min-w-0">
            <DialogTitle>Sandbox desktop</DialogTitle>
            <DialogDescription className="truncate">
              {status === "error"
                ? (error ?? "Failed to load the sandbox desktop.")
                : "Interact with the bot's computer."}
            </DialogDescription>
          </div>
        </div>
        <div
          ref={(node) => {
            setDialogHost(node)
          }}
          className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-black"
        >
          {status !== "ready" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Starting sandbox desktop…
              </p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
