# Testing the Health Check Proxy

## 1. Test Backend Proxy Endpoint Directly

### In Development (localhost:3001):
```bash
# Test with a valid health endpoint
curl "http://localhost:3001/api/proxy/health-check?url=http://httpbin.org/status/200&responseField=auto"

# Test with JSON health endpoint
curl "http://localhost:3001/api/proxy/health-check?url=https://api.github.com&responseField=auto"

# Test with invalid URL (should return 400)
curl "http://localhost:3001/api/proxy/health-check?url=invalid-url"
```

### In Production (via nginx):
```bash
# Test with relative path
curl "http://your-domain/api/proxy/health-check?url=http://httpbin.org/status/200&responseField=auto"
```

**Expected Response:**
```json
{
  "success": true,
  "proxied": true,
  "status": 200,
  "body": {...},
  "usedField": "success",
  "contentType": "application/json"
}
```

## 2. Test in Browser Console

Open browser DevTools Console and run:

```javascript
// Test proxy availability check
fetch('/api/proxy/health-check?url=http://example.com')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);

// Should return either:
// - { success: true, proxied: true, ... } if proxy works
// - { error: "..." } if proxy endpoint doesn't exist
```

## 3. Test with Node Health Check in UI

1. **Add a node with a service URL:**
   - Create a new node in your diagram
   - Open node settings
   - Add a service URL (e.g., `http://httpbin.org/status/200`)
   - Click "Check Now" button

2. **Check the console logs:**
   - Look for `[HealthCheck] Using proxy for: ...` messages
   - Verify the health status updates correctly

3. **Test Mixed Content Scenario (HTTPS page → HTTP endpoint):**
   - Serve your app over HTTPS (or use localhost with HTTPS)
   - Add a node with HTTP service URL (e.g., `http://httpbin.org/status/200`)
   - Check console for proxy usage logs

4. **Test CORS-Blocked Scenario:**
   - Add a node with a service URL that blocks CORS
   - The proxy should automatically be used as fallback

## 4. Check Network Tab in DevTools

1. Open DevTools → Network tab
2. Filter by "Fetch/XHR"
3. Perform a health check
4. Look for requests to `/api/proxy/health-check`
5. Verify:
   - Request URL includes the target service URL as query parameter
   - Response status is 200
   - Response body contains `"proxied": true`

## 5. Verify Service Worker Interception

1. Open DevTools → Application tab → Service Workers
2. Check that service worker is active
3. In Network tab, perform a health check
4. Look for requests that show "Service Worker" in the Size column
5. Requests to external health endpoints should be intercepted

## 6. Test Scenarios

### Scenario A: Mixed Content (HTTPS → HTTP)
- **Setup:** Serve app over HTTPS, test with HTTP endpoint
- **Expected:** Proxy should be used automatically
- **Verify:** Console shows `[HealthCheck] Using proxy for: http://...`

### Scenario B: CORS Blocked
- **Setup:** Test with endpoint that doesn't allow CORS
- **Expected:** Direct fetch fails, proxy is tried automatically
- **Verify:** Console shows `[HealthCheck] CORS error detected, trying proxy`

### Scenario C: Backend Unavailable
- **Setup:** Stop backend server
- **Expected:** Falls back to direct fetch
- **Verify:** Console shows `[HealthCheck] Proxy not available, using direct fetch`

### Scenario D: Proxy Success
- **Setup:** Normal health check with proxy-eligible URL
- **Expected:** Health check succeeds via proxy
- **Verify:** Network tab shows successful `/api/proxy/health-check` request

## 7. Enable Debug Logging

The health check service uses `console.debug()` for logging. To see all logs:

```javascript
// In browser console
localStorage.setItem('debug', 'true');
// Or filter console to show "Verbose" level messages
```

## 8. Quick Verification Checklist

- [ ] Backend proxy endpoint responds at `/api/proxy/health-check`
- [ ] Console shows proxy usage logs when appropriate
- [ ] Network tab shows proxy requests for external URLs
- [ ] Health checks succeed for HTTP endpoints on HTTPS pages
- [ ] Health checks succeed for CORS-blocked endpoints
- [ ] Fallback to direct fetch works when backend unavailable
- [ ] Service worker intercepts health check requests (if applicable)

