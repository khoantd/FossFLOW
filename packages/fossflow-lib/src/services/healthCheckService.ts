/**
 * Service for checking health status of service URLs
 */

export type HealthStatus = 'healthy' | 'unhealthy' | 'checking' | 'unknown';

export interface HealthCheckResult {
  status: HealthStatus;
  error?: string;
  timestamp: string;
}

/**
 * Common health check endpoint paths to try
 */
const HEALTH_ENDPOINTS = ['/health', '/healthz', '/status', '/'];

/**
 * Default timeout for health checks (5 seconds)
 */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Cache for health check results to avoid excessive requests
 */
const healthCheckCache = new Map<string, { result: HealthCheckResult; timestamp: number }>();
const CACHE_DURATION_MS = 10000; // Cache for 10 seconds

/**
 * Normalizes a URL by ensuring it has a protocol
 */
function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }
  
  // If URL already has protocol, return as-is
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  
  // Default to https, fallback to http if needed
  return `https://${trimmed}`;
}

/**
 * Tries to check health at a specific endpoint
 */
async function tryHealthEndpoint(
  baseUrl: string,
  endpoint: string,
  timeoutMs: number
): Promise<{ success: boolean; error?: string }> {
  // If baseUrl is empty, endpoint is the full URL
  const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}${endpoint}` : endpoint;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*'
      },
      signal: AbortSignal.timeout(timeoutMs),
      mode: 'cors'
    });
    
    // Consider 2xx and 3xx status codes as healthy
    if (response.status >= 200 && response.status < 400) {
      return { success: true };
    }
    
    return { success: false, error: `HTTP ${response.status}` };
  } catch (error) {
    if (error instanceof Error) {
      // Handle specific error types
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        return { success: false, error: 'Timeout' };
      }
      if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
        return { success: false, error: 'CORS error - service may not allow cross-origin requests' };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Unknown error' };
  }
}

/**
 * Checks if a URL already contains a path
 */
function hasPath(url: string): boolean {
  try {
    const urlObj = new URL(url);
    // Check if pathname exists and is more than just '/'
    return urlObj.pathname.length > 1;
  } catch {
    return false;
  }
}

/**
 * Gets the base URL without path
 */
function getBaseUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}`;
  } catch {
    return url;
  }
}

/**
 * Checks the health of a service URL
 * If URL contains a path, uses it directly. Otherwise tries multiple common health endpoints.
 */
export async function checkServiceHealth(url: string): Promise<HealthCheckResult> {
  if (!url || !url.trim()) {
    return {
      status: 'unknown',
      error: 'No URL provided',
      timestamp: new Date().toISOString()
    };
  }
  
  // Check cache first
  const cacheKey = url.trim().toLowerCase();
  const cached = healthCheckCache.get(cacheKey);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < CACHE_DURATION_MS) {
    return cached.result;
  }
  
  const normalizedUrl = normalizeUrl(url);
  
  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    const result: HealthCheckResult = {
      status: 'unknown',
      error: 'Invalid URL format',
      timestamp: new Date().toISOString()
    };
    healthCheckCache.set(cacheKey, { result, timestamp: now });
    return result;
  }
  
  // If URL already has a path, use it directly
  if (hasPath(normalizedUrl)) {
    const result = await tryHealthEndpoint('', normalizedUrl, DEFAULT_TIMEOUT_MS);
    
    if (result.success) {
      const healthResult: HealthCheckResult = {
        status: 'healthy',
        timestamp: new Date().toISOString()
      };
      healthCheckCache.set(cacheKey, { result: healthResult, timestamp: now });
      return healthResult;
    }
    
    const healthResult: HealthCheckResult = {
      status: 'unhealthy',
      error: result.error || 'Service did not respond',
      timestamp: new Date().toISOString()
    };
    healthCheckCache.set(cacheKey, { result: healthResult, timestamp: now });
    return healthResult;
  }
  
  // URL doesn't have a path, try common health endpoints
  const baseUrl = getBaseUrl(normalizedUrl);
  
  for (const endpoint of HEALTH_ENDPOINTS) {
    const result = await tryHealthEndpoint(baseUrl, endpoint, DEFAULT_TIMEOUT_MS);
    
    if (result.success) {
      const healthResult: HealthCheckResult = {
        status: 'healthy',
        timestamp: new Date().toISOString()
      };
      healthCheckCache.set(cacheKey, { result: healthResult, timestamp: now });
      return healthResult;
    }
    
    // If it's a CORS error, stop trying other endpoints (they'll all fail)
    if (result.error?.includes('CORS')) {
      const healthResult: HealthCheckResult = {
        status: 'unhealthy',
        error: result.error,
        timestamp: new Date().toISOString()
      };
      healthCheckCache.set(cacheKey, { result: healthResult, timestamp: now });
      return healthResult;
    }
  }
  
  // All endpoints failed
  const healthResult: HealthCheckResult = {
    status: 'unhealthy',
    error: 'Service did not respond at any health endpoint',
    timestamp: new Date().toISOString()
  };
  healthCheckCache.set(cacheKey, { result: healthResult, timestamp: now });
  return healthResult;
}

/**
 * Clears the health check cache (useful for manual refresh)
 */
export function clearHealthCheckCache(url?: string): void {
  if (url) {
    healthCheckCache.delete(url.trim().toLowerCase());
  } else {
    healthCheckCache.clear();
  }
}

