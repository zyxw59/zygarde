DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check for node
if [ ! -d "$DIR/node" ]; then
  echo "Adding node and node modules from cesium's locker..."
  echo "(...it's easier this way.)"
  rsync --info=progress2 -r /mit/cesium/zygarde/node/* $DIR/node/
  rsync --info=progress2 -r /mit/cesium/zygarde/node_modules/* $DIR/node_modules/
  echo "Done!"
fi

# Check for settings.js
if [ ! -f "$DIR/settings.js" ]; then
  echo "Warning: You haven't yet created settings.js!"
  echo "Adding it from a template..."
  cp $DIR/settings.template.js $DIR/settings.js
  echo "...done."
  echo "It still needs configuration before Zygarde will work."
  echo "Open it in an editor and follow the instructions within."
  exit 1
fi

# Check for screen/tmux
if [[ ! "$TERM" =~ "screen".* ]]; then
  echo "Warning: You're not running this in a screen or tmux session!"
  echo "The bridge will stop working as soon as you sign out."
  echo "To fix this, launch 'tmux' first, then run this script."
fi

echo "Running Zygarde..."
env PATH=$DIR/node/bin:$PATH node $DIR/zygarde.js
