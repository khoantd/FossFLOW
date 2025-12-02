/**
 * Service for checking health status of service URLs
 */

export type HealthStatus = 'healthy' | 'unhealthy' | 'checking' | 'unknown';

export type HealthCheckResponseField = 'success' | 'status' | 'auto' | 'synthetic';

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
 * Returns the normalized URL and whether the original URL had a protocol
 */
function normalizeUrl(url: string): { url: string; hadProtocol: boolean } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { url: '', hadProtocol: false };
  }
  
  // If URL already has protocol, return as-is
  if (/^https?:\/\//i.test(trimmed)) {
    return { url: trimmed, hadProtocol: true };
  }
  
  // Default to http for internal/development servers
  // Users can explicitly specify https:// if needed
  return { url: `http://${trimmed}`, hadProtocol: false };
}

/**
 * Converts an HTTPS URL to HTTP
 */
function convertToHttp(url: string): string {
  return url.replace(/^https:\/\//i, 'http://');
}

/**
 * Checks if an error indicates that HTTPS might not be supported (network/SSL error)
 */
function isLikelyHttpsNotSupportedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  
  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();
  
  // Network errors that could indicate HTTPS not supported
  const networkErrorIndicators = [
    'failed to fetch',
    'networkerror',
    'network request failed',
    'networkerror when attempting to fetch',
    'upgrading insecure request',
    'ssl',
    'tls',
    'certificate',
    'err_ssl',
    'err_tls'
  ];
  
  // Check if it's a network error (not CORS, which means the request reached the server)
  const isNetworkError = networkErrorIndicators.some(indicator => 
    errorMessage.includes(indicator)
  );
  
  // If it's a TypeError with network-related message, it's likely HTTPS not supported
  if (errorName === 'typeerror' && isNetworkError) {
    return true;
  }
  
  // NetworkError type
  if (isNetworkError && !errorMessage.includes('cors') && !errorMessage.includes('cross-origin')) {
    return true;
  }
  
  return false;
}

/**
 * Checks if a response body indicates healthy status based on the specified field
 * Note: 'synthetic' mode is handled separately in tryHealthEndpoint and doesn't parse JSON
 */
function checkResponseBodyHealth(
  body: unknown,
  responseField: HealthCheckResponseField
): { healthy: boolean; usedField?: string } {
  // Synthetic mode should never call this function, but handle it gracefully
  if (responseField === 'synthetic') {
    return { healthy: false };
  }

  if (typeof body !== 'object' || body === null) {
    return { healthy: false };
  }

  const response = body as Record<string, unknown>;

  if (responseField === 'success') {
    if ('success' in response && response.success === true) {
      return { healthy: true, usedField: 'success' };
    }
    return { healthy: false };
  }

  if (responseField === 'status') {
    if ('status' in response) {
      const statusValue = response.status;
      if (
        statusValue === true ||
        statusValue === 'healthy' ||
        statusValue === 'ok'
      ) {
        return { healthy: true, usedField: 'status' };
      }
    }
    return { healthy: false };
  }

  // Auto mode: try success first, then status
  if ('success' in response && response.success === true) {
    return { healthy: true, usedField: 'success' };
  }

  if ('status' in response) {
    const statusValue = response.status;
    if (
      statusValue === true ||
      statusValue === 'healthy' ||
      statusValue === 'ok'
    ) {
      return { healthy: true, usedField: 'status' };
    }
  }

  return { healthy: false };
}

/**
 * Tries to check health at a specific endpoint
 */
async function tryHealthEndpoint(
  baseUrl: string,
  endpoint: string,
  timeoutMs: number,
  tryHttpFallback: boolean = false,
  responseField: HealthCheckResponseField = 'auto'
): Promise<{ success: boolean; error?: string; shouldTryHttp?: boolean }> {
  // If baseUrl is empty, endpoint is the full URL
  const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}${endpoint}` : endpoint;
  
  console.debug('[HealthCheck] Fetching URL:', url);
  
  // Use AbortController for browser compatibility (AbortSignal.timeout() not supported in all browsers)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    // For synthetic checks, use 'no-cors' mode to bypass CORS restrictions
    // This allows connectivity verification without reading response content
    const fetchMode = responseField === 'synthetic' ? 'no-cors' : 'cors';
    
    const response = await fetch(url, {
      method: 'GET',
      headers: responseField === 'synthetic' ? {} : {
        'Accept': 'application/json, text/plain, */*'
      },
      signal: controller.signal,
      mode: fetchMode,
      credentials: 'omit' // Don't send cookies
    });
    
    // For synthetic mode with no-cors, we can't read status code, but if fetch succeeds, service is reachable
    if (responseField === 'synthetic') {
      // With no-cors mode, response.status will always be 0 (opaque response)
      // But if we got here without an error, the service is reachable
      console.debug('[HealthCheck] Synthetic check passed - service is reachable (connectivity verified)');
      return { success: true };
    }
    
    // Check HTTP status code first - if not 2xx/3xx, return error
    if (response.status < 200 || response.status >= 400) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    // Try to parse JSON response body if Content-Type indicates JSON
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await response.json();
        const bodyCheck = checkResponseBodyHealth(body, responseField);
        
        if (bodyCheck.healthy) {
          console.debug(
            `[HealthCheck] Health check passed using ${bodyCheck.usedField} field`
          );
          return { success: true };
        }
        
        // If response field check failed, fall back to HTTP status code
        console.debug(
          `[HealthCheck] Response field check failed, using HTTP status code as fallback`
        );
      } catch (parseError) {
        // JSON parsing failed, fall back to HTTP status code
        console.debug('[HealthCheck] Failed to parse JSON response, using HTTP status code');
      }
    }
    
    // Fall back to HTTP status code check (2xx and 3xx are healthy)
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      // Handle abort/timeout errors
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        console.debug('[HealthCheck] Request timed out for:', url);
        return { success: false, error: 'Request timed out' };
      }
      
      // Check error message for specific error types
      const errorMessage = error.message.toLowerCase();
      const errorName = error.name.toLowerCase();
      const errorString = String(error).toLowerCase();
      
      // Check if browser's HTTPS-Only Mode upgraded HTTP to HTTPS and it failed
      // This happens when the browser intercepts HTTP requests and tries HTTPS instead
      // The error typically shows "CORS request did not succeed" because the HTTPS
      // connection itself fails (server doesn't support HTTPS) before CORS can be checked
      // Pattern: CORS error on HTTPS URL (not localhost) often indicates browser upgrade
      const isHttpsOnlyModeUpgrade = 
        errorString.includes('https-only mode') ||
        errorString.includes('upgrading insecure request') ||
        (errorString.includes('cors request did not succeed') && 
         url.toLowerCase().startsWith('https://') &&
         !url.toLowerCase().includes('localhost') &&
         !url.toLowerCase().includes('127.0.0.1') &&
         !url.toLowerCase().includes('.local'));
      
      if (isHttpsOnlyModeUpgrade) {
        // Browser upgraded HTTP to HTTPS, but server doesn't support HTTPS
        return { 
          success: false, 
          error: 'Browser upgraded HTTP to HTTPS, but server only supports HTTP. Try: 1) Disable HTTPS-Only Mode for this site in browser settings, 2) Configure server to support HTTPS, or 3) Use a reverse proxy with HTTPS.' 
        };
      }
      
      // CORS errors - these mean the request was blocked by browser security policy
      // For synthetic checks with no-cors mode, we shouldn't get CORS errors
      // But if we do (fallback case), treat them as connectivity failures
      // Check multiple sources: error message, name, string representation
      // Note: CORS errors often appear as TypeError with "Failed to fetch", but we need
      // explicit CORS indicators to distinguish from genuine network errors
      const isCorsError = errorMessage.includes('cors') || 
                         errorName.includes('cors') || 
                         errorMessage.includes('cross-origin') ||
                         errorMessage.includes('access-control') ||
                         errorString.includes('cross-origin request blocked') ||
                         errorString.includes('same origin policy') ||
                         errorString.includes('cors request did not succeed') ||
                         (error instanceof DOMException && 
                          error.name === 'NetworkError' && 
                          (errorString.includes('cors') || errorString.includes('cross-origin')));
      
      if (isCorsError) {
        // For synthetic checks, CORS errors shouldn't occur (we use no-cors mode)
        // But if they do, it means the service is not reachable
        if (responseField === 'synthetic') {
          return { success: false, error: 'Service unreachable or blocked' };
        }
        // Don't log CORS errors - browser already logs them, and they're expected for external services
        // Return a user-friendly message
        return { success: false, error: 'CORS blocked - service does not allow cross-origin requests from browser' };
      }
      
      // Log other errors for debugging
      console.debug('[HealthCheck] Error checking service:', url, error);
      
      // Check if this might be an HTTPS not supported error (only if we haven't already tried HTTP)
      if (tryHttpFallback && isLikelyHttpsNotSupportedError(error)) {
        return { success: false, error: 'Network error - service may be unreachable or blocked', shouldTryHttp: true };
      }
      
      // Network errors - check for network-related errors
      // Note: Some CORS errors may appear as NetworkError, but we've already checked for CORS above
      const isNetworkError = errorMessage.includes('failed to fetch') || 
                             errorMessage.includes('networkerror') ||
                             errorMessage.includes('network request failed') ||
                             errorMessage.includes('networkerror when attempting to fetch') ||
                             (errorName === 'typeerror' && errorMessage.includes('networkerror'));
      
      if (isNetworkError) {
        // Network errors could be due to:
        // - Service unreachable
        // - SSL/TLS issues
        // - Firewall blocking
        // - Mixed content (HTTPS page trying to fetch HTTP)
        return { success: false, error: 'Network error - service may be unreachable, blocked, or SSL issue' };
      }
      
      // Other Type errors (often related to URL parsing or fetch configuration)
      if (errorName === 'typeerror') {
        return { success: false, error: `Invalid request: ${error.message}` };
      }
      
      // Return the actual error message if available
      return { success: false, error: error.message || 'Unknown error occurred' };
    }
    
    // Non-Error objects
    if (typeof error === 'string') {
      return { success: false, error };
    }
    
    return { success: false, error: 'Unknown error occurred' };
  } finally {
    clearTimeout(timeoutId);
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
 * 
 * @param url - The service URL to check
 * @param responseField - Which field in the JSON response to check ('success', 'status', 'auto', or 'synthetic')
 */
export async function checkServiceHealth(
  url: string,
  responseField: HealthCheckResponseField = 'auto'
): Promise<HealthCheckResult> {
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
    console.debug('[HealthCheck] Using cached result for:', url);
    return cached.result;
  }
  
  console.debug('[HealthCheck] Checking service health for:', url);
  const { url: normalizedUrl, hadProtocol } = normalizeUrl(url);
  console.debug('[HealthCheck] Normalized URL:', normalizedUrl, 'hadProtocol:', hadProtocol);
  
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
  
  // Helper function to try health check with optional HTTP fallback
  const tryHealthCheckWithFallback = async (
    checkUrl: string,
    hasPathInUrl: boolean
  ): Promise<{ success: boolean; error?: string }> => {
    console.debug('[HealthCheck] Trying health check with URL:', checkUrl, 'hadProtocol:', hadProtocol, 'original URL:', url);
    
    // If user explicitly provided HTTP, use it as-is (don't try HTTPS fallback)
    const isExplicitHttp = checkUrl.startsWith('http://');
    const isExplicitHttps = checkUrl.startsWith('https://');
    
    if (hasPathInUrl) {
      // URL has a path, use it directly
      const result = await tryHealthEndpoint('', checkUrl, DEFAULT_TIMEOUT_MS, !hadProtocol && !isExplicitHttp, responseField);
      
      if (result.success) {
        return { success: true };
      }
      
      // If HTTPS failed and we should try HTTP, and original URL didn't have protocol
      // But don't try HTTP fallback if user explicitly provided HTTPS
      if (result.shouldTryHttp && !hadProtocol && !isExplicitHttps && checkUrl.startsWith('https://')) {
        const httpUrl = convertToHttp(checkUrl);
        console.debug('[HealthCheck] HTTPS failed, trying HTTP fallback:', httpUrl);
        const httpResult = await tryHealthEndpoint('', httpUrl, DEFAULT_TIMEOUT_MS, false, responseField);
        return httpResult;
      }
      
      return result;
    } else {
      // URL doesn't have a path, try common health endpoints
      const baseUrl = getBaseUrl(checkUrl);
      const isExplicitHttp = baseUrl.startsWith('http://');
      const isExplicitHttps = baseUrl.startsWith('https://');
      let useHttp = false; // Track if we've determined HTTPS doesn't work
      
      for (const endpoint of HEALTH_ENDPOINTS) {
        // Determine which URL to try:
        // - If user explicitly provided HTTP, use it as-is
        // - If user explicitly provided HTTPS, use it as-is
        // - If we determined HTTPS doesn't work, use HTTP
        // - Otherwise, use the baseUrl as-is (which might be HTTPS if no protocol was provided)
        let urlToTry: string;
        if (isExplicitHttp) {
          urlToTry = baseUrl; // Use HTTP as provided
        } else if (useHttp) {
          urlToTry = convertToHttp(baseUrl); // Convert HTTPS to HTTP for fallback
        } else {
          urlToTry = baseUrl; // Use as-is (could be HTTPS if no protocol was provided)
        }
        
        const result = await tryHealthEndpoint(urlToTry, endpoint, DEFAULT_TIMEOUT_MS, !hadProtocol && !useHttp && !isExplicitHttp, responseField);
        
        if (result.success) {
          return { success: true };
        }
        
        // If it's a CORS error, stop trying other endpoints (they'll all fail)
        if (result.error?.includes('CORS')) {
          return result;
        }
        
        // If HTTPS failed and we should try HTTP, and original URL didn't have protocol
        // But don't try HTTP fallback if user explicitly provided HTTPS or HTTP
        if (result.shouldTryHttp && !hadProtocol && !useHttp && !isExplicitHttps && !isExplicitHttp && baseUrl.startsWith('https://')) {
          // Switch to HTTP for all remaining endpoints
          useHttp = true;
          const httpBaseUrl = convertToHttp(baseUrl);
          console.debug('[HealthCheck] HTTPS failed, switching to HTTP for remaining endpoints:', httpBaseUrl + endpoint);
          const httpResult = await tryHealthEndpoint(httpBaseUrl, endpoint, DEFAULT_TIMEOUT_MS, false, responseField);
          if (httpResult.success) {
            return { success: true };
          }
          // Continue to next endpoint if HTTP also failed
        }
      }
      
      return { success: false, error: 'Service did not respond at any health endpoint' };
    }
  };
  
  // Try health check with automatic HTTP fallback if needed
  const urlHasPath = hasPath(normalizedUrl);
  const result = await tryHealthCheckWithFallback(normalizedUrl, urlHasPath);
  
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

