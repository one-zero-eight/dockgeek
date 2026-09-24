import { ayuLight, dracula } from "thememirror";
import type { Extension } from "@codemirror/state";

/**
 * CodeMirror theme for the current app appearance.
 * @param isDark Whether the UI is in dark mode.
 * @returns Theme extension.
 */
export function getEditorTheme(isDark: boolean): Extension {
    return isDark ? dracula : ayuLight;
}
