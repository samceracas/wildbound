import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge must know the custom @theme tokens in styles.css, otherwise it
 * treats `text-meta` (a font size) as a text colour and drops it next to `text-danger`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "kicker", "tiny", "meta", "label", "body", "title"],
      radius: ["control"],
    },
  },
});

/** shadcn's class helper: conditional classes, with Tailwind conflicts resolved (last one wins). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
