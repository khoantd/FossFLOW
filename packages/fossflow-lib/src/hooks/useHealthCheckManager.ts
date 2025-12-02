import { useEffect, useRef, useCallback } from 'react';
import { useModelStore } from 'src/stores/modelStore';
import { checkServiceHealth, clearHealthCheckCache, type HealthStatus, type HealthCheckResponseField } from 'src/services/healthCheckService';
import { ModelItem } from 'src/types';

/**
 * Hook to manage periodic health checks for all nodes with service URLs
 * 
 * @param intervalMs - Interval between health checks in milliseconds (default: 60000 = 60 seconds)
 * @param enabled - Whether periodic checks are enabled (default: true)
 */
export const useHealthCheckManager = (
  intervalMs: number = 60000,
  enabled: boolean = true
): void => {
  const modelActions = useModelStore((state) => state.actions);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCheckingRef = useRef(false);

  /**
   * Checks health for a single node
   */
  const checkNodeHealth = useCallback(async (item: ModelItem): Promise<void> => {
    const serviceUrl = item.customProperties?.serviceUrl;
    if (!serviceUrl || !serviceUrl.trim()) {
      return;
    }

    const responseField = (item.customProperties?.healthCheckResponseField as HealthCheckResponseField) || 'auto';

    // Get latest state from store
    const currentState = modelActions.get();
    const currentItems = currentState.items;

    // Set status to checking
    const updatedProperties = {
      ...item.customProperties,
      healthStatus: 'checking' as HealthStatus
    };

    // Update the item in the store
    const updatedItems = currentItems.map((storeItem) => {
      if (storeItem.id === item.id) {
        return {
          ...storeItem,
          customProperties: updatedProperties
        };
      }
      return storeItem;
    });

    modelActions.set({ items: updatedItems }, true); // skipHistory for periodic updates

    // Clear cache to force fresh check
    clearHealthCheckCache(serviceUrl.trim());

    try {
      const result = await checkServiceHealth(serviceUrl.trim(), responseField);

      // Get latest state again (in case it changed)
      const latestState = modelActions.get();
      const latestItems = latestState.items;

      // Update with result
      const finalProperties = {
        ...item.customProperties,
        serviceUrl: serviceUrl.trim(),
        healthStatus: result.status,
        healthLastChecked: result.timestamp,
        healthError: result.error || ''
      };

      const finalItems = latestItems.map((storeItem) => {
        if (storeItem.id === item.id) {
          return {
            ...storeItem,
            customProperties: finalProperties
          };
        }
        return storeItem;
      });

      modelActions.set({ items: finalItems }, true); // skipHistory for periodic updates
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Get latest state again
      const latestState = modelActions.get();
      const latestItems = latestState.items;
      
      const errorProperties = {
        ...item.customProperties,
        serviceUrl: serviceUrl.trim(),
        healthStatus: 'unhealthy' as HealthStatus,
        healthLastChecked: new Date().toISOString(),
        healthError: errorMessage
      };

      const errorItems = latestItems.map((storeItem) => {
        if (storeItem.id === item.id) {
          return {
            ...storeItem,
            customProperties: errorProperties
          };
        }
        return storeItem;
      });

      modelActions.set({ items: errorItems }, true); // skipHistory for periodic updates
    }
  }, [modelActions]);

  /**
   * Checks health for all nodes with service URLs
   */
  const checkAllNodes = useCallback(async (): Promise<void> => {
    // Prevent concurrent checks
    if (isCheckingRef.current) {
      return;
    }

    isCheckingRef.current = true;

    try {
      // Get latest state from store
      const currentState = modelActions.get();
      const currentItems = currentState.items;

      // Find all items with serviceUrl
      const nodesWithServiceUrl = currentItems.filter((item) => {
        const serviceUrl = item.customProperties?.serviceUrl;
        return serviceUrl && serviceUrl.trim();
      });

      // Check health for each node sequentially to avoid overwhelming the network
      for (const node of nodesWithServiceUrl) {
        await checkNodeHealth(node);
        // Small delay between checks to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } finally {
      isCheckingRef.current = false;
    }
  }, [modelActions, checkNodeHealth]);

  /**
   * Set up periodic health checks
   */
  useEffect(() => {
    if (!enabled || intervalMs <= 0) {
      return;
    }

    // Perform initial check after a short delay
    const initialTimeout = setTimeout(() => {
      checkAllNodes();
    }, 2000); // Wait 2 seconds after mount

    // Set up periodic checks
    intervalRef.current = setInterval(() => {
      checkAllNodes();
    }, intervalMs);

    // Cleanup
    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs, checkAllNodes]);
};

