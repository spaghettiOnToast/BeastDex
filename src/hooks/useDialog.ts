import { useState, useCallback } from "react";

export interface DialogState<T = void> {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** The data associated with the dialog (when T is not void) */
  data: T | null;
  /** Open the dialog */
  open: T extends void ? () => void : (data: T) => void;
  /** Close the dialog */
  close: () => void;
  /** Toggle the dialog */
  toggle: () => void;
  /** Set the open state directly */
  setOpen: (open: boolean) => void;
}

/**
 * Generic hook for managing dialog state
 *
 * @example
 * // Simple dialog without data
 * const confirmDialog = useDialog();
 * <Dialog open={confirmDialog.isOpen} onOpenChange={confirmDialog.setOpen} />
 * <button onClick={confirmDialog.open}>Open</button>
 *
 * @example
 * // Dialog with data
 * const editDialog = useDialog<Listing>();
 * <Dialog open={editDialog.isOpen} onOpenChange={editDialog.setOpen}>
 *   {editDialog.data && <EditForm listing={editDialog.data} />}
 * </Dialog>
 * <button onClick={() => editDialog.open(listing)}>Edit</button>
 */
export function useDialog<T = void>(): DialogState<T> {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<T | null>(null);

  const open = useCallback((newData?: T) => {
    if (newData !== undefined) {
      setData(newData);
    }
    setIsOpen(true);
  }, []) as DialogState<T>["open"];

  const close = useCallback(() => {
    setIsOpen(false);
    // Delay clearing data to allow for close animation
    setTimeout(() => setData(null), 200);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Delay clearing data to allow for close animation
      setTimeout(() => setData(null), 200);
    }
  }, []);

  return {
    isOpen,
    data,
    open,
    close,
    toggle,
    setOpen,
  };
}

/**
 * Hook for managing multiple related dialogs
 *
 * @example
 * const dialogs = useDialogs({
 *   confirm: null,
 *   edit: null as Listing | null,
 *   view: null as Beast | null,
 * });
 *
 * dialogs.confirm.open();
 * dialogs.edit.open(listing);
 */
export function useDialogs<T extends Record<string, unknown>>(
  _initial: T
): { [K in keyof T]: DialogState<NonNullable<T[K]>> } {
  // This is a factory function that creates multiple useDialog instances
  // For now, we'll use individual useDialog calls in components
  throw new Error(
    "useDialogs is not implemented. Use individual useDialog() calls instead."
  );
}
