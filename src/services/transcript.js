const { AttachmentBuilder } = require('discord.js');
const config = require('../config');
const orders = require('./orders');
const paymentAddresses = require('./paymentAddresses');

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(value) {
  if (value == null || value === '') return '—';
  try {
    let d;
    if (value instanceof Date) d = value;
    else if (typeof value === 'number') d = new Date(value);
    else {
      const s = String(value);
      d = new Date(s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`);
    }
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      dateStyle: 'long',
      timeStyle: 'medium',
    });
  } catch {
    return String(value);
  }
}

/**
 * Génère un transcript HTML soigné à partir des messages Discord + infos commande.
 */
function buildTranscriptHtml({ order, messages, closedBy }) {
  const payAddr = paymentAddresses.getAddressByOrder?.(order.id) || null;
  const itemsHtml = (order.items || [])
    .map(
      (i) => `
      <tr>
        <td>${escapeHtml(i.product_name)}</td>
        <td class="center">${i.quantity}</td>
        <td class="right">${Number(i.unit_price).toFixed(2)} ${escapeHtml(config.currencySymbol)}</td>
        <td class="right">${(i.unit_price * i.quantity).toFixed(2)} ${escapeHtml(config.currencySymbol)}</td>
        <td>${i.delivered_payload ? `<code>${escapeHtml(i.delivered_payload)}</code>` : '<span class="muted">—</span>'}</td>
      </tr>`,
    )
    .join('');

  const messagesHtml = (messages || [])
    .map((m) => {
      const author = m.author?.tag || m.author?.username || m.author?.id || 'Inconnu';
      const bot = m.author?.bot ? ' bot' : '';
      const content = escapeHtml(m.cleanContent || m.content || '').replace(/\n/g, '<br>')
        || '<span class="muted"><em>(composants / pièce jointe)</em></span>';
      const attachments = [...(m.attachments?.values?.() || m.attachments || [])]
        .map((a) => `<div class="attach">📎 <a href="${escapeHtml(a.url)}">${escapeHtml(a.name || 'fichier')}</a></div>`)
        .join('');
      return `
      <article class="msg${bot}">
        <header>
          <strong>${escapeHtml(author)}</strong>
          <time>${escapeHtml(formatDate(m.createdAt?.toISOString?.() || m.createdTimestamp))}</time>
        </header>
        <div class="body">${content}${attachments}</div>
      </article>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Transcript ${escapeHtml(order.public_id)} — ${escapeHtml(config.shopName)}</title>
<style>
  :root {
    --bg: #0f1419;
    --card: #1a2332;
    --line: #2a3648;
    --text: #e8eef7;
    --muted: #8b9bb4;
    --accent: #3b82f6;
    --ok: #22c55e;
    --warn: #f59e0b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    background: linear-gradient(160deg, #0b1220 0%, #152238 50%, #0f1419 100%);
    color: var(--text);
    line-height: 1.5;
    min-height: 100vh;
  }
  .wrap { max-width: 920px; margin: 0 auto; padding: 40px 20px 80px; }
  header.hero {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 28px 32px;
    margin-bottom: 24px;
    box-shadow: 0 12px 40px rgba(0,0,0,.35);
  }
  header.hero h1 { margin: 0 0 6px; font-size: 1.6rem; letter-spacing: -0.02em; }
  header.hero .sub { color: var(--muted); font-size: .95rem; }
  .badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: .75rem;
    font-weight: 600;
    background: rgba(59,130,246,.15);
    color: #93c5fd;
    border: 1px solid rgba(59,130,246,.35);
    margin-top: 12px;
  }
  .badge.ok { background: rgba(34,197,94,.12); color: #86efac; border-color: rgba(34,197,94,.35); }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin: 20px 0 0;
  }
  .stat {
    background: rgba(255,255,255,.03);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 14px 16px;
  }
  .stat label { display: block; color: var(--muted); font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; }
  .stat strong { font-size: 1.05rem; }
  section {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 24px 28px;
    margin-bottom: 20px;
  }
  section h2 {
    margin: 0 0 16px;
    font-size: 1.1rem;
    border-bottom: 1px solid var(--line);
    padding-bottom: 10px;
  }
  table { width: 100%; border-collapse: collapse; font-size: .92rem; }
  th, td { padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); text-align: left; font-weight: 600; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
  .right { text-align: right; }
  .center { text-align: center; }
  .totals { margin-top: 16px; text-align: right; color: var(--muted); }
  .totals .total { color: var(--text); font-size: 1.15rem; font-weight: 700; margin-top: 4px; }
  code {
    display: block;
    white-space: pre-wrap;
    background: #0b1220;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: .8rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .msg {
    border-left: 3px solid var(--accent);
    background: rgba(255,255,255,.02);
    border-radius: 0 10px 10px 0;
    padding: 12px 14px;
    margin-bottom: 10px;
  }
  .msg.bot { border-left-color: var(--ok); }
  .msg header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; font-size: .85rem; }
  .msg header time { color: var(--muted); white-space: nowrap; }
  .msg .body { font-size: .95rem; word-break: break-word; }
  .attach { margin-top: 6px; font-size: .85rem; }
  .attach a { color: #93c5fd; }
  .muted { color: var(--muted); }
  footer {
    text-align: center;
    color: var(--muted);
    font-size: .8rem;
    margin-top: 32px;
  }
</style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <h1>${escapeHtml(config.shopName)}</h1>
      <div class="sub">Transcript de commande</div>
      <span class="badge ok">${escapeHtml(order.public_id)} · ${escapeHtml(order.status)}</span>
      <div class="grid">
        <div class="stat"><label>Client</label><strong>${escapeHtml(order.username)} <span class="muted">(${escapeHtml(order.user_id)})</span></strong></div>
        <div class="stat"><label>Paiement</label><strong>${escapeHtml(order.payment_method || '—')}${order.crypto_currency ? ` / ${escapeHtml(String(order.crypto_currency).toUpperCase())}` : ''}</strong></div>
        <div class="stat"><label>Total</label><strong>${Number(order.total).toFixed(2)} ${escapeHtml(config.currencySymbol)}</strong></div>
        <div class="stat"><label>Créée le</label><strong>${escapeHtml(formatDate(order.created_at))}</strong></div>
        <div class="stat"><label>Payée le</label><strong>${escapeHtml(formatDate(order.paid_at))}</strong></div>
        <div class="stat"><label>Livrée le</label><strong>${escapeHtml(formatDate(order.delivered_at))}</strong></div>
        <div class="stat"><label>Fermée par</label><strong>${escapeHtml(closedBy || '—')}</strong></div>
        ${payAddr ? `<div class="stat"><label>Adresse crypto</label><strong style="font-size:.8rem;word-break:break-all">${escapeHtml(payAddr.address)}</strong></div>` : ''}
      </div>
    </header>

    <section>
      <h2>Articles</h2>
      <table>
        <thead>
          <tr>
            <th>Produit</th>
            <th class="center">Qté</th>
            <th class="right">Prix unit.</th>
            <th class="right">Sous-total</th>
            <th>Livré</th>
          </tr>
        </thead>
        <tbody>${itemsHtml || '<tr><td colspan="5" class="muted">Aucun article</td></tr>'}</tbody>
      </table>
      <div class="totals">
        <div>Sous-total : ${Number(order.subtotal).toFixed(2)} ${escapeHtml(config.currencySymbol)}</div>
        ${order.discount > 0 ? `<div>Remise${order.coupon_code ? ` (${escapeHtml(order.coupon_code)})` : ''} : −${Number(order.discount).toFixed(2)} ${escapeHtml(config.currencySymbol)}</div>` : ''}
        <div class="total">Total : ${Number(order.total).toFixed(2)} ${escapeHtml(config.currencySymbol)}</div>
      </div>
    </section>

    <section>
      <h2>Messages du salon</h2>
      ${messagesHtml || '<p class="muted">Aucun message.</p>'}
    </section>

    <footer>
      Généré automatiquement par ${escapeHtml(config.shopName)} · ${escapeHtml(formatDate(new Date().toISOString()))}
    </footer>
  </div>
</body>
</html>`;
}

async function fetchChannelMessages(channel, limit = 200) {
  const collected = [];
  let lastId;
  while (collected.length < limit) {
    const batch = await channel.messages.fetch({
      limit: Math.min(100, limit - collected.length),
      ...(lastId ? { before: lastId } : {}),
    });
    if (!batch.size) break;
    const arr = [...batch.values()];
    collected.push(...arr);
    lastId = arr[arr.length - 1].id;
    if (batch.size < 100) break;
  }
  return collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

/**
 * Ferme la commande : transcript HTML → DM client + salon logs, puis suppression du salon.
 */
async function closeOrderWithTranscript(client, { orderId, closedByUser, channel }) {
  const order = orders.getOrder(orderId);
  if (!order) throw new Error('Commande introuvable');
  if (order.closed_at) throw new Error('Commande déjà fermée');

  const ch = channel || (order.channel_id ? await client.channels.fetch(order.channel_id).catch(() => null) : null);
  const messages = ch ? await fetchChannelMessages(ch) : [];

  const html = buildTranscriptHtml({
    order,
    messages,
    closedBy: closedByUser?.tag || closedByUser?.username || closedByUser?.id || '—',
  });

  const filename = `transcript-${order.public_id}.html`;
  const attachment = new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: filename });

  const summary = [
    `📋 **Transcript ${order.public_id}**`,
    `Client : <@${order.user_id}> (\`${order.username}\`)`,
    `Statut : \`${order.status}\` · ${Number(order.total).toFixed(2)} ${config.currencySymbol}`,
    `Paiement : ${order.payment_method || '—'}${order.crypto_currency ? ` (${String(order.crypto_currency).toUpperCase()})` : ''}`,
    `Fermée par : ${closedByUser}`,
  ].join('\n');

  // DM client
  try {
    const user = await client.users.fetch(order.user_id);
    await user.send({
      content: `${summary}\n\nVoici le transcript HTML de ta commande.`,
      files: [attachment],
    });
  } catch (e) {
    console.warn('[transcript] DM client échoué:', e.message);
  }

  // Salon logs
  if (config.logsChannelId) {
    try {
      const logs = await client.channels.fetch(config.logsChannelId);
      if (logs?.isTextBased()) {
        await logs.send({
          content: summary,
          files: [new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: filename })],
        });
      }
    } catch (e) {
      console.warn('[transcript] logs échoué:', e.message);
    }
  }

  orders.markClosed(orderId);

  if (ch) {
    setTimeout(() => {
      ch.delete('Commande fermée — transcript envoyé').catch(() => {});
    }, 2500);
  }

  return { order: orders.getOrder(orderId), filename };
}

module.exports = {
  buildTranscriptHtml,
  closeOrderWithTranscript,
  fetchChannelMessages,
};
