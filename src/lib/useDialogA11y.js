import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog accessibility (SPEC §6.13 / §7.4): traps Tab focus inside the
 * dialog while it's open, closes on Escape, and returns focus to whatever
 * triggered it once it closes. Returns a ref to attach to the dialog's
 * outermost element.
 */
export function useDialogA11y(isOpen, onCancel) {
  const containerRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    previouslyFocused.current = document.activeElement;

    const focusables = () => Array.from(containerRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || []);
    const first = focusables()[0];
    (first || containerRef.current)?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
  }, [isOpen, onCancel]);

  return containerRef;
}
