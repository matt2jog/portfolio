import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { reducer, toast } from "../../client/src/hooks/use-toast";

const originalSetTimeout = globalThis.setTimeout;

before(() => {
  globalThis.setTimeout = ((handler: TimerHandler) => {
    void handler;
    return 1;
  }) as typeof setTimeout;
});

after(() => {
  globalThis.setTimeout = originalSetTimeout;
});

test("toast reducer adds, limits, updates, dismisses, and removes notifications", () => {
  const first = { id: "first", title: "First", open: true };
  const second = { id: "second", title: "Second", open: true };
  let state = reducer({ toasts: [] }, { type: "ADD_TOAST", toast: first });
  state = reducer(state, { type: "ADD_TOAST", toast: second });
  assert.deepEqual(state.toasts.map(({ id }) => id), ["second"]);

  state = reducer(state, {
    type: "UPDATE_TOAST",
    toast: { id: "second", title: "Updated" },
  });
  state = reducer(state, {
    type: "UPDATE_TOAST",
    toast: { id: "missing", title: "Ignored" },
  });
  assert.equal(state.toasts[0]?.title, "Updated");

  state = reducer(state, { type: "DISMISS_TOAST", toastId: "missing" });
  assert.equal(state.toasts[0]?.open, true);
  state = reducer(state, { type: "DISMISS_TOAST", toastId: "second" });
  assert.equal(state.toasts[0]?.open, false);
  state = reducer(state, { type: "DISMISS_TOAST", toastId: "second" });
  state = reducer(state, { type: "DISMISS_TOAST" });

  assert.deepEqual(
    reducer(state, { type: "REMOVE_TOAST", toastId: "missing" }).toasts,
    state.toasts,
  );
  assert.deepEqual(
    reducer(state, { type: "REMOVE_TOAST", toastId: "second" }).toasts,
    [],
  );
  assert.deepEqual(reducer(state, { type: "REMOVE_TOAST" }).toasts, []);
});

test("toast handles update, explicit dismiss, and close callbacks", () => {
  const notification = toast({ title: "Saved" });
  assert.match(notification.id, /^\d+$/);
  notification.update({ id: "ignored", title: "Updated" });
  notification.dismiss();

  const callbackToast = toast({ title: "Closable" });
  const state = reducer(
    { toasts: [] },
    {
      type: "ADD_TOAST",
      toast: {
        id: callbackToast.id,
        open: true,
        onOpenChange: (open) => {
          if (!open) callbackToast.dismiss();
        },
      },
    },
  );
  state.toasts[0]?.onOpenChange?.(true);
  state.toasts[0]?.onOpenChange?.(false);
});
