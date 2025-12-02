import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Slider, Box, TextField, Stack, Chip, IconButton, Button, CircularProgress, Typography, Alert, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { Add as AddIcon, Close as CloseIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { ModelItem, ViewItem } from 'src/types';
import { RichTextEditor } from 'src/components/RichTextEditor/RichTextEditor';
import { useModelItem } from 'src/hooks/useModelItem';
import { useModelStore } from 'src/stores/modelStore';
import { DeleteButton } from '../../components/DeleteButton';
import { Section } from '../../components/Section';
import { checkServiceHealth, clearHealthCheckCache, type HealthStatus, type HealthCheckResponseField } from 'src/services/healthCheckService';

export type NodeUpdates = {
  model: Partial<ModelItem>;
  view: Partial<ViewItem>;
};

interface Props {
  node: ViewItem;
  onModelItemUpdated: (updates: Partial<ModelItem>) => void;
  onViewItemUpdated: (updates: Partial<ViewItem>) => void;
  onDeleted: () => void;
}

export const NodeSettings = ({
  node,
  onModelItemUpdated,
  onViewItemUpdated,
  onDeleted
}: Props) => {
  const modelItem = useModelItem(node.id);
  const modelActions = useModelStore((state) => state.actions);
  const icons = useModelStore((state) => state.icons);
  
  // Local state for smooth slider interaction
  const currentIcon = icons.find(icon => icon.id === modelItem?.icon);
  const [localScale, setLocalScale] = useState(currentIcon?.scale || 1);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Tags and custom properties state
  const [newTag, setNewTag] = useState('');
  const [newPropertyKey, setNewPropertyKey] = useState('');
  const [newPropertyValue, setNewPropertyValue] = useState('');

  // Health check state
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [healthCheckError, setHealthCheckError] = useState<string | undefined>(undefined);

  const tags = modelItem?.tags ?? [];
  const customProperties = modelItem?.customProperties ?? {};
  
  // Extract health check related properties
  const serviceUrl = customProperties.serviceUrl || '';
  const healthStatus = (customProperties.healthStatus as HealthStatus) || 'unknown';
  const healthLastChecked = customProperties.healthLastChecked || '';
  const healthError = customProperties.healthError || '';
  const healthCheckResponseField = (customProperties.healthCheckResponseField as HealthCheckResponseField) || 'auto';

  // Pulsing animation for unhealthy and checking states
  const pulseAnimation = useMemo(() => keyframes`
    0% {
      opacity: 0.5;
      transform: scale(0.9);
    }
    50% {
      opacity: 1;
      transform: scale(1.1);
    }
    100% {
      opacity: 0.5;
      transform: scale(0.9);
    }
  `, []);

  // Update local scale when icon changes
  useEffect(() => {
    setLocalScale(currentIcon?.scale || 1);
  }, [currentIcon?.scale]);

  // Debounced update to store
  const updateIconScale = useCallback((scale: number) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      const updatedIcons = icons.map(icon => 
        icon.id === modelItem?.icon 
          ? { ...icon, scale }
          : icon
      );
      modelActions.set({ icons: updatedIcons });
    }, 100); // 100ms debounce
  }, [icons, modelItem?.icon, modelActions]);

  // Handle slider change with local state + debounced store update
  const handleScaleChange = useCallback((e: Event, newScale: number | number[]) => {
    const scale = newScale as number;
    setLocalScale(scale); // Immediate UI update
    updateIconScale(scale); // Debounced store update
  }, [updateIconScale]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleAddTag = useCallback(() => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      const updatedTags = [...tags, newTag.trim()];
      onModelItemUpdated({ tags: updatedTags });
      setNewTag('');
    }
  }, [newTag, tags, onModelItemUpdated]);

  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      const updatedTags = tags.filter((tag) => tag !== tagToRemove);
      onModelItemUpdated({ tags: updatedTags });
    },
    [tags, onModelItemUpdated]
  );

  const handleAddProperty = useCallback(() => {
    if (newPropertyKey.trim() && !customProperties[newPropertyKey.trim()]) {
      const updatedProperties = {
        ...customProperties,
        [newPropertyKey.trim()]: newPropertyValue.trim()
      };
      onModelItemUpdated({ customProperties: updatedProperties });
      setNewPropertyKey('');
      setNewPropertyValue('');
    }
  }, [newPropertyKey, newPropertyValue, customProperties, onModelItemUpdated]);

  const handleRemoveProperty = useCallback(
    (keyToRemove: string) => {
      const updatedProperties = { ...customProperties };
      delete updatedProperties[keyToRemove];
      onModelItemUpdated({ customProperties: updatedProperties });
    },
    [customProperties, onModelItemUpdated]
  );

  const handleUpdateProperty = useCallback(
    (key: string, value: string) => {
      const updatedProperties = {
        ...customProperties,
        [key]: value
      };
      onModelItemUpdated({ customProperties: updatedProperties });
    },
    [customProperties, onModelItemUpdated]
  );

  // Health check functions
  const performHealthCheck = useCallback(async (url: string) => {
    if (!url || !url.trim()) {
      return;
    }

    setIsCheckingHealth(true);
    setHealthCheckError(undefined);

    // Update status to checking
    const checkingProperties = {
      ...customProperties,
      serviceUrl: url.trim(),
      healthStatus: 'checking' as HealthStatus,
      healthError: ''
    };
    onModelItemUpdated({ customProperties: checkingProperties });

    // Clear cache for this URL to force fresh check
    clearHealthCheckCache(url.trim());

    try {
      const result = await checkServiceHealth(url.trim(), healthCheckResponseField);
      
      const updatedProperties = {
        ...customProperties,
        serviceUrl: url.trim(),
        healthStatus: result.status,
        healthLastChecked: result.timestamp,
        healthError: result.error || ''
      };
      
      onModelItemUpdated({ customProperties: updatedProperties });
      
      if (result.error) {
        setHealthCheckError(result.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const updatedProperties = {
        ...customProperties,
        serviceUrl: url.trim(),
        healthStatus: 'unhealthy' as HealthStatus,
        healthLastChecked: new Date().toISOString(),
        healthError: errorMessage
      };
      
      onModelItemUpdated({ customProperties: updatedProperties });
      setHealthCheckError(errorMessage);
    } finally {
      setIsCheckingHealth(false);
    }
  }, [customProperties, onModelItemUpdated]);

  const handleServiceUrlChange = useCallback((newUrl: string) => {
    let updatedProperties: Record<string, string>;
    
    if (!newUrl.trim()) {
      // Remove health status if URL is cleared
      const { serviceUrl, healthStatus, healthLastChecked, healthError, ...rest } = customProperties;
      updatedProperties = rest;
    } else {
      updatedProperties = {
        ...customProperties,
        serviceUrl: newUrl.trim()
      };
    }
    
    onModelItemUpdated({ customProperties: updatedProperties });
  }, [customProperties, onModelItemUpdated]);

  const handleResponseFieldChange = useCallback((newField: HealthCheckResponseField) => {
    const updatedProperties = {
      ...customProperties,
      healthCheckResponseField: newField
    };
    onModelItemUpdated({ customProperties: updatedProperties });
  }, [customProperties, onModelItemUpdated]);

  const handleManualHealthCheck = useCallback(() => {
    if (serviceUrl) {
      performHealthCheck(serviceUrl);
    }
  }, [serviceUrl, performHealthCheck]);

  if (!modelItem) {
    return null;
  }

  return (
    <>
      <Section title="Name">
        <TextField
          value={modelItem.name}
          onChange={(e) => {
            const text = e.target.value as string;
            if (modelItem.name !== text) onModelItemUpdated({ name: text });
          }}
        />
      </Section>
      <Section title="Description">
        <RichTextEditor
          value={modelItem.description}
          onChange={(text) => {
            if (modelItem.description !== text)
              onModelItemUpdated({ description: text });
          }}
        />
      </Section>
      {modelItem.name && (
        <Section title="Label height">
          <Slider
            marks
            step={20}
            min={60}
            max={280}
            value={node.labelHeight}
            onChange={(e, newHeight) => {
              const labelHeight = newHeight as number;
              onViewItemUpdated({ labelHeight });
            }}
          />
        </Section>
      )}

      <Section title="Icon size">
        <Slider
          marks
          step={0.1}
          min={0.3}
          max={2.5}
          value={localScale}
          onChange={handleScaleChange}
        />
      </Section>
      <Section title="Tags">
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {tags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                onDelete={() => handleRemoveTag(tag)}
              />
            ))}
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              placeholder="Add tag"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddTag();
                }
              }}
              sx={{ flex: 1 }}
            />
            <IconButton size="small" onClick={handleAddTag} disabled={!newTag.trim()}>
              <AddIcon />
            </IconButton>
          </Stack>
        </Stack>
      </Section>
      <Section title="Service Health Check">
        <Stack spacing={1.5}>
          <TextField
            size="small"
            label="Service URL"
            placeholder="https://example.com or example.com"
            value={serviceUrl}
            onChange={(e) => handleServiceUrlChange(e.target.value)}
            helperText="Enter the base URL of the service to monitor"
            fullWidth
          />
          
          {serviceUrl && (
            <FormControl size="small" fullWidth>
              <InputLabel>Response Field</InputLabel>
              <Select
                value={healthCheckResponseField}
                label="Response Field"
                onChange={(e) => handleResponseFieldChange(e.target.value as HealthCheckResponseField)}
              >
                <MenuItem value="auto">Auto-detect</MenuItem>
                <MenuItem value="success">success field</MenuItem>
                <MenuItem value="status">status field</MenuItem>
                <MenuItem value="synthetic">Synthetic (connectivity only)</MenuItem>
              </Select>
            </FormControl>
          )}
          
          {serviceUrl && (
            <>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor:
                      healthStatus === 'healthy'
                        ? 'success.main'
                        : healthStatus === 'unhealthy'
                        ? 'error.main'
                        : healthStatus === 'checking'
                        ? 'warning.main'
                        : 'grey.400',
                    flexShrink: 0,
                    ...((healthStatus === 'unhealthy' || healthStatus === 'checking') && {
                      animation: `${pulseAnimation} 2s ease-in-out infinite`
                    })
                  }}
                />
                <Typography variant="body2" sx={{ flex: 1 }}>
                  Status: {healthStatus === 'healthy' ? 'Healthy' : healthStatus === 'unhealthy' ? 'Unhealthy' : healthStatus === 'checking' ? 'Checking...' : 'Unknown'}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={isCheckingHealth ? <CircularProgress size={14} /> : <RefreshIcon />}
                  onClick={handleManualHealthCheck}
                  disabled={isCheckingHealth || !serviceUrl.trim()}
                >
                  Check Now
                </Button>
              </Stack>
              
              {healthLastChecked && (
                <Typography variant="caption" color="text.secondary">
                  Last checked: {new Date(healthLastChecked).toLocaleString()}
                </Typography>
              )}
              
              {(healthError || healthCheckError) && (
                <Alert severity="error">
                  {healthError || healthCheckError}
                </Alert>
              )}
            </>
          )}
        </Stack>
      </Section>
      
      <Section title="Custom Properties">
        <Stack spacing={1}>
          {Object.entries(customProperties)
            .filter(([key]) => !['serviceUrl', 'healthStatus', 'healthLastChecked', 'healthError', 'healthCheckResponseField'].includes(key))
            .map(([key, value]) => (
            <Stack key={key} direction="row" spacing={1} alignItems="center">
              <TextField
                size="small"
                value={key}
                label="Key"
                disabled
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                value={value}
                label="Value"
                onChange={(e) => handleUpdateProperty(key, e.target.value)}
                sx={{ flex: 1 }}
              />
              <IconButton
                size="small"
                onClick={() => handleRemoveProperty(key)}
                color="error"
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              placeholder="Property key"
              value={newPropertyKey}
              onChange={(e) => setNewPropertyKey(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              placeholder="Property value"
              value={newPropertyValue}
              onChange={(e) => setNewPropertyValue(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddProperty();
                }
              }}
              sx={{ flex: 1 }}
            />
            <IconButton
              size="small"
              onClick={handleAddProperty}
              disabled={!newPropertyKey.trim()}
            >
              <AddIcon />
            </IconButton>
          </Stack>
        </Stack>
      </Section>
      <Section>
        <Box>
          <DeleteButton onClick={onDeleted} />
        </Box>
      </Section>
    </>
  );
};
