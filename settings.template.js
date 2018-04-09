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

    // Optional: An mapping of related zephyr classes.
    // These will be displayed in the same instances as the main class,
    // but with a context-providing tag in front. The keys are the
    // zephyr classes, and the values are the contextual tag.
    // Make sure these are unique in the mapping, so you can use the
    // zephyr class shorthand on the Discord side.
    // If you don't want this behavior, leave the mapping blank.
    // Do not start the tag with a hyphen (-).
    // Useful for unclasses and .d classes.
    zephyrRelatedClasses: {
      'unzephyr-class': 'un',
      'zephyr-class.d': '.d',
      'zephyr-class.auto': '',
    },
  },
];
