"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { nanoid } from "nanoid"
import { ShuffleIcon, Trash2Icon } from "lucide-react"

import { deleteBot, updateBot } from "@/actions/bot"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { type UpdateBotInput, updateBotSchema } from "@/db/schema"

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

export type EditableBot = {
  id: string
  name: string
  avatar: string
  job: string
  instructions: string | null
}

type BotEditDialogProps = {
  bot: EditableBot
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function BotEditDialog({ bot, open, onOpenChange }: BotEditDialogProps) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = React.useState(false)
  const [isPending, startTransition] = React.useTransition()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [isDeleting, startDeleteTransition] = React.useTransition()
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  const isControlled = open !== undefined
  const dialogOpen = isControlled ? open : internalOpen

  const formId = React.useId()

  const form = useForm<UpdateBotInput>({
    resolver: zodResolver(updateBotSchema),
    defaultValues: {
      id: bot.id,
      avatar: bot.avatar,
      name: bot.name,
      job: bot.job,
      instructions: bot.instructions ?? "",
    },
  })

  React.useEffect(() => {
    if (dialogOpen) {
      form.reset({
        id: bot.id,
        avatar: bot.avatar,
        name: bot.name,
        job: bot.job,
        instructions: bot.instructions ?? "",
      })
    }
  }, [dialogOpen, bot, form])

  const handleOpenChange = (next: boolean) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
    if (!next) {
      form.reset({
        id: bot.id,
        avatar: bot.avatar,
        name: bot.name,
        job: bot.job,
        instructions: bot.instructions ?? "",
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

  function onSubmit(data: UpdateBotInput) {
    startTransition(async () => {
      try {
        const { bot: updated } = await updateBot(data)
        handleOpenChange(false)
        toast.add({
          title: `${updated.name} saved`,
          type: "success",
        })
        router.refresh()
      } catch (error) {
        form.setError("root", {
          message:
            error instanceof Error
              ? error.message
              : "Couldn't save your bot. Try again.",
        })
      }
    })
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      try {
        setDeleteError(null)
        await deleteBot({ id: bot.id })
        setConfirmOpen(false)
        handleOpenChange(false)
        toast.add({
          title: `${bot.name} deleted`,
          type: "success",
        })
        router.push("/")
        router.refresh()
      } catch (error) {
        setDeleteError(
          error instanceof Error
            ? error.message
            : "Couldn't delete your bot. Try again."
        )
      }
    })
  }

  const rootError = form.formState.errors.root?.message

  return (
    <>
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit bot</DialogTitle>
          <DialogDescription>
            Update its face, name, and behavior.
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

        <form id={formId} onSubmit={form.handleSubmit(onSubmit)}>
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
                      <FieldLabel htmlFor={`${formId}-avatar`}>
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
                    id={`${formId}-avatar`}
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
                  <FieldLabel htmlFor={`${formId}-name`}>Name</FieldLabel>
                  <Input
                    {...field}
                    id={`${formId}-name`}
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
                  <FieldLabel htmlFor={`${formId}-job`}>Role</FieldLabel>
                  <Input
                    {...field}
                    id={`${formId}-job`}
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
                  <FieldLabel htmlFor={`${formId}-instructions`}>
                    How should it behave?
                  </FieldLabel>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    id={`${formId}-instructions`}
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
          <Button
            type="button"
            variant="destructive"
            className="mr-auto"
            disabled={isPending || isDeleting}
            onClick={() => {
              setDeleteError(null)
              setConfirmOpen(true)
            }}
          >
            <Trash2Icon data-icon="inline-start" />
            Delete
          </Button>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button type="submit" form={formId} disabled={isPending}>
            {isPending ? <Spinner data-icon="inline-start" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent overlayProps={{ onClick: () => setConfirmOpen(false) }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{bot.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes {bot.name} and its chats. This
            action can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteError ? (
          <p className="text-center text-sm text-destructive">{deleteError}</p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isDeleting}
            onClick={handleDelete}
          >
            {isDeleting ? <Spinner data-icon="inline-start" /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
