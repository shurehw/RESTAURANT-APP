import { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Hook to prevent accidental navigation away from a form with unsaved changes
 *
 * Usage:
 * ```tsx
 * const { markDirty, markClean } = useUnsavedChangesGuard();
 *
 * // Mark form as dirty when user makes changes
 * const handleChange = () => {
 *   markDirty();
 * };
 *
 * // Mark form as clean after successful save
 * const handleSave = async () => {
 *   await saveData();
 *   markClean();
 * };
 * ```
 */
export function useUnsavedChangesGuard(options: {
  message?: string;
  enabled?: boolean;
} = {}) {
  const {
    message = 'You have unsaved changes. Are you sure you want to leave?',
    enabled = true,
  } = options;

  const isDirtyRef = useRef(false);
  const router = useRouter();

  const markDirty = useCallback(() => {
    isDirtyRef.current = true;
  }, []);

  const markClean = useCallback(() => {
    isDirtyRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Prevent browser navigation (back/forward/close tab)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = message; // Most browsers ignore custom message
        return message;
      }
    };

    // Prevent Next.js navigation
    const handleRouteChange = () => {
      if (isDirtyRef.current) {
        const confirmed = window.confirm(message);
        if (!confirmed) {
          // Prevent navigation
          throw new Error('Route change cancelled by user');
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Note: Next.js App Router doesn't have routeChangeStart event
    // We'll use a custom implementation via Link wrapper or manual checks

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, message]);

  return {
    markDirty,
    markClean,
    isDirty: () => isDirtyRef.current,
  };
}

/**
 * Higher-order function to wrap navigation functions with unsaved changes check
 *
 * Usage:
 * ```tsx
 * const guardedPush = useNavigationGuard(router.push, isDirty);
 *
 * <button onClick={() => guardedPush('/other-page')}>
 *   Navigate Away
 * </button>
 * ```
 */
export function useNavigationGuard<T extends (...args: any[]) => any>(
  navigationFn: T,
  isDirty: boolean,
  message = 'You have unsaved changes. Are you sure you want to leave?'
): T {
  return useCallback(
    ((...args: Parameters<T>) => {
      if (isDirty) {
        const confirmed = window.confirm(message);
        if (!confirmed) {
          return;
        }
      }
      return navigationFn(...args);
    }) as T,
    [navigationFn, isDirty, message]
  );
}

/**
 * Form wrapper component that tracks field changes
 * Automatically marks form as dirty when any input changes
 *
 * Usage:
 * ```tsx
 * <FormWithUnsavedGuard onSubmit={handleSubmit}>
 *   <input name="field1" />
 *   <input name="field2" />
 *   <button type="submit">Save</button>
 * </FormWithUnsavedGuard>
 * ```
 */
export function FormWithUnsavedGuard({
  children,
  onSubmit,
  message,
  ...props
}: React.FormHTMLAttributes<HTMLFormElement> & {
  message?: string;
}) {
  const { markDirty, markClean } = useUnsavedChangesGuard({ message });

  const handleChange = useCallback(() => {
    markDirty();
  }, [markDirty]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (onSubmit) {
        await onSubmit(e);
      }
      markClean();
    },
    [onSubmit, markClean]
  );

  return (
    <form {...props} onSubmit={handleSubmit} onChange={handleChange}>
      {children}
    </form>
  );
}
