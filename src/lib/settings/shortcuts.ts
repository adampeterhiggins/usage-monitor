export const DEFAULT_TOGGLE_SHORTCUT = "CommandOrControl+Shift+U";
export const DEFAULT_REFRESH_SHORTCUT = "Command+Return";

const MODIFIER_SYMBOLS: Record<string, string> = {
  CommandOrControl: "⌘",
  Command: "⌘",
  Cmd: "⌘",
  Super: "⌘",
  Meta: "⌘",
  Control: "⌃",
  Ctrl: "⌃",
  Alt: "⌥",
  Option: "⌥",
  Shift: "⇧",
};

const KEY_SYMBOLS: Record<string, string> = {
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
  Return: "⏎",
  Space: "Space",
  Backspace: "⌫",
  Delete: "⌦",
  Tab: "⇥",
  Escape: "⎋",
  Home: "↖",
  End: "↘",
  PageUp: "⇞",
  PageDown: "⇟",
};

export function acceleratorGlyphs(accelerator: string): string[] {
  return accelerator.split("+").map((part) => MODIFIER_SYMBOLS[part] ?? KEY_SYMBOLS[part] ?? part);
}

export function formatAccelerator(accelerator: string): string {
  return acceleratorGlyphs(accelerator).join("");
}

const SPECIAL_KEYS: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Enter: "Return",
  Backspace: "Backspace",
  Delete: "Delete",
  Tab: "Tab",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
};

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

const BARE_KEY_ALLOWED = new Set([
  "Return",
  "Space",
  "Tab",
  "Backspace",
  "Delete",
  "Up",
  "Down",
  "Left",
  "Right",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

const CODE_PUNCTUATION: Record<string, string> = {
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
};

function acceleratorKeyFromEvent(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  if (event.key in SPECIAL_KEYS) return SPECIAL_KEYS[event.key];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(event.key)) return event.key;

  const code = event.code;
  if (code in CODE_PUNCTUATION) return CODE_PUNCTUATION[code];
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);

  if (/^[0-9]$/.test(event.key)) return event.key;
  if (/^[a-zA-Z]$/.test(event.key)) return event.key.toUpperCase();
  return null;
}

export function acceleratorFromKeyDown(
  event: KeyboardEvent,
  options?: { allowBareKey?: boolean },
): string | null {
  const key = acceleratorKeyFromEvent(event);
  if (!key) return null;

  const modifiers: string[] = [];
  if (event.metaKey) modifiers.push("Command");
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");

  if (modifiers.length === 0) {
    const bareAllowed =
      options?.allowBareKey && (BARE_KEY_ALLOWED.has(key) || /^F([1-9]|1[0-9]|2[0-4])$/.test(key));
    if (!bareAllowed) return null;
  }

  return [...modifiers, key].join("+");
}

/** Tauri's global-shortcut plugin wants CommandOrControl rather than Command. */
export function toGlobalShortcut(accelerator: string): string {
  return accelerator
    .replace(/^Command\+/, "CommandOrControl+")
    .replace(/\+Command\+/, "+CommandOrControl+");
}
