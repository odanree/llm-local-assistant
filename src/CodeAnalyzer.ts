/**
 * CodeAnalyzer — re-export barrel (SRP refactor)
 *
 * ArchitectureValidator and SmartAutoCorrection now live in their own files.
 * This barrel keeps all existing import sites working without changes.
 * New code should import directly from the specific module.
 */
export type { LayerViolation, LayerValidationResult } from './architectureValidator';
export { ArchitectureValidator } from './architectureValidator';
export { SmartAutoCorrection } from './smartAutoCorrection';
export { default } from './smartAutoCorrection';
