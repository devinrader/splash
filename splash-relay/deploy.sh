echo "Checking node.js installation"
which node >/dev/null

if which node >/dev/null
  then
    echo "node.js installation found"
  else
    echo "node.js installation not found. Please install node.js."
    sudo apt update && sudo apt install -y nodejs npm   
  fi

npm install pm2@latest -g
pm2 update
pm2 start ~/splash/splash-relay/ecosystem.config.js
pm2 save
