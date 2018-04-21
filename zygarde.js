const zephyr = require("zephyr");
const discord = require("discord.js");
const wordwrap = require("wordwrap")(70);
const settings = require(require("path").resolve(__dirname, "settings"));

const Z2D_ONLY = ">";
const D2Z_ONLY = "<";

// Opcodes to ignore
const IGNORE_OPCODES = ["discord", "auto", "crypt", "discord-ignore"];

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
    case Z2D_ONLY:
    case D2Z_ONLY:
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

// Holds the state of which instances are active
// on the fallback channels of the Discord servers.
let activeInstancesForFallbackChannels = {};
for (const { discordServer, discordFallbackChannel } of settings.classes) {
  if (discordFallbackChannel) {
    // Default to using the fallback channel's name as the instance.
    activeInstancesForFallbackChannels[discordServer] = discordFallbackChannel;
  }
}

const updateActiveInstance = (server, channel, instance) => {
  activeInstancesForFallbackChannels[server] = instance;
  console.log(
    `\x1b[34;1mDiscord: ${server} #${channel}\x1b[0m ` +
      `active instance set to: ${instance}`
  );
};

const client = new discord.Client({ disableEveryone: true });

// Subscribe to all zephyr classes, both the main bridged class and
// its related classes, via the triplet <c,*,*>
zephyr.subscribe(
  [].concat.apply(
    [],
    settings.classes.map(({ zephyrClass, zephyrRelatedClasses = {} }) =>
      [zephyrClass, ...Object.keys(zephyrRelatedClasses)]
        // Make each into a zephyr triplet
        .map(c => [c, "*", "*"])
    )
  ),
  err => {
    if (err) {
      console.error(err);
    }
  }
);

client.on("ready", () => {
  // Set the bot's nickname to '-c class'
  for (const guild of client.guilds.values()) {
    const matching = settings.classes
      .filter(({ discordServer }) => discordServer == guild.name)
      .map(({ zephyrClass }) => zephyrClass);

    const nickname = matching.length ? "-c " + matching.join(", ") : "";

    // Don't bother changing the nickname if it's already correctly
    // set to what we want it to be
    if (nickname ? guild.me.nickname != nickname : guild.me.nickname) {
      guild.me.setNickname(nickname).catch(err => console.error(err));
    }
  }

  // Bot is 'Listening to Zephyr'
  client.user.setActivity("Zephyr", { type: "LISTENING" });

  // Start listening to zephyr
  zephyr.check(async (err, msg) => {
    if (err) {
      return console.error(err);
    }
    // If the message is empty, or has one of the specified opcodes, ignore it.
    //
    // Ignored opcodes are:
    // - discord
    // - auto
    // - crypt
    // - discord-ignore
    if (!msg.message.trim() || IGNORE_OPCODES.includes(msg.opcode.toLowerCase())) {
      return;
    }

    // sender is of the form user@realm; grab only user
    const sender = msg.sender.split("@")[0];
    const cls = msg.class.normalize("NFKC").toLowerCase();
    const instance = msg.instance.normalize("NFKC").toLowerCase();

    // Figure out where to bridge the message to
    // {channel, discordServer, zephyrRelatedClasses}
    const matching = [];
    for (const {
      zephyrClass,
      discordServer,
      discordFallbackChannel,
      connectionDirection,
      zephyrRelatedClasses = {}
    } of settings.classes) {
      // Don't bridge if we're not going that direction
      if (connectionDirection === D2Z_ONLY) {
        continue;
      }
      // Check that the message came from a class we care about
      if (zephyrClass !== cls && !(cls in zephyrRelatedClasses)) {
        continue;
      }
      for (const guild of client.guilds.values()) {
        if (discordServer !== guild.name) {
          continue;
        }
        // Find the right channel (text channels only)
        const channels = Array.from(guild.channels.values()).filter(
          chan => chan.type === "text"
        );
        const channel =
          // First look for the channel matching literally,
          // modulo a `.d` or something appended to the end
          channels.find(chan =>
            new RegExp(`^${chan.name}(\\..*)?$`).test(instance)
          ) ||
          // If not, grab the designated fallback Discord channel
          channels.find(chan => chan.name === discordFallbackChannel) ||
          // If not, go for the default "join message channel"
          guild.systemChannel ||
          // Worst case, grab the first text channel we can get
          channels[0];
        if (channel) {
          matching.push({
            channel,
            discordServer,
            discordFallbackChannel,
            zephyrRelatedClasses
          });
        }
      }
    }

    // Log what comes out, noting whether we're ignoring a message
    // due to a bad match or not
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

    for (const {
      channel,
      zephyrRelatedClasses,
      discordServer,
      discordFallbackChannel
    } of matching) {
      // If the class is not the main class but a related class,
      // build the prefix for printing on the Discord side
      const relatedClassPrefix =
        cls in zephyrRelatedClasses
          ? zephyrRelatedClasses[cls]
            ? `[${zephyrRelatedClasses[cls]}] `
            : `[-c ${msg.class}] `
          : ``;
      // Do the same with the instance
      let instancePrefix = ``;
      if (
        channel.name !== instance &&
        activeInstancesForFallbackChannels[discordServer] !== instance
      ) {
        updateActiveInstance(discordServer, discordFallbackChannel, instance);
        instancePrefix = `[-i ${instance}] `;
      }
      // [tag OR -c class] [-i instance] message
      const message = relatedClassPrefix + instancePrefix + msg.message;

      // Send the message!
      const webhook = await channel
        .fetchWebhooks()
        .then(hook => hook.first() || channel.createWebhook(instance))
        .catch(err => console.error(err));

      if (webhook) {
        webhook.send(message, { username: sender, split: true });
      } else {
        channel.send(message, { split: true });
      }
    }
  });
});

// Spew errors in the case of an auth failure
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
// client.on('debug', info => console.debug(info));

// Start listening to Discord
client.on("message", async msg => {
  // Ignore messages that aren't from real users on real server (i.e. not PMs)
  // TODO: support PMs?
  if (msg.author.bot || !msg.guild) {
    return;
  }

  // replace spaces with dashes, which matches zephyr
  // convention
  const sender = (msg.member ? msg.member.displayName : msg.author.username)
    .replace(/ /g, '-');

  // Figure out where to bridge the message to
  const matching = [];
  for (const {
    zephyrClass,
    discordServer,
    discordFallbackChannel,
    connectionDirection,
    zephyrRelatedClasses = {}
  } of settings.classes) {
    // Don't bridge if we're not going that direction
    if (connectionDirection === Z2D_ONLY) {
      continue;
    }
    // Also, make sure we're bridging the right server
    if (discordServer !== msg.guild.name) {
      continue;
    }
    // Use a regexp to match messages of the form
    // [tag OR -c class] [-i instance] message, which we pass onto zephyr
    // Capture groups:
    // 1 - whole class prefix:      [tag OR -c class]
    // 2 - class prefix content:    tag OR -c class
    // 3 - class name:              class
    // 4 - whole instance prefix:   [-i instance]
    // 5 - instance name:           instance
    // 6 - message:                 message, which we pass onto zephyr
    const prefixMatching = msg.cleanContent
      .trim()
      .match(/^(\[(-c\s+(.*?)|[^-].*?)\]\s*)?(\[-i\s+(.*?)\]\s*)?(.*)/ms);

    if (!prefixMatching) {
      matching.push({
        zclass: zephyrClass,
        zinstance:
          msg.channel.name === discordFallbackChannel
            ? activeInstancesForFallbackChannels[discordServer]
            : msg.channel.name,
        zcontent: msg.cleanContent
      });
      continue;
    }
    // Destructuring as per capture groups:
    const [
      _entireMessage,
      // 1 - whole class prefix:      [tag OR -c class]
      classTagWhole,
      // 2 - class prefix content:    tag OR -c class
      classTagContent,
      // 3 - class name:              class
      classTagName,
      // 4 - whole instance prefix:   [-i instance]
      instanceTagWhole,
      // 5 - instance name:           instance
      instanceTagName,
      // 6 - message:                 message, which we pass onto zephyr
      restOfMessage
    ] = prefixMatching;
    // If prefixes are present, we need to work a bit to
    // decipher them

    // If a literal class is provided, use it
    const zclass =
      classTagName in zephyrRelatedClasses
        ? classTagName
        : // Otherwise, use a shorthand
          Object.keys(zephyrRelatedClasses).find(
            cls => zephyrRelatedClasses[cls] === classTagContent
          ) ||
          // or just the server name
          zephyrClass;

    // Literal instance, the channel name
    let zinstance = instanceTagName || msg.channel.name;
    if (msg.channel.name === discordFallbackChannel) {
      // If we're on the fallback channel, use the presence of
      // instanceTagName to update the activeInstancesForFallbackChannels
      // and then assign zinstance accordingly
      if (instanceTagName) {
        updateActiveInstance(
          discordServer,
          discordFallbackChannel,
          instanceTagName
        );
      }
      zinstance = activeInstancesForFallbackChannels[discordServer];
    }

    // If an unmatched literal class was used,
    // note it in the zephyr message
    const relatedClassPrefix =
      classTagName in zephyrRelatedClasses ||
      Object.keys(zephyrRelatedClasses).find(
        cls => zephyrRelatedClasses[cls] === classTagContent
      )
        ? ""
        : classTagWhole || "";
    const zcontent = relatedClassPrefix + restOfMessage;

    matching.push({ zclass, zinstance, zcontent });
  }

  // Log what comes out, noting whether we're ignoring a message
  // due to a bad match or not
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

  // Assemble a zsig from components
  const signature = [];

  // What activity is the user doing?
  const game = (msg.member || msg.author).presence.game;
  if (game && (game.url || game.name)) {
    signature.push(game.url || game.name);
  }

  // Prepare an eternal invitation to put in the zsig
  const invite = await msg.channel
    .createInvite({ maxAge: 0 })
    .catch(err => console.error(err));

  // If no invite, just push "Discord"
  signature.push((invite && invite.url) || "Discord");

  // For all matches, actually send the message!
  for (const { zclass, zinstance, zcontent } of matching) {
    const content = [];
    if (zcontent.trim()) {
      content.push(wordwrap(zcontent));
    }
    // For each attachment, append the url to the Discord CDN,
    // so zephyr users can click
    for (const attach of msg.attachments.values()) {
      content.push(attach.url);
    }
    zephyr.send(
      {
        class: zclass,
        instance: zinstance,
        opcode: "discord", // special discord opcode, important!
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

// And we're off to the races!
client.login(settings.discordToken);
