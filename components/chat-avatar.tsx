import Image from "next/image"
import { Avatar, Style } from "@dicebear/core"
import definition from "@dicebear/styles/gaze.json" with { type: "json" }

const style = new Style(definition)

type ChatAvatarProps = {
  seed: string
  animated?: boolean
  className?: string
}

export function ChatAvatar({ seed, animated = false, className }: ChatAvatarProps) {
  const avatar = new Avatar(style, {
    seed,
    ...(animated ? { tags: ["animation"] } : {}),
  })

  return (
    <Image
      src={avatar.toDataUri()}
      alt={`Avatar for ${seed}`}
      width={32}
      height={32}
      unoptimized
      className={className}
    />
  )
}
