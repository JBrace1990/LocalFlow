export function resolveRunnerConnectivity({ systemStatsConnected, queueConnected } = {}) {
  return Boolean(systemStatsConnected || queueConnected);
}
