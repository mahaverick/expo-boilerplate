/**
 * @file The analytics port: the four names the manifest declares, from the
 * facade and the registry. Expo's own code imports the rest of the facade
 * from `./telemetry` directly.
 */
export { analyticsKey, type AnalyticsKey } from './event-registry'
export { getAnalyticsSessionIdFor, track } from './telemetry'
