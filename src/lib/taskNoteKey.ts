export function toTaskNoteKey(taskId: string | null | undefined): string | null {
  if (!taskId || !taskId.trim()) return null;
  return `task-${taskId}`;
}
