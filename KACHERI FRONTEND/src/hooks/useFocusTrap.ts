import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

/**
 * Traps keyboard focus within a container element while active.
 * On activate: saves the previously focused element, focuses the first focusable child.
 * On Tab/Shift+Tab at boundaries: cycles focus within the container.
 * On deactivate: restores focus to the previously focused element.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!active || !ref.current) return;

    // Save the element that was focused before the trap activated
    previousFocusRef.current = document.activeElement;

    // Focus the first focusable element inside the container
    const firstFocusable = ref.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    if (firstFocusable) {
      firstFocusable.focus();
    } else {
      // If no focusable children, focus the container itself (needs tabIndex=-1)
      ref.current.focus();
    }

    const container = ref.current;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;

      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);

      // Restore focus to the previously focused element
      const prev = previousFocusRef.current;
      if (prev && prev instanceof HTMLElement && document.body.contains(prev)) {
        prev.focus();
      }
    };
  }, [active, ref]);
}
