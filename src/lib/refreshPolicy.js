export function shouldRefresh({
  visibilityState,
  isLoading = false,
  lastSuccessfulLoad = 0,
  refreshIntervalMs,
  now = Date.now()
}) {
  if (visibilityState !== 'visible' || isLoading) return false;
  if (!lastSuccessfulLoad) return true;

  return now - lastSuccessfulLoad >= refreshIntervalMs;
}
