echo "Checking node.js installation"
if which node >/dev/null
  then
    echo "node.js installation found"
    echo $NVM_DIR
  else
    echo "node.js installation not found. Please install node.js."
    
    touch ~/.bash_profile
    
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    
    export NVM_DIR="$HOME/.nvm"
    echo $NVM_DIR
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

    command -v nvm

    nvm install node
  fi

npm install pm2@latest -g
pm2 update
pm2 start /home/devinrader/splash/splash-relay/ecosystem.config.js
pm2 save
