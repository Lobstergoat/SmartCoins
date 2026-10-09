/* Rulepets — launch a token on pump.fun with the connected Phantom wallet.
   Flow: check balance → upload image + metadata → ask PumpPortal for an unsigned `create` transaction →
   co-sign with the new mint key → Phantom signs and sends → wait for confirmation.
   Nothing is spent until the wallet owner approves the transaction in Phantom. */
(function (g) {
  'use strict';
  const cfg = () => Object.assign({}, g.RulePetsConfig || {});
  const W = () => { if (!g.solanaWeb3) throw fail('no-lib', 'The Solana library failed to load. Refresh and try again.'); return g.solanaWeb3; };
  let conn = null;
  const connection = () => conn || (conn = new (W().Connection)(cfg().rpc, 'confirmed'));

  function fail(kind, message, extra) { const e = new Error(message); e.kind = kind; return Object.assign(e, extra || {}); }

  /** Wallet balance in SOL. */
  async function balance(address) {
    const lamports = await connection().getBalance(new (W().PublicKey)(address));
    return lamports / 1e9;
  }

  async function confirm(signature) {
    const c = connection();
    const until = Date.now() + 75000;
    while (Date.now() < until) {
      const { value } = await c.getSignatureStatuses([signature], { searchTransactionHistory: true });
      const st = value && value[0];
      if (st) {
        if (st.err) throw fail('tx-failed', 'The transaction was sent but failed on-chain.', { signature, detail: JSON.stringify(st.err) });
        if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') return;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
    throw fail('unconfirmed', 'Still waiting for Solana to confirm. Check the transaction on Solscan before trying again.', { signature });
  }

  /**
   * opts: { provider, address, name, ticker, desc, image (Blob), devBuy (SOL, exact), onStep(step) }
   * steps: balance → upload → build → sign → confirm
   * resolves { mint, signature, metadataUri }; rejects with Error where .kind is one of
   * low-balance | rejected | upload-failed | build-failed | send-failed | tx-failed | unconfirmed | no-lib
   */
  async function launch(opts) {
    const c = cfg(), step = opts.onStep || (() => {});
    const { provider, address, name, ticker, desc, image, devBuy } = opts;
    const web3 = W();

    step('balance');
    let bal;
    try { bal = await balance(address); } catch (e) { throw fail('rpc', 'Couldn’t read your wallet balance. The RPC may be busy; try again in a moment.'); }
    const need = devBuy + c.costBuffer;
    if (bal < need) throw fail('low-balance', `Not enough SOL. You have ${bal.toFixed(4)} SOL and need about ${need.toFixed(4)} (${devBuy} dev buy + ${c.costBuffer} for fees and rent).`, { balance: bal, need });

    step('upload');
    const fd = new FormData();
    fd.append('file', image, image.type === 'image/png' ? 'token.png' : 'token');
    fd.append('name', name); fd.append('symbol', ticker); fd.append('description', desc || '');
    fd.append('twitter', ''); fd.append('telegram', ''); fd.append('website', ''); fd.append('showName', 'true');
    let uri;
    try {
      const up = await fetch(c.ipfs, { method: 'POST', body: fd });
      if (!up.ok) throw new Error(((await up.text()) || up.status).toString().slice(0, 200));
      uri = (await up.json()).metadataUri;
      if (!uri) throw new Error('no metadata address returned');
    } catch (e) { throw fail('upload-failed', 'Uploading the image and details to pump.fun failed: ' + e.message); }

    step('build');
    const mint = web3.Keypair.generate();
    let tx;
    try {
      const res = await fetch(c.trade, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: address, action: 'create', mint: mint.publicKey.toBase58(),
          tokenMetadata: { name, symbol: ticker, uri },
          denominatedInSol: 'true', amount: devBuy, slippage: c.slippage, priorityFee: c.priorityFee, pool: c.pool
        })
      });
      if (!res.ok) throw new Error(((await res.text()) || res.status).toString().slice(0, 200));
      tx = web3.VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
      tx.sign([mint]);
    } catch (e) { throw fail('build-failed', 'Couldn’t build the launch transaction: ' + e.message); }

    step('sign');
    let signature;
    try { signature = (await provider.signAndSendTransaction(tx)).signature; }
    catch (e) {
      if (e && (e.code === 4001 || /reject|declin|denied/i.test(e.message || ''))) throw fail('rejected', 'You declined the transaction in Phantom.');
      throw fail('send-failed', 'Phantom couldn’t send the transaction: ' + ((e && e.message) || e));
    }

    step('confirm');
    await confirm(signature);
    return { mint: mint.publicKey.toBase58(), signature, metadataUri: uri };
  }

  g.Pump = { launch, balance, links: { coin: m => 'https://pump.fun/coin/' + m, tx: s => 'https://solscan.io/tx/' + s } };
})(window);
