const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const { emoji, emojiComponent } = require('../emoji');
const { money, truncate } = require('../utils/helpers');

const V2 = MessageFlags.IsComponentsV2;

function text(content) {
  return new TextDisplayBuilder().setContent(content);
}

function separator(divider = true) {
  return new SeparatorBuilder()
    .setDivider(divider)
    .setSpacing(SeparatorSpacingSize.Small);
}

function btn(customId, label, style = ButtonStyle.Secondary, emojiKey = null) {
  const b = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
  if (emojiKey) {
    const e = emojiComponent(emojiKey);
    if (e) b.setEmoji(e);
  }
  return b;
}

function select(customId, placeholder, options) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(
      options.map((opt) => {
        const o = new StringSelectMenuOptionBuilder()
          .setLabel(truncate(opt.label, 100))
          .setValue(String(opt.value));
        if (opt.description) o.setDescription(truncate(opt.description, 100));
        if (opt.emojiKey) {
          const e = emojiComponent(opt.emojiKey);
          if (e) o.setEmoji(e);
        }
        return o;
      }),
    );
  return new ActionRowBuilder().addComponents(menu);
}

function row(...buttons) {
  return new ActionRowBuilder().addComponents(...buttons);
}

function container(accent = config.accentColor) {
  return new ContainerBuilder().setAccentColor(accent);
}

module.exports = {
  V2,
  text,
  separator,
  btn,
  select,
  row,
  container,
  ButtonStyle,
  money,
  emoji,
};
