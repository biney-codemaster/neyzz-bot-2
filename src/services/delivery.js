const orders = require('./orders');
const { buildDeliveryMessage } = require('../ui/order');
const { container, text, V2 } = require('../ui/v2');
const { emoji } = require('../emoji');
const config = require('../config');

/**
 * Livre toujours en DM au client.
 * - auto: envoie les clés / payload
 * - manual restant: prévient que l'admin va livrer + notifie le salon
 */
async function deliverToUser(client, orderId) {
  let order = orders.getOrder(orderId);
  if (!order) throw new Error('Commande introuvable');

  if (order.status === 'delivered') {
    return { order, deliveries: [], allDone: true, already: true };
  }

  if (['pending', 'awaiting_payment'].includes(order.status)) {
    throw new Error('Commande non payée');
  }

  const result = orders.deliverOrder(orderId);
  order = result.order;

  const user = await client.users.fetch(order.user_id);
  const dmPayload = buildDeliveryMessage(order, result.deliveries);

  try {
    await user.send(dmPayload);
  } catch (e) {
    if (order.channel_id) {
      const ch = await client.channels.fetch(order.channel_id);
      await ch.send({
        components: [
          container(config.warnColor).addTextDisplayComponents(
            text(
              `${emoji('warn')} Impossible d'envoyer en MP (<@${order.user_id}> ouvre tes MPs). Livraison ici :`,
            ),
          ),
          ...dmPayload.components,
        ],
        flags: V2,
      });
    } else {
      throw new Error(`DM fermés pour ${order.user_id}: ${e.message}`);
    }
  }

  return result;
}

module.exports = {
  deliverToUser,
};
