import { useMemo } from 'react';
import { useHistory, useLocation } from 'react-router-dom';

/**
 * Where a page opened from the home page's Settings drawer should send the
 * user when they press back.
 *
 * Settings is a drawer on `/dashboard`, not a route, so a plain
 * `history.goBack()` lands on a home page with the drawer shut and reads as
 * "redirected home". Settings marks the pages it opens with
 * `{ fromSettings: true }`; this reopens the drawer on the way back.
 *
 * @returns A back handler for `PageHeader`, or `undefined` when the page was
 * not opened from Settings (the header then keeps its default behaviour).
 */
export function useBackToSettings(): (() => void) | undefined {
  const history = useHistory();
  const location = useLocation<{ fromSettings?: boolean } | undefined>();
  const fromSettings = !!location.state?.fromSettings;

  return useMemo(
    () =>
      fromSettings
        ? () => history.replace('/dashboard', { openSettings: true })
        : undefined,
    [fromSettings, history]
  );
}
