/**
 * AppSettings - Legacy re-export for backward compatibility
 * The actual implementation has been refactored into modular components in ./settings/
 *
 * This file maintains backward compatibility for existing imports.
 * New code should import from './settings' instead.
 */

export { AppSettingsDialog, type AppSection } from './settings';
