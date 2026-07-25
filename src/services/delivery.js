const orders = require('./orders');
const { buildDeliveryMessage } = require('../ui/order');
const { container, text, V2 } = require('../ui/v2');
const { emoji } = require('../emoji');
const config = require('../config');

/**
 * Always delivers by DM to the customer.
 * - auto: sends keys / payload
 * - remaining manual: notifies that an admin will deliver + notifies the channel
 */
async function deliverToUser(client, orderId) {
  let order = orders.getOrder(orderId);
  if (!order) throw new Error('Order not found');

  if (order.status === 'delivered') {
    return { order, deliveries: [], allDone: true, already: true };
  }

  if (['pending', 'awaiting_payment'].includes(order.status)) {
    throw new Error('Order is not paid');
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
              `${emoji('warn')} Could not DM <@${order.user_id}> (please open your DMs). Delivery here:`,
            ),
          ),
          ...dmPayload.components,
        ],
        flags: V2,
      });
    } else {
      throw new Error(`DMs closed for ${order.user_id}: ${e.message}`);
    }
  }

  return result;
}

module.exports = {
  deliverToUser,
};
