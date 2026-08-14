type ToastTone = "success" | "error";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

type Listener = (toasts: Toast[]) => void;

let nextId = 1;
let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

function push(tone: ToastTone, title: string, description?: string) {
  const toast: Toast = { id: nextId++, tone, title, description };
  toasts = [...toasts, toast];
  emit();
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== toast.id);
    emit();
  }, 4200);
}

export const toast = {
  success(title: string, opts?: { description?: string }) {
    push("success", title, opts?.description);
  },
  error(title: string, opts?: { description?: string }) {
    push("error", title, opts?.description);
  },
};

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}
