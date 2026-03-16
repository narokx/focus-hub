interface WeeklyNotesPanelProps {
  content: string;
  onUpdateNote: (content: string) => void;
}

export function WeeklyNotesPanel({ content, onUpdateNote }: WeeklyNotesPanelProps) {
  return (
    <div className="h-full -m-4">
      <textarea
        value={content}
        onChange={(event) => onUpdateNote(event.target.value)}
        placeholder="Write your weekly notes here..."
        className="w-full h-full bg-transparent border-0 outline-none resize-none p-4 text-sm text-foreground placeholder:text-muted-foreground"
      />
    </div>
  );
}
