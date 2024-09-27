echo "Checking node.js installation"
which node >/dev/null
which npm >/dev/null

if which node >/dev/null
  then
    echo "node.js installation found"
  else
    echo "node.js installation not found. Install node.js and npm."
    sudo apt install -y ca-certificates curl gnupg
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/nodesource.gpg
    NODE_MAJOR=20
    echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
    sudo apt update
    sudo apt install nodejs
    node -v
  fi

npm install pm2@latest -g
pm2 update
pm2 start ~/splash/splash-relay/ecosystem.config.js
pm2 save
