import React from 'react';
import { Send } from 'lucide-react';
import { Button } from '../../components/ui';

/** The typed route into the agent, available in every stage that accepts input. */
export function TextInput({
  value,
  onChange,
  onSend,
  disabled,
  grow,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  grow: boolean;
}) {
  return (
    <div className="relative flex items-center">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSend();
        }}
        placeholder={grow ? 'Type your update' : 'Or type your update'}
        className="rounded-sm w-full bg-raised border border-hair text-fg text-lead placeholder:text-muted px-4 pr-12 py-3 transition-colors focus:outline-none focus:border-accent"
      />
      <Button
        variant="icon"
        tone="accent"
        onClick={onSend}
        disabled={disabled}
        aria-label="Send"
        className="absolute right-2"
      >
        <Send size={18} />
      </Button>
    </div>
  );
}
