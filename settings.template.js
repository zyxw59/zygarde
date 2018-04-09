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
    // connectionDirection: '<',

    // Optional: An array of related zephyr classes.
    // These will be displayed in the same instances as the main class,
    // but with a context-providing tag in front.
    // Useful for unclasses and .d classes.
    // zephyrRelatedClasses: ['unzephyr-class', 'zephyr-class.d'],
  },
];
