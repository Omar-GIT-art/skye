"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { nanoid } from "nanoid"
import { PlusIcon, ShuffleIcon } from "lucide-react"

import { createBot } from "@/actions/bot"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { type InsertBotInput, insertBotSchema } from "@/db/schema"

const BOT_PRESETS: Array<{
  job: string
  instructions: string
}> = [
  {
    job: "Research assistant",
      instructions:
        "Find reliable sources, summarize what they say, and cite every claim. Say so when the evidence is thin.",
  },
  {
    job: "Code reviewer",
      instructions:
        "Review changes for bugs, security issues, and unclear code. Point to the exact lines and suggest a fix.",
  },
  {
    job: "Writing editor",
      instructions:
        "Tighten prose without changing its voice. Explain each edit briefly and flag anything ambiguous.",
  },
  {
    job: "Tutor",
      instructions:
        "Teach step by step, check understanding with questions, and give hints before giving answers.",
  },
]

const FORM_ID = "bot-dialog-form"

type BotDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function BotDialog({ open, onOpenChange }: BotDialogProps) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = React.useState(false)
  const [isPending, startTransition] = React.useTransition()

  const [initialAvatar] = React.useState(() => nanoid())

  const isControlled = open !== undefined
  const dialogOpen = isControlled ? open : internalOpen

  const form = useForm<InsertBotInput>({
    resolver: zodResolver(insertBotSchema),
    defaultValues: {
      avatar: initialAvatar,
      name: "",
      job: BOT_PRESETS[0].job,
      instructions: BOT_PRESETS[0].instructions,
    },
  })

  const handleOpenChange = (next: boolean) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
    if (!next) {
      form.reset({
        avatar: nanoid(),
        name: "",
        job: BOT_PRESETS[0].job,
        instructions: BOT_PRESETS[0].instructions,
      })
    }
  }

  function applyPreset(job: string) {
    const preset = BOT_PRESETS.find((p) => p.job === job)
    form.setValue("job", job, { shouldValidate: true, shouldDirty: true })
    if (preset) {
      form.setValue("instructions", preset.instructions, {
        shouldValidate: true,
        shouldDirty: true,
      })
    }
  }

  function onSubmit(data: InsertBotInput) {
    startTransition(async () => {
      try {
        const { bot } = await createBot(data)
        handleOpenChange(false)
        toast.add({
          title: `${bot.name} is ready`,
          type: "success",
        })
        router.refresh()
      } catch (error) {
        form.setError("root", {
          message:
            error instanceof Error
              ? error.message
              : "Couldn't spin up your bot. Try again.",
        })
      }
    })
  }

  const rootError = form.formState.errors.root?.message

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="secondary" size="lg" className="rounded-full px-4" />
        }
      >
        <PlusIcon data-icon="inline-start" />
        Create a new bot
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New bot</DialogTitle>
          <DialogDescription>
            Pick a face, give it a name, and tell it what to do.
          </DialogDescription>
        </DialogHeader>

        <Controller
          name="job"
          control={form.control}
          render={({ field }) => (
            <ToggleGroup
              value={field.value ? [field.value] : []}
              onValueChange={(value) => {
                if (value[0]) applyPreset(value[0])
              }}
              variant="outline"
              size="sm"
              spacing={2}
              className="flex flex-wrap"
            >
              {BOT_PRESETS.map((preset) => (
                <ToggleGroupItem
                  key={preset.job}
                  value={preset.job}
                  aria-label={preset.job}
                  className="rounded-full"
                >
                  {preset.job}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        />

        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="avatar"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex items-center gap-4">
                    <ChatAvatar
                      seed={field.value}
                      className="size-12 rounded-xl"
                    />
                    <div className="flex flex-1 flex-col gap-1">
                      <FieldLabel htmlFor={`${FORM_ID}-avatar`}>
                        Face
                      </FieldLabel>
                      <FieldDescription>
                        Hit shuffle until one clicks.
                      </FieldDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => field.onChange(nanoid())}
                    >
                      <ShuffleIcon data-icon="inline-start" />
                      Shuffle
                    </Button>
                  </div>
                  <input
                    type="hidden"
                    id={`${FORM_ID}-avatar`}
                    name={field.name}
                    value={field.value}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${FORM_ID}-name`}>Name</FieldLabel>
                  <Input
                    {...field}
                    id={`${FORM_ID}-name`}
                    aria-invalid={fieldState.invalid}
                    placeholder="Ada"
                    autoComplete="off"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="job"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${FORM_ID}-job`}>Role</FieldLabel>
                  <Input
                    {...field}
                    id={`${FORM_ID}-job`}
                    aria-invalid={fieldState.invalid}
                    placeholder="Research assistant"
                    autoComplete="off"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="instructions"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${FORM_ID}-instructions`}>
                    How should it behave?
                  </FieldLabel>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    id={`${FORM_ID}-instructions`}
                    aria-invalid={fieldState.invalid}
                    placeholder="Answer briefly, cite sources, and ask before running anything destructive."
                    rows={6}
                    className="min-h-36 resize-y"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {rootError ? <FieldError>{rootError}</FieldError> : null}
          </FieldGroup>
        </form>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button type="submit" form={FORM_ID} disabled={isPending}>
            {isPending ? <Spinner data-icon="inline-start" /> : null}
            Create bot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
