#!/bin/bash

# Docker image build script for FossFLOW
# Builds and optionally pushes Docker images with configurable platform and registry

set -euo pipefail

# Default values
DEFAULT_REGISTRY="stnsmith"
DEFAULT_IMAGE_NAME="fossflow"
DEFAULT_TAG="latest"
DEFAULT_PLATFORM="linux/amd64"
DEFAULT_PUSH="true"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Initialize variables from environment or defaults
REGISTRY="${DOCKER_REGISTRY:-${DEFAULT_REGISTRY}}"
IMAGE_NAME="${DOCKER_IMAGE_NAME:-${DEFAULT_IMAGE_NAME}}"
TAG="${IMAGE_TAG:-${DEFAULT_TAG}}"
PLATFORM="${DOCKER_PLATFORM:-${DEFAULT_PLATFORM}}"
PUSH="${DOCKER_PUSH:-${DEFAULT_PUSH}}"

# Function to print usage
usage() {
  cat << EOF
Usage: $0 [OPTIONS]

Build and optionally push Docker images for FossFLOW with configurable platform and registry.

OPTIONS:
  --platform PLATFORM     Target platform (default: ${DEFAULT_PLATFORM})
                          Examples: linux/amd64, linux/arm64, linux/arm/v7
  --registry REGISTRY     Docker registry (default: ${DEFAULT_REGISTRY})
                          Examples: stnsmith, ghcr.io/username, docker.io/username
  --image-name NAME       Image name (default: ${DEFAULT_IMAGE_NAME})
  --tag TAG               Image tag (default: ${DEFAULT_TAG})
                          Use 'git-sha' to auto-detect current git commit SHA
  --push                  Push image to registry after building (default: true)
  --no-push               Build only, do not push to registry
  --help                  Show this help message

ENVIRONMENT VARIABLES:
  DOCKER_REGISTRY         Override default registry
  DOCKER_IMAGE_NAME       Override default image name
  IMAGE_TAG               Override default tag
  DOCKER_PLATFORM         Override default platform
  DOCKER_PUSH             Override push behavior (true/false)

EXAMPLES:
  # Build and push with defaults (stnsmith/fossflow:latest on linux/amd64)
  $0

  # Build for ARM64 platform
  $0 --platform linux/arm64

  # Build and push to GitHub Container Registry
  $0 --registry ghcr.io/username --image-name fossflow

  # Build with git SHA as tag
  $0 --tag git-sha

  # Build only, don't push
  $0 --no-push

  # Build for multiple platforms (requires docker buildx)
  $0 --platform linux/amd64,linux/arm64

EOF
}

# Function to check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Function to get git SHA
get_git_sha() {
  if command_exists git && git rev-parse --git-dir > /dev/null 2>&1; then
    git rev-parse --short HEAD
  else
    echo "unknown"
  fi
}

# Function to normalize registry (remove trailing slashes, handle docker.io)
normalize_registry() {
  local reg="$1"
  # Remove trailing slash
  reg="${reg%/}"
  # If it's just a username (no /), assume Docker Hub
  if [[ "$reg" != *"/"* ]] && [[ "$reg" != *"."* ]]; then
    echo "$reg"
  else
    echo "$reg"
  fi
}

# Function to validate platform
validate_platform() {
  local platform="$1"
  # Basic validation - should contain at least one /
  if [[ "$platform" != *"/"* ]]; then
    echo "Error: Invalid platform format: $platform" >&2
    echo "Platform should be in format like 'linux/amd64' or 'linux/arm64'" >&2
    exit 1
  fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --registry)
      REGISTRY="$2"
      shift 2
      ;;
    --image-name)
      IMAGE_NAME="$2"
      shift 2
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    --push)
      PUSH="true"
      shift
      ;;
    --no-push)
      PUSH="false"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo -e "${RED}Error: Unknown option: $1${NC}" >&2
      usage
      exit 1
      ;;
  esac
done

# Normalize registry
REGISTRY=$(normalize_registry "$REGISTRY")

# Handle special tag values
if [[ "$TAG" == "git-sha" ]]; then
  TAG=$(get_git_sha)
  echo -e "${BLUE}Using git SHA as tag: ${TAG}${NC}"
fi

# Validate platform
validate_platform "$PLATFORM"

# Construct full image reference
if [[ "$REGISTRY" == *"."* ]] || [[ "$REGISTRY" == *"/"* ]]; then
  # Full registry path (e.g., ghcr.io/username or docker.io/username)
  FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${TAG}"
else
  # Docker Hub username format
  FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${TAG}"
fi

# Check if Docker is available
if ! command_exists docker; then
  echo -e "${RED}Error: Docker is not installed or not in PATH${NC}" >&2
  exit 1
fi

# Check if we need buildx for multi-platform or specific platform builds
NEEDS_BUILDX=false
if [[ "$PLATFORM" == *","* ]] || [[ "$PLATFORM" != "linux/amd64" ]]; then
  NEEDS_BUILDX=true
fi

if [[ "$NEEDS_BUILDX" == "true" ]]; then
  if ! command_exists docker || ! docker buildx version >/dev/null 2>&1; then
    echo -e "${YELLOW}Warning: docker buildx not available. Multi-platform builds require buildx.${NC}" >&2
    echo -e "${YELLOW}Attempting to use regular docker build (may not support --platform flag)${NC}" >&2
    NEEDS_BUILDX=false
  fi
fi

# Print build configuration
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  FossFLOW Docker Image Build${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Platform:    ${GREEN}${PLATFORM}${NC}"
echo -e "Registry:    ${GREEN}${REGISTRY}${NC}"
echo -e "Image:       ${GREEN}${FULL_IMAGE}${NC}"
echo -e "Push:        ${GREEN}${PUSH}${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT"

# Check if Dockerfile exists
if [[ ! -f "Dockerfile" ]]; then
  echo -e "${RED}Error: Dockerfile not found in project root${NC}" >&2
  exit 1
fi

# Build the image
echo -e "${BLUE}Building Docker image...${NC}"

if [[ "$NEEDS_BUILDX" == "true" ]]; then
  # Use buildx for multi-platform or specific platform builds
  if [[ "$PUSH" == "true" ]]; then
    echo -e "${BLUE}Using docker buildx with push enabled...${NC}"
    docker buildx build \
      --platform "$PLATFORM" \
      --tag "$FULL_IMAGE" \
      --push \
      --file Dockerfile \
      .
  else
    echo -e "${BLUE}Using docker buildx (build only, no push)...${NC}"
    docker buildx build \
      --platform "$PLATFORM" \
      --tag "$FULL_IMAGE" \
      --load \
      --file Dockerfile \
      .
  fi
else
  # Use regular docker build
  echo -e "${BLUE}Using docker build...${NC}"
  docker build \
    --platform "$PLATFORM" \
    --tag "$FULL_IMAGE" \
    --file Dockerfile \
    .
fi

if [[ $? -eq 0 ]]; then
  echo -e "${GREEN}✓ Image built successfully: ${FULL_IMAGE}${NC}"
else
  echo -e "${RED}✗ Image build failed${NC}" >&2
  exit 1
fi

# Push the image if requested
if [[ "$PUSH" == "true" ]] && [[ "$NEEDS_BUILDX" != "true" ]]; then
  echo -e "${BLUE}Pushing image to registry...${NC}"
  if docker push "$FULL_IMAGE"; then
    echo -e "${GREEN}✓ Image pushed successfully: ${FULL_IMAGE}${NC}"
  else
    echo -e "${RED}✗ Image push failed${NC}" >&2
    echo -e "${YELLOW}Note: Make sure you are logged in to the registry${NC}" >&2
    echo -e "${YELLOW}      Use: docker login ${REGISTRY}${NC}" >&2
    exit 1
  fi
fi

# Summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Build Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Image: ${FULL_IMAGE}"
if [[ "$PUSH" == "true" ]]; then
  echo -e "Status: Built and pushed to registry"
else
  echo -e "Status: Built locally (not pushed)"
fi
echo -e "${GREEN}========================================${NC}"

