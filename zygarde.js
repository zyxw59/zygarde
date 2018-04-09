const zephyr = require("zephyr");
const discord = require("discord.js");
const wordwrap = require("wordwrap")(70);
const settings = require(`${process.cwd()}/settings`);

const client = new discord.Client({ disableEveryone: true });
zephyr.subscribe(
  [].concat.apply(
    [],
    settings.classes.map(({ zephyrClass, zephyrRelatedClasses = [] }) =>
      [zephyrClass, ...zephyrRelatedClasses].map(c => [c, "*", "*"])
    )
  ),
  err => {
    if (err) {
      console.error(err);
    }
  }
);

client.on("ready", () => {
  for (const guild of client.guilds.values()) {
    const matching = settings.classes
      .filter(({ discordServer }) => discordServer == guild.name)
      .map(({ zephyrClass }) => zephyrClass);
    const nickname = matching.length ? "-c " + matching.join(", ") : "";
    if (nickname ? guild.me.nickname != nickname : guild.me.nickname) {
      guild.me.setNickname(nickname).catch(err => console.error(err));
    }
  }
  client.user.setActivity("Zephyr", { type: "LISTENING" });

  zephyr.check(async (err, msg) => {
    if (err) {
      return console.error(err);
    }
    if (!msg.message.trim() || msg.opcode) {
      return;
    }
    const sender = msg.sender.split("@")[0];
    const matching = [];
    for (const {
      zephyrClass,
      discordServer,
      connectionDirection,
      zephyrRelatedClasses = []
    } of settings.classes) {
      if (zephyrRelatedClasses.includes(zephyrClass)) {
        console.log(
          `Warning! zephyr class ${zephyrClass} ` +
            `is included with its related classes. ` +
            `This can cause unexpected behavior.`
        );
      }
      if (
        connectionDirection != "<" &&
        (zephyrClass == msg.class || zephyrRelatedClasses.includes(msg.class))
      ) {
        for (const guild of client.guilds.values()) {
          if (discordServer == guild.name) {
            const channels = Array.from(guild.channels.values());
            const channel =
              channels.find(
                chan =>
                  chan.type == "text" && chan.name == msg.instance.split(".")[0]
              ) ||
              guild.systemChannel ||
              channels.find(chan => chan.type == "text");
            if (channel) {
              matching.push({
                channel,
                discordServer,
                zephyrRelatedClasses
              });
            }
          }
        }
      }
    }
    const ignore = matching.length ? "" : "\x1b[31mignoring\x1b[0m ";
    console.log(
      `\x1b[35;1mZephyr:\x1b[0m ${ignore}` +
        `${msg.class} / ${msg.instance} / ${sender}`
    );
    for (const { channel, discordServer } of matching) {
      console.log(
        `  > \x1b[34;1mTo Discord:\x1b[0m ` +
          `${discordServer} / ${channel.name} / ${sender}`
      );
    }
    if (ignore) {
      return;
    }
    for (const { channel, zephyrRelatedClasses } of matching) {
      const relatedClassPrefix = zephyrRelatedClasses.includes(msg.class)
        ? "[-c " + msg.class + "] "
        : "";
      const instancePrefix =
        channel.name === msg.instance ? "" : "[-i " + msg.instance + "] ";
      const message = relatedClassPrefix + instancePrefix + msg.message;
      const webhook = await channel
        .fetchWebhooks()
        .then(hook => hook.first() || channel.createWebhook(msg.instance))
        .catch(err => console.error(err));
      if (webhook) {
        webhook.send(message, { username: sender, split: true });
      } else {
        channel.send(message, { split: true });
      }
    }
  });
});

client.on("disconnect", evt => console.error(evt));
client.on("error", evt => console.error(evt));
client.on("warn", info => console.warn(info));
//client.on('debug', info => console.debug(info));

client.on("message", async msg => {
  if (msg.author.bot || !msg.guild) {
    return;
  }
  const sender = msg.member ? msg.member.displayName : msg.author.username;
  const matching = [];
  for (const {
    zephyrClass,
    discordServer,
    connectionDirection,
    zephyrRelatedClasses
  } of settings.classes) {
    if (connectionDirection != ">" && discordServer == msg.guild.name) {
      const prefixMatching = msg.cleanContent
        .trim()
        .match(/^(\[-c (.*?)\] ?)?(\[-i (.*?)\] ?)?(.*)/ms);
      if (!prefixMatching) {
        matching.push({
          zclass: zephyrClass,
          zinstance: msg.channel.name,
          zcontent: msg.cleanContent
        });
      } else {
        matching.push({
          zclass: zephyrRelatedClasses.includes(prefixMatching[2])
            ? prefixMatching[2]
            : zephyrClass,
          zinstance: prefixMatching[4] || msg.channel.name,
          zcontent:
            (zephyrRelatedClasses.includes(prefixMatching[2])
              ? ""
              : (prefixMatching[1] || "")) + prefixMatching[5]
        });
      }
    }
  }
  const ignore = matching.length ? "" : "\x1b[31mignoring\x1b[0m ";
  console.log(
    `\x1b[34;1mDiscord:\x1b[0m ${ignore}` +
      `${msg.guild.name} / ${msg.channel.name} / ${sender}`
  );
  for (const { zclass, zinstance } of matching) {
    console.log(
      `  > \x1b[35;1mTo Zephyr:\x1b[0m ` +
        `${zclass} / ${zinstance} / ${sender}`
    );
  }
  if (ignore) {
    return;
  }
  const signature = [];
  const game = (msg.member || msg.author).presence.game;
  if (game && (game.url || game.name)) {
    signature.push(game.url || game.name);
  }
  const invite = await msg.channel
    .createInvite({ maxAge: 0 })
    .catch(err => console.error(err));
  signature.push((invite && invite.url) || "Discord");
  for (const { zclass, zinstance, zcontent } of matching) {
    const content = [];
    if (zcontent.trim()) {
      content.push(wordwrap(zcontent));
    }
    for (const attach of msg.attachments.values()) {
      content.push(attach.url);
    }
    zephyr.send(
      {
        class: zclass,
        instance: zinstance,
        opcode: "discord",
        sender: sender,
        message: content.join("\n"),
        signature: signature.join(") (")
      },
      err => {
        if (err) console.error(err);
      }
    );
  }
});

client.login(settings.discordToken);
