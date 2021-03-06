const zephyr = require("zephyr");
const discord = require("discord.js");
const wordwrap = require("wordwrap")(70);
const settingsPath = require("path").resolve(__dirname, "settings");
let settings = require(settingsPath);

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

// Holds the state of which instances are active on the Discord
// servers.
let activeInstances = {};

const updateActiveInstance = (server, channel, instance) => {
  if (!activeInstances[server]) {
    activeInstances[server] = {};
  }
  activeInstances[server][channel] = instance;
  console.log(
    `\x1b[34;1mDiscord: ${server} #${channel}\x1b[0m ` +
      `active instance set to: ${instance}`
  );
};

const client = new discord.Client({ disableEveryone: true });

// Subscribe to all zephyr classes, both the main bridged class and
// its related classes, via the triplet <c,*,*>
const loadSubs = settings => {
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
};

loadSubs(settings);

client.on("ready", () => {
  for (const guild of client.guilds.values()) {
    const matching = settings.classes.filter(
      ({ discordServer }) => discordServer == guild.name
    );

    // Set the bot's nickname to '-c class'
    const nickname = matching.length
      ? "-c " + matching.map(({ zephyrClass }) => zephyrClass).join(", ")
      : "";

    // Don't bother changing the nickname if it's already correctly
    // set to what we want it to be
    if (nickname ? guild.me.nickname != nickname : guild.me.nickname) {
      guild.me.setNickname(nickname).catch(err => console.error(err));
    }

    const textChannels = Array.from(guild.channels.values()).filter(
      chan => chan.type === "text"
    );

    // Set up instance matching patterns and channels.
    for (const server of matching) {
      // initialize patterns and channels if necessary
      if (!server.patterns || !server.channels) {
        server.patterns = [];
        server.channels = [];
      }
      if (server.instanceMap) {
        for (const { pattern, channel } of server.instanceMap) {
          server.patterns.push(RegExp(`^(${pattern})(\\..*)*$`));
          const chan = textChannels.find(chan => chan.name === channel);
          server.channels.push(chan);
          if (chan === undefined) {
            console.warn(`  !! Warning! channel name ${channel} not found.`);
          }
        }
      }
    }
  }

  // Bot is 'Listening to Zephyr'
  client.user.setActivity("Zephyr", { type: "LISTENING" });
});

const matchChannel = (instance, patterns, channels) => {
  const i = patterns.findIndex(pat => pat.test(instance));
  return i === undefined ? undefined : channels[i];
};

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
  let message = msg.message;
  if (
    !message.trim() ||
    IGNORE_OPCODES.includes(msg.opcode.toLowerCase())
  ) {
    return;
  }

  if (msg.opcode.toLowerCase() == "rot13") {
    message = "||" + rot13(message) + "||";
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
    patterns,
    channels,
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
      const textChannels = Array.from(guild.channels.values()).filter(
        chan => chan.type === "text"
      );
      const channel =
        // First look for the channel matching literally,
        // modulo a `.d` or something appended to the end
        textChannels.find(chan =>
          new RegExp(`^${chan.name}(\\..*)?$`).test(instance)
        ) ||
        // If not, match it against the list of patterns
        matchChannel(instance, patterns, channels) ||
        // If not, grab the designated fallback Discord channel
        textChannels.find(chan => chan.name === discordFallbackChannel) ||
        // If not, go for the default "join message channel"
        guild.systemChannel ||
        // Worst case, grab the first text channel we can get
        textChannels[0];
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
      (activeInstances[discordServer]
        ? activeInstances[discordServer][channel.name]
        : channel.name) !== instance
    ) {
      updateActiveInstance(discordServer, channel.name, instance);
      instancePrefix = `[-i ${instance}] `;
    }
    // [tag OR -c class] [-i instance] message
    message = relatedClassPrefix + instancePrefix + message;

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
  const sender = (msg.member
    ? msg.member.displayName
    : msg.author.username
  ).replace(/ /g, "-");

  // take a str, and remove all []-delimited tokens
  // matching any of the passed regexes. stop
  // parsing once we encounter a non whitespace, non-[
  // character outside of a bracket
  //
  // regexes should be an object of the form
  // { label: regex }. the returned prefixes will
  // be an object of the form { label: prefix },
  // where `prefix` is the first prefix matching `regex`.
  // only this match is filtered from str.
  //
  // returns [filteredStr, prefixes]
  function tokenizePrefixes(str, regexes) {
    let prefixes = {};
    let newStr = "";
    let prefix = "";
    let depth = 0;
    let justFinished = false;
    // run through the chars of str, with index;
    // hence for-in, not for-of
    mainLoop: for (let i in str) {
      let foundMatch = false;
      const char = str[i];
      switch (char) {
        case "[":
          depth += 1;
          if (depth > 1) {
            prefix += "[";
          }
          break;
        case "]":
          depth -= 1;
          if (depth > 0) {
            prefix += "[";
          } else if (depth === 0) {
            for (let label in regexes) {
              if (label in prefixes) {
                continue;
              }
              let match = prefix.match(regexes[label]);
              if (match) {
                prefixes[label] = match;
                foundMatch = true;
              }
            }
            if (!foundMatch) {
              newStr += `[${prefix}]`;
            }
            prefix = "";
          }
          break;
        case " ":
          // gobble a string if we *just* matched a bracket
          if (justFinished) {
            break;
          }
        // fallthrough
        case "\n":
          if (depth > 0) {
            prefix += char;
          } else {
            newStr += char;
          }
          break;
        default:
          if (depth > 0) {
            prefix += char;
          } else {
            newStr += str.substring(i);
            break mainLoop;
          }
      }

      // did we *just* finish a bracket?
      justFinished = char === "]" && depth === 0 && foundMatch;
    }

    return [newStr, prefixes];
  }

  //tokenizePrefixes('[-i inst] foo bar  baz', {inst: /-i (.+)/})

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

    let prefixRegexes = {
      class: /-c (.+)/,
      instance: /-i (.+)/
    };

    // push all of the related class regexes, too
    for (const classTagName in zephyrRelatedClasses) {
      prefixRegexes[classTagName] = new RegExp(
        zephyrRelatedClasses[classTagName].replace(
          /[.*+?^${}()\[\]|\\]/g,
          "\\$&"
        )
      );
    }

    const [msgText, prefixes] = tokenizePrefixes(
      msg.cleanContent.trim(),
      prefixRegexes
    );

    let zclass =
      // if a literal class is provided, use it.
      prefixes.class
        ? prefixes.class[1]
        : // otherwise, use a shorthand
          Object.keys(zephyrRelatedClasses).find(cls => cls in prefixes) ||
          // or just the server name
          zephyrClass;

    // Literal instance, the channel name
    const literalInstance = prefixes.instance ? prefixes.instance[1] : null;
    const zinstance =
      literalInstance ||
      (activeInstances[discordServer] &&
        activeInstances[discordServer][msg.channel.name]) ||
      msg.channel.name;
    // Use the presence of literalInstance to update the
    // activeInstances.
    if (literalInstance) {
      updateActiveInstance(discordServer, msg.channel.name, literalInstance);
    }

    const zcontent = parseSpoilers(msgText);

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
  const { game, status } = (msg.member || msg.author).presence;
  if (game) {
    if (game.type != 4) { signature.push(game.name); }
    if (game.state) { signature.push(game.state); }
    if (game.details) { signature.push(game.details); }
    if (game.url) { signature.push(game.url); }
  }

  if (status && !["online", "idle", "offline", "dnd"].includes(status)) {
    signature.push(status);
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

function parseSpoilers(msg) {
  let pipe_one = false;
  let escape = false;
  let code = false;
  let spoiler = false;
  let substrings = [0];
  for (let i in msg) {
    const char = msg[i]
    // this isn't a perfectly accurate model, but it probably doesn't have any
    // false negatives
    switch (char) {
      case "\\":
        escape = !escape;
        pipe_one = false;
        break;
      case "`":
        if (code) {
          code = false;
        } else if (!escape && !spoiler) {
          code = true;
        }
        escape = false;
        break;
      case "|":
        if (spoiler) {
          if (pipe_one) {
            pipe_one = false;
            spoiler = false;
            substrings.push(i);
          } else {
            pipe_one = true;
          }
        } else {
          if (pipe_one) {
            pipe_one = false;
            spoiler = true;
            substrings.push(i);
          } else if (!escape && !code) {
            pipe_one = true;
          }
        }
        escape = false;
        break;
      default:
        escape = false;
        break;
    }
  }

  const newMsg = [];
  let i = 2;
  for (; i < substrings.length; i += 2) {
    let plain_sec = msg.substring(substrings[i-2], substrings[i-1]);
    let spoiler_sec = msg.substring(substrings[i-1], substrings[i]);
    newMsg.push(plain_sec);
    newMsg.push(rot13(spoiler_sec));
  }
  if (i == substrings.length) {
    // the last spoiler was incomplete; add the preceding plaintext and the
    // spoiler, all as plaintext
    newMsg.push(msg.substring(substrings[i-2]));
  } else {
    // went all the way to the end; just add the plaintext after the last
    // spoiler
    newMsg.push(msg.substring(substrings[i-2]));
  }

  return newMsg.join("");
}

function rot13(text) {
  let rotated = "";
  for (const i in text) {
    let ch = text.charCodeAt(i);
    if ((65 <= ch && ch <= 77) || (97 <= ch && ch <= 109)) {
      // first half alphabet; increase by 13
      rotated += String.fromCharCode(ch + 13);
    } else if ((78 <= ch && ch <= 90) || (110 <= ch && ch <= 122)) {
      // second half alphabet; decrease by 13
      rotated += String.fromCharCode(ch - 13);
    } else {
      // nonalphabetic; no change
      rotated += String.fromCharCode(ch);
    }
  }
  return rotated;
}

process.stdin.setEncoding("utf8");

process.stdin.on("readable", () => {
  const chunk = process.stdin.read();
  if (chunk !== null && chunk.startsWith("r")) {
    console.log("Rebooting...");
    client.destroy().then(() => {
      delete require.cache[require.resolve(settingsPath)];
      settings = require(settingsPath);
      loadSubs(settings);
      client.login(settings.discordToken);
    });
  }
});

// And we're off to the races!
client.login(settings.discordToken);
