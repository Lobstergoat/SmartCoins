/* Launch settings. Swap `rpc` for your own endpoint (Helius, QuickNode, ...): the public one is rate-limited. */
window.RulePetsConfig = {
  rpc: 'https://api.mainnet-beta.solana.com',
  ipfs: 'https://pump.fun/api/ipfs',                       // uploads image + name/ticker/description, returns metadataUri
  trade: 'https://pumpportal.fun/api/trade-local',         // returns an unsigned create transaction for the wallet to sign
  pool: 'pump',
  slippage: 10,        // percent
  priorityFee: 0.0005, // SOL
  costBuffer: 0.03     // SOL kept free on top of the dev buy for rent, fees and priority fee
};
