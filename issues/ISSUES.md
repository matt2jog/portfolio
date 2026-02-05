# Urgent Issues & Recommended Fixes ✅

This document lists the highest-priority problems I found during the recent test run and development work, and gives focused, actionable fixes you can implement quickly.

---

## 1) Native click interception (HIGH) ⚠️
- Symptoms: Playwright native click() calls time out with "element click timed out because an element subtree intercepted pointer events" while programmatic dispatchEvent clicks succeed.
- Files involved (recently touched):
  - `client/src/components/BlueprintCard.tsx`
  - `client/src/index.css`
- Likely cause: an element in a *non-active* face (or an invisible overlay subtree) still receives pointer events (often an opacity-0 element or overlay that wasn't fully excluded from hit-testing).

Suggested fixes:
1. Short-term (tests): update the automation to use programmatic dispatchEvent click() where native click() fails — low-risk and quick.
2. Long-term (recommended): run a DOM probe at the click coordinates to find the blocking node (document.elementFromPoint(x,y)) and apply a narrow CSS fix for that selector:
   - e.g. `.project-cube-face.project-card--inactive, .project-cube-face.project-card--inactive * { pointer-events: none; }`
   - OR hide the inactive face from hit-testing with `visibility: hidden` when appropriate (careful with focus/animation requirements).
3. Verify with a native click E2E test that exercises each face.

Acceptance criteria:
- Native (real) click on any visible/active card succeeds in Playwright without timeout.
- No regressions to header icon clicks or hover behavior.

---

## 2) Divider pushback & description clipping (MED) ⚠️
- Symptoms: The description previously could visually touch the skills area. A pushback (8px) and translate on the divider were added, plus a transition.
- Files involved: `client/src/components/BlueprintCard.tsx` (recalc() logic), `client/src/index.css` (divider transition)

Suggested fixes / verification steps:
- Verify pushback at multiple breakpoints and with long descriptions (automated screenshot checks or storybook snapshots).
- Make the pushback amount configurable (constant at top of component) so it’s easy to tweak if needed.

Acceptance criteria:
- When overflow occurs, the description is clipped with an 8px gap to the skills; divider transitions smoothly.

---

## 3) Pointer-events adjustments were incomplete (MED) ⚠️
- Symptoms: `.project-card--inactive { pointer-events: none }` applied but a deeper subtree still intercepted clicks.
- Files: `client/src/index.css`, component markup in `BlueprintCard.tsx`.

Suggested fix:
- Narrowly extend the pointer-events rule to include child elements that may intercept pointer events: `.project-card--inactive, .project-card--inactive * { pointer-events: none; }`.
- Keep interactive header icons on active cards with `pointer-events: auto` explicitly on those selectors.

Notes:
- Do not broadly disable pointer-events on everything permanently; only when the face is inactive.

---

## 4) Automation evaluate() misuse (LOW) ⚠️
- Symptom: `SyntaxError: Unexpected identifier 'as'` when using evaluateHandle with TypeScript casts inside the browser evaluate function.

Fix:
- Use plain JS inside `page.evaluate()` (no TS types/casts); perform any casts/typing in Node test code, not inside evaluate.

---

## 5) Accessibility / keyboard activation (LOW) 💡
- Suggestion: Ensure cards can be activated with keyboard (Enter/Space) and that focus styles are visible. Add an automated keyboard activation test.

---

## Next steps (recommended order)
1. Run the DOM probe (document.elementFromPoint) at the card center to log the blocking node chain. Apply a narrow pointer-events fix to the exact selector found. ✅
2. Re-run the native click Playwright test until it succeeds. ✅
3. Add a short-term programmatic-click fallback in the tests while UI fix lands. ✅
4. Add a small regression E2E that clicks all visible/active cards on all faces. ✅

---

If you want, I can implement step (1) and make the minimal CSS change (only once we confirm the blocking selector). Would you like me to run the DOM probe now or should I add the `ISSUES.md` to a different place? 🙌
