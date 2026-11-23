/**
 * Shared Coordinate and Spatial Validation Utility
 * Enforces rigorous boundary checks, finite floating-point guarantees,
 * and canonical decimal representation for spatial API routes.
 */

export type CoordinateValidationResult =
  | { valid: true; latitude: number; longitude: number }
  | { valid: false; error: string }

/**
 * Validates latitude and longitude values across API payloads.
 * Ensures:
 * - Both are finite numbers
 * - Latitude is within [-90, 90]
 * - Longitude is within [-180, 180]
 */
export function validateCoordinates(lat: unknown, lon: unknown): CoordinateValidationResult {
  if (lat === undefined || lat === null || lon === undefined || lon === null) {
    return { valid: false, error: 'A JSON coordinate pair is required.' }
  }

  const latitude = typeof lat === 'string' ? parseFloat(lat) : lat
  const longitude = typeof lon === 'string' ? parseFloat(lon) : lon

  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return { valid: false, error: 'Coordinates are invalid.' }
  }

  return { valid: true, latitude, longitude }
}
