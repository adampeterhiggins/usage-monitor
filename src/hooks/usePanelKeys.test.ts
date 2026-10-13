import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePanelKeys } from "./usePanelKeys";
import { hidePanel } from "../platform/windows";

const effects = vi.hoisted(() => ({ setup: undefined as undefined | (() => void | (() => void)) }));
vi.mock("react", () => ({
  useEffect: (setup: () => void | (() => void)) => { effects.setup = setup; },
}));
vi.mock("../platform/windows", () => ({ hidePanel: vi.fn() }));

describe("usePanelKeys", () => {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  let cleanup: void | (() => void);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { addEventListener, removeEventListener });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.unstubAllGlobals();
  });

  function mount(overrides: Partial<Parameters<typeof usePanelKeys>[0]> = {}) {
    const onRefreshAll = vi.fn();
    usePanelKeys({ refreshShortcut: "Return", blockingOverlay: false, canRefresh: true, onRefreshAll, ...overrides });
    cleanup = effects.setup?.();
    const capture = addEventListener.mock.calls.find((call) => call[2] === true)?.[1] as (event: KeyboardEvent) => void;
    const bubble = addEventListener.mock.calls.find((call) => call[2] !== true)?.[1] as (event: KeyboardEvent) => void;
    return { capture, bubble, onRefreshAll };
  }

  function keydown(key: string, modifiers: Partial<KeyboardEvent> = {}) {
    return {
      key, code: "", preventDefault: vi.fn(), stopPropagation: vi.fn(), ...modifiers,
    } as unknown as KeyboardEvent;
  }

  it("captures Enter and consumes it before focused menu triggers receive it", () => {
    const { capture, onRefreshAll } = mount();
    const event = keydown("Enter");
    capture(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onRefreshAll).toHaveBeenCalledOnce();
  });

  it("still consumes Enter when another refresh cannot start", () => {
    const { capture, onRefreshAll } = mount({ canRefresh: false });
    const event = keydown("Enter");
    capture(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onRefreshAll).not.toHaveBeenCalled();
  });

  it("leaves overlay keyboard interactions alone", () => {
    const { capture, onRefreshAll } = mount({ blockingOverlay: true });
    const event = keydown("Enter");
    capture(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(onRefreshAll).not.toHaveBeenCalled();
  });

  it("only consumes the configured shortcut, including its modifiers", () => {
    const { capture, onRefreshAll } = mount({ refreshShortcut: "Command+Return" });
    for (const event of [keydown("Enter"), keydown(" "), keydown("Enter", { ctrlKey: true })]) {
      capture(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
    }
    expect(onRefreshAll).not.toHaveBeenCalled();
    const event = keydown("Enter", { metaKey: true });
    capture(event);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onRefreshAll).toHaveBeenCalledOnce();
  });

  it("keeps Escape in the bubble phase and removes both listeners on cleanup", () => {
    const { capture, bubble } = mount();
    const event = keydown("Escape");
    capture(event);
    expect(hidePanel).not.toHaveBeenCalled();
    bubble(event);
    expect(hidePanel).toHaveBeenCalledOnce();
    cleanup?.();
    cleanup = undefined;
    expect(removeEventListener).toHaveBeenCalledWith("keydown", capture, true);
    expect(removeEventListener).toHaveBeenCalledWith("keydown", bubble);
  });
});
