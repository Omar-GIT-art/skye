"use client"

import * as React from "react"
import { Avatar, Style } from "@dicebear/core"
import definition from "@dicebear/styles/gaze.json" with { type: "json" }
import { cn } from "cn"

const style = new Style(definition)

// Shared across every ChatAvatar instance. The sidebar list and the search
// dialog render the same seeds, and the bot-dialog shuffle revisits seeds,
// so generate once per seed instead of once per render per instance.
const svgCache = new Map<string, string>()
const MAX_CACHED_AVATARS = 200

// Small numeric hash (FNV-1a). Only the number reaches the stylesheet, so
// arbitrary seeds can never inject CSS.
function hashSeed(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

// The gaze animation is CSS keyframes (dbgaLook 6.4s, dbgaBlink 4.4s,
// dbgaHop 5.2s), all `infinite` from insertion. Every avatar mounts at the
// same time, so without an offset the whole list blinks as one. A negative
// animation-delay starts an avatar mid-cycle: same choreography, decorrelated
// phase. One shared delay preserves the authored relative phasing of
// look/blink/hop within the avatar.
//
// The inner <svg> must fill its wrapper. An inline style (not a class)
// is deliberate: ancestor components force `[&_svg]:size-4` icon sizing
// (command items, sidebar menu buttons, ...), and an inline style beats
// every non-`!important` stylesheet rule, so the avatar can never be
// shrunk by its context again. Replaces the first (root) tag only.
function sizeSvgRoot(svg: string): string {
  return svg.replace("<svg ", '<svg style="width:100%;height:100%" ')
}
function desyncAvatar(svg: string, cls: string, delay: number): string {
  const scope = [".dbga-look", ".dbga-eye", ".dbga-hop"]
    .map((c) => `.${cls} ${c}`)
    .join(",")
  return svg.replace(
    "</svg>",
    `<style>${scope}{animation-delay:${delay}s}</style></svg>`
  )
}
function getAvatar(seed: string, animated: boolean): { svg: string; cls: string } {
  // Window spans several animation loops (longest is 6.4s) so the faster
  // blink/hop cycles land in clearly different alignments per seed.
  const DESYNC_WINDOW_MS = 16000
  const bucket = hashSeed(seed) % DESYNC_WINDOW_MS
  const cls = animated ? `dbga-off-${bucket}` : ""
  const key = `${seed}:${animated ? "animated" : "static"}`
  const cached = svgCache.get(key)
  if (cached !== undefined) {
    return { svg: cached, cls }
  }

  const svg = new Avatar(style, {
    seed,
    ...(animated ? { tags: ["animation"] } : {}),
  }).toString()

  const sized = sizeSvgRoot(svg)
  const finalSvg = animated ? desyncAvatar(sized, cls, -(bucket / 1000)) : sized

  // Map preserves insertion order: evict the oldest entry to bound memory.
  if (svgCache.size >= MAX_CACHED_AVATARS) {
    const oldest = svgCache.keys().next()
    if (!oldest.done) {
      svgCache.delete(oldest.value)
    }
  }
  svgCache.set(key, finalSvg)

  return { svg: finalSvg, cls }
}

type ChatAvatarProps = {
  seed: string
  animated?: boolean
  className?: string
}

export function ChatAvatar({
  seed,
  animated = true,
  className,
}: ChatAvatarProps) {
  const { svg, cls } = React.useMemo(
    () => getAvatar(seed, animated),
    [seed, animated]
  )

  return (
    <span
      role="img"
      aria-label={`Avatar for ${seed}`}
      className={cn("inline-flex shrink-0 overflow-hidden", cls, className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
