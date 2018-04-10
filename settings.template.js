// You'll need to get a Discord token.
// Go here: https://discordjs.guide/#/preparations/setting-up-a-bot-application
//
// Create an app and then a bot to get a token. Add that token below.
//
// Then, add your bot to your Discord server(s):
// https://discordapp.com/oauth2/authorize?permissions=536890385&scope=bot&client_id=CLIENT_ID
// where CLIENT_ID is the "Client ID" from the app that you made.
module.exports.discordToken = '???';

// Each element of this list describes the configuration for
// a single Discord server / zephyr class pairing.
module.exports.classes = [
  {
    // Main zephyr class name
    zephyrClass: 'zephyr-class',

    // The display name (not the numeric code) of the Discord server
    discordServer: 'Discord Server',

    // Optional: connection direction.
    //   '>' means one-directional from zephyr to Discord
    //   '<' means one-directional from Discord to zephyr
    //
    // connectionDirection: '<',

    // Optional: a fallback Discord channel
    // This is the name of your fallback Discord channel
    // for catching incoming messages from zephyr with unassigned
    // instances. This also adds support for "active instances":
    // if you set an instance with [-i foobar] in this fallback channel,
    // it will persist as the destination instance for that channel,
    // until it changes or the bridge is restarted. Incoming zephyrgrams
    // on other instances which land in the fallback channel will update
    // the active instance.
    //
    // discordFallbackChannel: 'general',

    // Optional: An mapping of related zephyr classes.
    // These will be displayed in the same instances as the main class,
    // but with a context-providing tag in front. The keys are the
    // zephyr classes, and the values are the contextual tag.
    //
    // Example: Messages prefixed with [un] would go to
    // -c unzephyr-class, in the case outlined below.
    // From Discord, try:
    //   [un][-i test] Sending a test message
    //
    // Make sure these are unique in the mapping, so you can use the
    // zephyr class shorthand on the Discord side.
    // If you don't want this behavior, leave the mapping blank.
    // Do not start the tag with a hyphen (-).
    // Useful for unclasses and .d classes.
    //
    // zephyrRelatedClasses: {
    //   'unzephyr-class': 'un',
    //   'zephyr-class.d': '.d',
    //   'zephyr-class.auto': '',
    // },
  },
];
