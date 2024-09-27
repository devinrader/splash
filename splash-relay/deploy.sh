echo "Checking node.js installation"
if command -v node &>/dev/null; then
  echo "node.js installation found"
else
  echo "node.js installation not found. Please install node.js."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  command -v nvm
  nvm install node
fi

npm install pm2@latest -g
pm2 update
pm2 start /home/devinrader/splash/splash-relay/ecosystem.config.js
pm2 save
