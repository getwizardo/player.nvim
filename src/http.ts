export async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "player.nvim/0.2 (https://github.com/getwizardo/player.nvim)",
      accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
  return response.json() as Promise<unknown>;
}
