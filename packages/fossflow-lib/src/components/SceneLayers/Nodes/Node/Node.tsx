import React, { useMemo, memo } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import {
  PROJECTED_TILE_SIZE,
  DEFAULT_LABEL_HEIGHT,
  MARKDOWN_EMPTY_VALUE
} from 'src/config';
import { getTilePosition } from 'src/utils';
import { useIcon } from 'src/hooks/useIcon';
import { ViewItem } from 'src/types';
import { useModelItem } from 'src/hooks/useModelItem';
import { ExpandableLabel } from 'src/components/Label/ExpandableLabel';
import { RichTextEditor } from 'src/components/RichTextEditor/RichTextEditor';
import type { HealthStatus } from 'src/services/healthCheckService';

interface Props {
  node: ViewItem;
  order: number;
}

export const Node = memo(({ node, order }: Props) => {
  const modelItem = useModelItem(node.id);
  const { iconComponent } = useIcon(modelItem?.icon);

  const position = useMemo(() => {
    return getTilePosition({
      tile: node.tile,
      origin: 'BOTTOM'
    });
  }, [node.tile]);

  const labelOffset = useMemo(() => {
    return PROJECTED_TILE_SIZE.height / 2;
  }, []);

  const description = useMemo(() => {
    if (
      !modelItem ||
      modelItem.description === undefined ||
      modelItem.description === MARKDOWN_EMPTY_VALUE
    )
      return null;

    return modelItem.description;
  }, [modelItem?.description]);

  // Extract health check status
  const serviceUrl = modelItem?.customProperties?.serviceUrl;
  const healthStatus = (modelItem?.customProperties?.healthStatus as HealthStatus) || 'unknown';
  const showHealthBadge = Boolean(serviceUrl);

  // Get badge color based on status
  const badgeColor = useMemo(() => {
    switch (healthStatus) {
      case 'healthy':
        return '#4caf50'; // Green
      case 'unhealthy':
        return '#f44336'; // Red
      case 'checking':
        return '#ff9800'; // Orange/Yellow
      default:
        return '#9e9e9e'; // Gray
    }
  }, [healthStatus]);

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

  // If modelItem doesn't exist, don't render the node
  if (!modelItem) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        zIndex: order
      }}
    >
      <Box
        sx={{ position: 'absolute' }}
        style={{
          left: position.x,
          top: position.y
        }}
      >
        {(modelItem?.name || description) && (
          <Box
            sx={{ position: 'absolute' }}
            style={{ bottom: labelOffset }}
          >
            <ExpandableLabel
              maxWidth={260}
              expandDirection="BOTTOM"
              labelHeight={node.labelHeight ?? DEFAULT_LABEL_HEIGHT}
            >
              <Stack spacing={0.5}>
                {modelItem.name && (
                  <Typography
                    fontWeight={600}
                    variant="body1"
                    sx={{
                      letterSpacing: 0.1
                    }}
                  >
                    {modelItem.name}
                  </Typography>
                )}
                {modelItem.description &&
                  modelItem.description !== MARKDOWN_EMPTY_VALUE && (
                    <RichTextEditor
                      value={modelItem.description}
                      readOnly
                    />
                  )}
              </Stack>
            </ExpandableLabel>
          </Box>
        )}
        {iconComponent && (
          <Box
            sx={{
              position: 'absolute',
              pointerEvents: 'none'
            }}
          >
            {iconComponent}
          </Box>
        )}
        {showHealthBadge && (
          <Box
            sx={{
              position: 'absolute',
              top: -4,
              right: -4,
              width: 12,
              height: 12,
              borderRadius: '50%',
              bgcolor: badgeColor,
              border: '2px solid white',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
              pointerEvents: 'none',
              zIndex: order + 1,
              ...((healthStatus === 'unhealthy' || healthStatus === 'checking') && {
                animation: `${pulseAnimation} 2s ease-in-out infinite`
              })
            }}
          />
        )}
      </Box>
    </Box>
  );
});
