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
 * Cache for backend proxy availability
 */
let proxyAvailable: boolean | null = null;
let proxyAvailabilityCheckedAt: number | null = null;
const PROXY_AVAILABILITY_CACHE_MS = 60000; // Re-check every 60 seconds

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
 * Gets the backend base URL for proxy requests
 */
function getBackendBaseUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  
  // In development, backend runs on localhost:3001
  // In production, use relative path (nginx proxy)
  const isDevelopment = window.location.hostname === 'localhost' && window.location.port === '3000';
  return isDevelopment ? 'http://localhost:3001' : '';
}

/**
 * Checks if backend proxy endpoint is available
 */
async function isProxyAvailable(): Promise<boolean> {
  const now = Date.now();
  
  // Return cached result if still valid
  if (
    proxyAvailable !== null &&
    proxyAvailabilityCheckedAt !== null &&
    (now - proxyAvailabilityCheckedAt) < PROXY_AVAILABILITY_CACHE_MS
  ) {
    return proxyAvailable;
  }
  
  const backendBaseUrl = getBackendBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout for availability check
  
  try {
    const proxyCheckUrl = backendBaseUrl
      ? `${backendBaseUrl}/api/proxy/health-check?url=http://example.com`
      : '/api/proxy/health-check?url=http://example.com';
    
    const response = await fetch(proxyCheckUrl, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    proxyAvailable = response.ok || response.status === 400; // 400 means endpoint exists (invalid URL is expected)
    proxyAvailabilityCheckedAt = now;
    return proxyAvailable;
  } catch {
    clearTimeout(timeoutId);
    proxyAvailable = false;
    proxyAvailabilityCheckedAt = now;
    return false;
  }
}

/**
 * Tries to check health using backend proxy
 */
async function tryHealthEndpointViaProxy(
  url: string,
  timeoutMs: number,
  responseField: HealthCheckResponseField
): Promise<{ success: boolean; error?: string }> {
  const backendBaseUrl = getBackendBaseUrl();
  const proxyUrl = backendBaseUrl
    ? `${backendBaseUrl}/api/proxy/health-check?url=${encodeURIComponent(url)}&responseField=${responseField}`
    : `/api/proxy/health-check?url=${encodeURIComponent(url)}&responseField=${responseField}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Proxy request failed' }));
      return { success: false, error: errorData.error || `Proxy returned ${response.status}` };
    }
    
    const data = await response.json();
    
    // Proxy returns { success: boolean, proxied: true, ... }
    // For synthetic mode, success: true means connectivity was verified (regardless of HTTP status)
    // For other modes, success: true means health check passed based on response body/status
    if (data.success === true) {
      console.debug('[HealthCheck] Proxy check succeeded:', {
        responseField,
        status: data.status,
        reachable: data.reachable,
        proxied: data.proxied
      });
      return { success: true };
    }
    
    // If proxy returned an error, use it; otherwise provide a generic message
    return { success: false, error: data.error || 'Health check failed via proxy' };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { success: false, error: 'Proxy request timed out' };
      }
      return { success: false, error: `Proxy error: ${error.message}` };
    }
    
    return { success: false, error: 'Proxy request failed' };
  }
}

/**
 * Determines if a request should use proxy
 */
function shouldUseProxy(url: string, responseField: HealthCheckResponseField): boolean {
  if (typeof window === 'undefined') {
    return false; // Server-side, no proxy needed
  }
  
  // Use proxy if:
  // 1. HTTP target + synthetic mode (explicit case: HTTP protocol with synthetic type always uses proxy)
  // 2. HTTPS page trying to fetch HTTP (mixed content)
  // 3. Synthetic mode in general (which can have mixed content restrictions or network errors)
  //    Synthetic mode benefits from proxy to bypass browser restrictions
  const isHttpsPage = window.location.protocol === 'https:';
  const isHttpTarget = url.toLowerCase().startsWith('http://');
  const isSyntheticMode = responseField === 'synthetic';
  
  // Explicit case: HTTP protocol + synthetic mode always uses proxy
  if (isHttpTarget && isSyntheticMode) {
    return true;
  }
  
  // For synthetic mode in general, always try proxy first (works for both HTTP and HTTPS pages)
  // For other modes, only use proxy for mixed content scenarios (HTTPS page + HTTP target)
  return isSyntheticMode || (isHttpsPage && isHttpTarget);
}

/**
 * Checks if an error indicates mixed content blocking (HTTPS page trying to fetch HTTP with no-cors)
 * This is a browser security restriction that blocks no-cors requests from HTTPS pages to HTTP endpoints
 */
function isMixedContentError(error: unknown, url: string, responseField: HealthCheckResponseField): boolean {
  // Only check for mixed content in synthetic mode (which uses no-cors)
  if (responseField !== 'synthetic') {
    return false;
  }
  
  // Check if the page is served over HTTPS
  if (typeof window === 'undefined' || window.location.protocol !== 'https:') {
    return false;
  }
  
  // Check if the target URL is HTTP (not HTTPS)
  if (!url.toLowerCase().startsWith('http://')) {
    return false;
  }
  
  // Mixed content errors typically appear as TypeError or NetworkError with "Failed to fetch"
  if (!(error instanceof Error)) {
    return false;
  }
  
  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();
  const errorString = String(error).toLowerCase();
  
  // Mixed content errors appear as network errors when using no-cors mode
  // The error can be "TypeError: NetworkError when attempting to fetch resource."
  // or "Failed to fetch" or other network-related errors
  const isNetworkError = errorMessage.includes('failed to fetch') || 
                         errorMessage.includes('networkerror') ||
                         errorMessage.includes('network request failed') ||
                         errorMessage.includes('networkerror when attempting to fetch') ||
                         errorMessage.includes('when attempting to fetch resource') ||
                         (errorName === 'typeerror' && errorMessage.includes('networkerror')) ||
                         (error instanceof DOMException && error.name === 'NetworkError') ||
                         (errorName === 'typeerror' && errorString.includes('networkerror'));
  
  // Exclude CORS errors (already handled separately)
  const isCorsRelated = errorMessage.includes('cors') || 
                        errorMessage.includes('cross-origin') ||
                        errorString.includes('cors') ||
                        errorString.includes('cross-origin');
  
  const isMixedContent = isNetworkError && !isCorsRelated;
  
  if (isMixedContent) {
    console.debug('[HealthCheck] Detected mixed content error:', {
      errorName,
      errorMessage,
      url,
      responseField,
      pageProtocol: window.location.protocol
    });
  }
  
  return isMixedContent;
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
  
  // Check if we should use proxy
  const useProxy = shouldUseProxy(url, responseField);
  const isSyntheticMode = responseField === 'synthetic';
  
  if (useProxy) {
    // For synthetic mode, always try proxy directly (skip availability check)
    // Availability check might fail due to network issues, but proxy might still work
    // For other modes, check availability first
    if (isSyntheticMode) {
      // Explicit case: HTTP protocol + synthetic mode always uses proxy as primary method
      const isHttpTarget = url.toLowerCase().startsWith('http://');
      if (isHttpTarget) {
        console.debug('[HealthCheck] HTTP protocol + synthetic mode: using proxy for:', url);
      } else {
        console.debug('[HealthCheck] Synthetic mode: trying proxy directly for:', url);
      }
      const proxyResult = await tryHealthEndpointViaProxy(url, timeoutMs, responseField);
      
      if (proxyResult.success) {
        return { success: true };
      }
      
      // If proxy failed, log and fall through to direct fetch as last resort
      console.debug('[HealthCheck] Proxy failed for synthetic mode, falling back to direct fetch:', proxyResult.error);
      // Fall through to direct fetch
    } else {
      // For non-synthetic modes, check availability first
      const proxyAvailable = await isProxyAvailable();
      if (proxyAvailable) {
        console.debug('[HealthCheck] Using proxy for:', url);
        const proxyResult = await tryHealthEndpointViaProxy(url, timeoutMs, responseField);
        
        if (proxyResult.success) {
          return { success: true };
        }
        
        // If proxy failed but it's not a critical error, fall through to direct fetch
        // Only fall through if it's a timeout or network error, not if it's a health check failure
        if (proxyResult.error?.includes('Proxy error') || proxyResult.error?.includes('timed out')) {
          console.debug('[HealthCheck] Proxy failed, falling back to direct fetch:', proxyResult.error);
          // Fall through to direct fetch
        } else {
          // Proxy worked but health check failed - return the result
          return proxyResult;
        }
      } else {
        console.debug('[HealthCheck] Proxy not available, using direct fetch');
      }
    }
  }
  
  console.debug('[HealthCheck] Fetching URL directly:', url);
  
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
          // Try proxy as fallback for synthetic mode CORS errors
          const proxyAvailable = await isProxyAvailable();
          if (proxyAvailable) {
            console.debug('[HealthCheck] CORS error in synthetic mode, trying proxy');
            const proxyResult = await tryHealthEndpointViaProxy(url, timeoutMs, responseField);
            if (proxyResult.success) {
              return { success: true };
            }
          }
          return { success: false, error: 'Service unreachable or blocked' };
        }
        
        // Try proxy as fallback for CORS errors
        const proxyAvailable = await isProxyAvailable();
        if (proxyAvailable) {
          console.debug('[HealthCheck] CORS error detected, trying proxy');
          const proxyResult = await tryHealthEndpointViaProxy(url, timeoutMs, responseField);
          if (proxyResult.success) {
            return { success: true };
          }
          // If proxy also fails, return the original CORS error
        }
        
        // Don't log CORS errors - browser already logs them, and they're expected for external services
        // Return a user-friendly message
        return { success: false, error: 'CORS blocked - service does not allow cross-origin requests from browser' };
      }
      
      // Check for mixed content errors (HTTPS page trying to fetch HTTP with no-cors)
      // This must be checked before generic network error handling
      const mixedContentCheck = isMixedContentError(error, url, responseField);
      if (mixedContentCheck) {
        console.debug('[HealthCheck] Mixed content error detected, trying proxy');
        // Try proxy as fallback for mixed content errors
        const proxyAvailable = await isProxyAvailable();
        if (proxyAvailable) {
          const proxyResult = await tryHealthEndpointViaProxy(url, timeoutMs, responseField);
          if (proxyResult.success) {
            return { success: true };
          }
        }
        return {
          success: false,
          error: 'Mixed content blocked - HTTPS pages cannot fetch HTTP endpoints in synthetic mode. Solutions: 1) Use HTTPS endpoint, 2) Use a different health check mode (auto/success/status), 3) Serve the app over HTTP for development, or 4) Enable backend proxy.'
        };
      }
      
      // Log other errors for debugging
      console.debug('[HealthCheck] Error checking service:', url, error, {
        errorName: error.name,
        errorMessage: error.message,
        responseField,
        pageProtocol: typeof window !== 'undefined' ? window.location.protocol : 'unknown'
      });
      
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
                             errorMessage.includes('when attempting to fetch resource') ||
                             (errorName === 'typeerror' && errorMessage.includes('networkerror'));
      
      if (isNetworkError) {
        // For synthetic mode, try proxy as fallback for network errors
        // Network errors in synthetic mode could be due to browser restrictions,
        // firewall blocking, or connectivity issues that proxy can bypass
        // Skip availability check for synthetic mode (same as initial attempt) since
        // availability check might fail due to network issues, but proxy might still work
        if (responseField === 'synthetic') {
          console.debug('[HealthCheck] Network error in synthetic mode, trying proxy as fallback');
          const proxyResult = await tryHealthEndpointViaProxy(url, timeoutMs, responseField);
          if (proxyResult.success) {
            return { success: true };
          }
          // If proxy also failed, continue with error message below
          
          // Network errors in synthetic mode with no-cors could be due to:
          // - Service unreachable (firewall, network issue, service down)
          // - DNS resolution failure
          // - Connection timeout
          // - Browser security restrictions (mixed content if HTTPS page)
          const pageProtocol = typeof window !== 'undefined' ? window.location.protocol : 'unknown';
          if (pageProtocol === 'https:') {
            return { 
              success: false, 
              error: 'Network error in synthetic mode - service may be unreachable, blocked by firewall, or mixed content restriction (HTTPS page cannot fetch HTTP with no-cors). Try: 1) Verify service is running and accessible, 2) Check firewall/network settings, 3) Use a different health check mode, or 4) Use HTTPS endpoint.'
            };
          } else {
            return { 
              success: false, 
              error: 'Network error in synthetic mode - service may be unreachable, blocked by firewall, or network connectivity issue. Try: 1) Verify service is running and accessible, 2) Check firewall/network settings, 3) Test connectivity from browser directly, or 4) Use a different health check mode.'
            };
          }
        }
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

