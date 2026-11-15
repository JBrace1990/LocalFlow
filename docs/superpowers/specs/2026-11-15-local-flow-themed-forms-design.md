# Local Flow themed forms design

## Intent
Make text fields, dropdowns, and multi-line fields consistently readable and themed throughout Local Flow, including project creation and settings pages.

## Scope and constraints
- Use the existing CSS theme variables and support all accent palettes in both light and dark appearance.
- Preserve native behavior and sizing for checkboxes, radio buttons, sliders, color pickers, file controls, and hidden inputs.
- Do not change form semantics or project/settings behavior.

## Approaches
- Style only the controls visible in the supplied screenshots: smallest patch, but leaves other plain controls inconsistent.
- Add shared theme-aware styling for ordinary form controls, while excluding specialized input types: selected because it fixes the class of regression globally.
- Replace controls with a component library: unnecessarily broad migration for a CSS cascade issue.

## Design
Define shared control background, foreground, border, focus, and native color-scheme from the active app theme. Keep existing control-specific classes able to refine layout, and leave specialized controls on their existing appearance. Verify the project-name dialog and Audio & Sound, LLM, ComfyUI, and General settings in dark and light appearance.
