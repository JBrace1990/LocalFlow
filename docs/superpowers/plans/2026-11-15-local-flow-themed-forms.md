# Local Flow themed forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ordinary text inputs, selects, and textareas follow Local Flow's active theme consistently.

**Architecture:** Keep the existing app-wide stylesheet and CSS variables. Add a shared rule scoped to `.app-shell`, with explicit exclusions for specialized input types and appearance-aware native color schemes.

**Tech Stack:** React, Vite, CSS.

**Spec:** `docs/superpowers/specs/2026-11-15-local-flow-themed-forms-design.md`

## Global Constraints
- Preserve checkbox, radio, range, color, file, and hidden input behavior.
- Support current light and dark appearance modes and all accent palettes.
- Do not change form semantics or state.

## Review Focus
- Plain project dialog fields must not render white in dark mode; visually inspect modal.
- Settings controls must remain readable in light mode; visually inspect settings groups.
- Checkbox/radio controls retain native interaction and accent; verify computed style or browser interaction.
- Long/embedded fields must not overflow; inspect ComfyUI URL/workflow controls.
- Keyboard focus must remain visible; inspect focus outline.

---

### Task 1: Shared theme-aware controls

**Files:**
- Modify: `src/style.css`

**Interfaces:**
- Consumes: existing `.app-shell`, `.appearance-light`, `.appearance-dark`, `--panel2`, `--line`, and `--accent` variables.
- Produces: consistent styling for ordinary inputs, selects, and textareas throughout the app.

- [ ] Add a regression assertion to a CSS-focused Node test for global control selectors and specialized input exclusions.
- [ ] Run the focused test and confirm it fails before the stylesheet change.
- [ ] Add shared themed styles for text-like inputs, selects, and textareas, preserving existing dimensions and excluding checkboxes, radios, range, color, file, and hidden inputs.
- [ ] Run the focused test and confirm it passes.
- [ ] Inspect project creation and Settings in dark and light appearance in the running app.
- [ ] Run the production build and relevant test suite.
- [ ] Commit only `src/style.css`, its focused test, and the plan/spec docs; leave unrelated pre-existing working-tree changes unstaged.
