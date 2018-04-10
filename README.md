# Zygarde: A Discord-to-Zephyr bridge

<img src="https://cdn.bulbagarden.net/upload/9/93/718Zygarde-Cell.png" width="200">

## Installation

Running from Athena is probably easiest. If you don't have sustained Athena access, ask dannybd to add your server + classes to his config file.

Adapted from justinej's notes:

```
ssh KERBEROS@apollo-dome-landing.mit.edu
# Ensure that the script persists even after you exit your terminal
tmux

# Put Zygarde somewhere
mkdir -p ~/scripts
cd ~/scripts
git clone https://github.com/dannybd/zygarde
cd zygarde
```

At this point you can run `./run` and it'll walk you through the remaining steps:

* Symlinking to node stuff
* Running Zygarde from tmux or screen
* Adding `settings.js` from a template

It'll also warn you if you fail to set up an authentication token properly.

To set up `settings.js`, follow the instructions inside it.
```
nano settings.js # Control+X, then press Y to save and exit
```

And to run everything, call `./run`.

## Usage

Once you've set everything up, you should see zephyr classes (and their related classes) map into your Discord server.

### Class & Instance Tags
Because Discord doesn't map 1:1 with Zephyr's classes and instances, messages within Discord can appear with prefix tags which indicate where they map to. These are both read and write: if you compose a message in Discord with these tags, your message will appear on the corresponding class and instance in zephyrland, as long as the class you mentioned is a related class (think unclass or .d class)

Examples (assume we're linking `-c foobar` and its related classes `unfoobar` and `foobar.d`):
```
From Zephyr:
  foobar / hello / aphacker
    What's up?
To Discord:
  foobar / general / aphacker
    [-i hello] What's up?
```

There wasn't a corresponding `hello` channel on the Discord server, so aphacker's message ended up in `#general`, but prefixed with an instance tag.

```
From Discord:
  foobar / general / wbrogers
    Not much, you?
To Zephyr:
  foobar / general / wbrogers
    Not much, you?
```

Oh no, wbrogers' reply from Discord ends up cross zephyr instances, at `-i general`! To prevent this, wbrogers can use that same tag:
```
From Discord:
  foobar / general / wbrogers
    [-i hello] (i-mix) Not much, you?
To Zephyr:
  foobar / hello / wbrogers
    (i-mix) Not much, you?
```

The instance tag is silently stripped from the reply.

Related classes behave similarly, with a class tag which MUST precede the instance tag (if there is an instance tag):

```
From Zephyr:
  unfoobar / hello / aphacker
    Having an easy time with your fancy new chat client, aren't you?
To Discord:
  foobar / general / aphacker
    [-c unfoobar] [-i hello] Having an easy time with your fancy new chat client, aren't you?


From Discord:
  foobar / general / wbrogers
    [-c unfoobar] [-i hello] Quiet, you.
To Zephyr:
  unfoobar / hello / wbrogers
    Quiet, you.
```

Since having the full classname is kind of tedious, in `settings.js` you can configure per-related-class tags, which can act as shorthand:
```
// settings.js

module.exports.classes = [
  {
    zephyrClass: 'foobar',
    discordServer: 'foobar',
    zephyrRelatedClasses: {
      'unfoobar': 'un',
      'foobar.d': '.d'
    },
  },
];
```

With that in place, you can replace the `-c` tag with the shorthand tag:

```
From Zephyr:
  unfoobar / hello.d / aphacker
    Are we going to have all of our discussions saved for posterity in this README?
To Discord:
  foobar / general / aphacker
    [un] [-i hello.d] Are we going to have all of our discussions saved for posterity in this README?


From Discord:
  foobar / general / wbrogers
    [un] [-i hello.d] Probably not, I bet dannybd is getting tired.
To Zephyr:
  unfoobar / hello.d / wbrogers
    Probably not, I bet dannybd is getting tired.
```

Hopefully you get the idea.

---------------------------

cesium's notes:

This isn't a very good README.

1. If you're on Athena, you may be able to run it out of `/mit/cesium/zygarde/run.sh`. You'll still need to do the three following steps to set up Discord integration. The `settings.js` file will go in the current working directory when you run `run.sh`.
1. Otherwise, clone this repo and run `npm install` in this directory to get the dependencies. You'll probably get build errors due to missing headers; you'll specifically need the zephyr headers to build the zephyr module. How you install these depends on your OS/distro: on Debian/Ubuntu, for example, `apt-get build-dep zephyr` should help. Unfortunately, distros tend to be bad at packaging Node, so you may also have to struggle a bit to get an up-to-date version.
1. Get a [Discord API token](https://discordjs.guide/#/preparations/setting-up-a-bot-application).
1. Copy `settings.template.js` to `settings.js`. Fill in your token and the list of connections you want.
1. [Add the bot](https://discordjs.guide/#/preparations/adding-your-bot-to-servers) to your server. You'll want to add `&permissions=536890385` or similar to the URL so the bot can generate invites and change its name, though it will fall back gracefully to some degree if it can't.
1. Run the bot with `node zygarde.js`. Unfortunately, since zephyr doesn't deal with NATs well, you likely want to be on the MIT network, or at least have a public IP, for the zephyr half to not immediately time out. We sure made some life choices hanging on to an 80's-era chat protocol, huh?
- The bot does not understand unclasses or other modifications of the class or instance. Each zephyr instance maps to a Discord channel, unless there is no channel named exactly the same thing, in which case it goes to a default channel (usually the first one, but configurable as the one labeled `new member messages channel` in Discord server settings). If you really want your bot to be able to create arbitrary numbers of channels, that would also be doable.
- When bridging, all Discord messages from BOTs and all zephyr messages with opcodes are ignored. This prevents loops from forming, but it would also prevent you from chaining bridges or getting other Discord/zephyr bots onto zephyr/Discord, if for some reason you want that.
- Sent zephyrs have their signature set to an invite link. You can deny the bot the invite permission to disable this. Invites are per-channel, so the link will be different per instance, but they all go to the same Discord server so there's no real benefit to that. The bot will also rename itself in each Discord server on startup according to the corresponding zephyr class; you can rename it manually and it will stick until the bot restarts.
- The name Zygarde is sort of the closest thing that vaguely sounds like Discord and has a Z in it. Last time I got to use Zirconium, but I guess people don't use IRC anymore.

