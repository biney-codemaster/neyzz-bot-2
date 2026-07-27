const orders = require('./orders');
const { buildDeliveryFollowUp } = require('../ui/order');
const { container, text, V2 } = require('../ui/v2');
const { emoji } = require('../emoji');
const config = require('../config');

function collectLinks(deliveries) {
  const links = [];
  for (const d of deliveries || []) {
    if (d.links?.length) links.push(...d.links);
    else if (d.payload) {
      links.push(
        ...String(d.payload)
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }
  }
  return links;
}

/**
 * Deliver by DM.
 * Nitro gift links are sent as plain text messages (1 link = 1 message)
 * so Discord can show the gift embed. No Components V2 on those messages.
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
  const links = collectLinks(result.deliveries);
  const hasManual = result.deliveries.some((d) => d.manual);

  const user = await client.users.fetch(order.user_id);

  const sendPlain = async (target) => {
    if (links.length) {
      await target.send({
        content: `${emoji('success')} **${order.public_id}** — your Nitro gift link${links.length > 1 ? 's' : ''}:`,
      });
      for (const link of links) {
        await target.send({ content: link });
      }
    }
    if (hasManual) {
      await target.send({
        content: `${emoji('pending')} Some items still need manual delivery. An admin will handle it.`,
      });
    }
    // Follow-up with review/close (V2 ok — after the plain gift links)
    if (order.status === 'delivered') {
      try {
        await target.send(buildDeliveryFollowUp(order));
      } catch {
        /* ignore */
      }
    }
  };

  try {
    await sendPlain(user);
  } catch (e) {
    if (order.channel_id) {
      const ch = await client.channels.fetch(order.channel_id);
      await ch.send({
        components: [
          container(config.warnColor).addTextDisplayComponents(
            text(
              `${emoji('warn')} Could not DM <@${order.user_id}> (please open your DMs). Delivering here:`,
            ),
          ),
        ],
        flags: V2,
      });
      await sendPlain(ch);
    } else {
      throw new Error(`DMs closed for ${order.user_id}: ${e.message}`);
    }
  }

  return result;
}

module.exports = {
  deliverToUser,
  collectLinks,
};
