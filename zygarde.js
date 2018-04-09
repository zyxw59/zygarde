const zephyr = require("zephyr");
const discord = require("discord.js");
const wordwrap = require("wordwrap")(70);
const settings = require(require("path").resolve(__dirname, "settings"));

// Validation of settings
for (const {
  zephyrClass,
  discordServer,
  connectionDirection,
  zephyrRelatedClasses = {}
} of settings.classes) {
  if (zephyrClass in zephyrRelatedClasses) {
    console.warn(
      `  !! Warning! zephyr class ${zephyrClass} ` +
        `is included with its related classes. ` +
        `This can cause unexpected behavior.`
    );
  }
  switch (connectionDirection) {
    case "<":
    case ">":
    case undefined:
      break;
    default:
      console.warn(
        `  !! Warning! Connection direction ${connectionDirection} ` +
          `is invalid. It should either be '<', '>', or missing.`
      );
  }
  const classTags = [];
  for (const relatedClass in zephyrRelatedClasses) {
    let classTag = zephyrRelatedClasses[relatedClass];
    if (!classTag) {
      continue;
    }
    if (classTag[0] === "-") {
      console.warn(
        `  !! Warning! zephyrRelatedClasses has a class tag which starts ` +
          `with a hyphen: ${classTag}, for class ${relatedClass}. ` +
          `This will cause unexpected behavior: please use a valid tag.`
      );
    }
    if (classTags.includes(classTag)) {
      console.warn(
        `  !! Warning! zephyrRelatedClasses has a duplicate class tag: ` +
          `${classTag}, for class ${relatedClass}. This can cause ` +
          `unexpected behavior. Please keep the tags distinct.`
      );
    }
    classTags.push(classTag);
  }
}

const client = new discord.Client({ disableEveryone: true });
zephyr.subscribe(
  [].concat.apply(
    [],
    settings.classes.map(({ zephyrClass, zephyrRelatedClasses = {} }) =>
      [zephyrClass, ...Object.keys(zephyrRelatedClasses)].map(c => [
        c,
        "*",
        "*"
      ])
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
      connectionDirection = "",
      zephyrRelatedClasses = {}
    } of settings.classes) {
      if (
        connectionDirection != "<" &&
        (zephyrClass == msg.class || msg.class in zephyrRelatedClasses)
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
      const relatedClassPrefix =
        msg.class in zephyrRelatedClasses
          ? zephyrRelatedClasses[msg.class]
            ? `[${zephyrRelatedClasses[msg.class]}] `
            : `[-c ${msg.class}] `
          : ``;
      const instancePrefix =
        channel.name === msg.instance ? `` : `[-i ${msg.instance}] `;
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

client.on("disconnect", evt => {
  console.error(evt);
  if (evt.reason === "Authentication failed.") {
    console.warn("\n\n\n");
    console.warn(`  ${Array(79).join("!")}`);
    console.warn(`  ${Array(79).join("!")}`);
    console.warn(
      `  !! Warning! Your authentication token appears to be invalid. `
    );
    console.warn(
      `  !! Most likely the issue is that you haven't followed the bot ` +
        `creation steps.`
    );
    console.warn(`  !!`);
    console.warn(
      `  !! Go here: ` +
        `https://discordjs.guide/#/preparations/setting-up-a-bot-application`
    );
    console.warn(`  !!`);
    console.warn(`  !! Create an app and then a bot to get a token.`);
    console.warn(`  !! Add that token into settings.js, and re-run Zygarde.`);
    console.warn(`  !!`);
    console.warn(
      `  !! Also remember to add your bot to your Discord server(s):`
    );
    console.warn(`  !!`);
    console.warn(
      `  !! https://discordapp.com/oauth2/authorize` +
        `?permissions=536890385&scope=bot&client_id=CLIENT_ID`
    );
    console.warn(`  !!`);
    console.warn(
      `  !! where CLIENT_ID is the "Client ID" from the app that you made.`
    );
    console.warn(`  ${Array(79).join("!")}`);
    console.warn(`  ${Array(79).join("!")}`);
    console.warn("\n\n\n");
    process.exit(1);
  }
});
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
    connectionDirection = "",
    zephyrRelatedClasses = {}
  } of settings.classes) {
    if (connectionDirection != ">" && discordServer == msg.guild.name) {
      const prefixMatching = msg.cleanContent
        .trim()
        .match(/^(\[(-c\s+(.*?)|[^-].*?)\]\s*)?(\[-i\s+(.*?)\]\s*)?(.*)/ms);
      if (!prefixMatching) {
        matching.push({
          zclass: zephyrClass,
          zinstance: msg.channel.name,
          zcontent: msg.cleanContent
        });
      } else {
        matching.push({
          zclass:
            prefixMatching[3] in zephyrRelatedClasses
              ? prefixMatching[3]
              : Object.keys(zephyrRelatedClasses).find(
                  cls => zephyrRelatedClasses[cls] === prefixMatching[2]
                ) || zephyrClass,
          zinstance: prefixMatching[5] || msg.channel.name,
          zcontent:
            (prefixMatching[3] in zephyrRelatedClasses ||
            Object.keys(zephyrRelatedClasses).find(
              cls => zephyrRelatedClasses[cls] === prefixMatching[2]
            )
              ? ""
              : prefixMatching[1] || "") + prefixMatching[6]
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
