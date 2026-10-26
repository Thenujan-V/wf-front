import { CanDeactivateFn } from '@angular/router';

/** Leaving a page with unsaved changes asks first. */
export const unsavedChangesGuard: CanDeactivateFn<{ hasUnsavedChanges(): boolean }> = (page) =>
  !page.hasUnsavedChanges() || window.confirm('Leave without saving? Your changes will be lost.');
